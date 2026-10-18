import { describe, expect, it } from "vitest";
import { evaluateGrConstraintGateFromMetrics } from "../server/gr/constraint-evaluator";

describe("gr constraint gate", () => {
  it("passes when only soft constraints fail under hard-only mode", () => {
    const evaluation = evaluateGrConstraintGateFromMetrics({
      H_rms: 0.005,
      M_rms: 0.0005,
      H_maxAbs: 0.5,
      M_maxAbs: 0.2,
    });
    expect(evaluation.gate.status).toBe("pass");
    const softFailures = evaluation.constraints.filter(
      (entry) => entry.severity === "SOFT" && entry.status === "fail",
    );
    expect(softFailures.length).toBeGreaterThan(0);
  });

  it("returns unknown when metrics are missing and unknownAsFail is false", () => {
    const evaluation = evaluateGrConstraintGateFromMetrics(
      { H_rms: 0.005 },
      { policy: { mode: "all", unknownAsFail: false } },
    );
    expect(evaluation.gate.status).toBe("unknown");
  });

  it("fails closed when hard diagnostics are unknown in strict policy", () => {
    const evaluation = evaluateGrConstraintGateFromMetrics({ H_rms: 0.005 });
    expect(evaluation.gate.status).toBe("fail");
    expect(evaluation.gate.policy.unknownAsFail).toBe(true);
    expect(evaluation.constraints.find((entry) => entry.id === "BSSN_M_rms")?.status).toBe("unknown");
  });

  it("fails when a hard constraint exceeds threshold", () => {
    const evaluation = evaluateGrConstraintGateFromMetrics({
      H_rms: 0.02,
      M_rms: 0.0005,
    });
    expect(evaluation.gate.status).toBe("fail");
  });

  it("captures admissible semiclassical residuals without hard fail", () => {
    const evaluation = evaluateGrConstraintGateFromMetrics(
      {
        H_rms: 0.005,
        M_rms: 0.0005,
        semiclassical_G_mu_nu_rms: 0.02,
        semiclassical_T_mu_nu_renorm_rms: 0.019,
        semiclassical_mismatch_rms: 0.001,
      },
      {
        semiclassical: {
          mismatchMax: 0.005,
          severity: "HARD",
          firstFailId: "TOE-002-SEMICLASSICAL-HARD-FAIL",
        },
      },
    );

    expect(evaluation.gate.status).toBe("pass");
    expect(evaluation.semiclassicalResiduals).toEqual({
      G_mu_nu_rms: 0.02,
      T_mu_nu_renorm_rms: 0.019,
      mismatch_rms: 0.001,
    });
    expect(evaluation.firstFailId).toBeUndefined();
  });

  it("emits deterministic first-fail id when semiclassical hard mismatch breaches limit", () => {
    const evaluation = evaluateGrConstraintGateFromMetrics(
      {
        H_rms: 0.005,
        M_rms: 0.0005,
        semiclassical_mismatch_rms: 0.02,
      },
      {
        semiclassical: {
          mismatchMax: 0.005,
          severity: "HARD",
          firstFailId: "TOE-002-SEMICLASSICAL-HARD-FAIL",
        },
      },
    );

    expect(evaluation.gate.status).toBe("fail");
    expect(evaluation.firstFailId).toBe("TOE-002-SEMICLASSICAL-HARD-FAIL");
    const mismatch = evaluation.constraints.find((entry) => entry.id === "SEMICLASSICAL_COUPLING_MISMATCH");
    expect(mismatch?.status).toBe("fail");
  });

});
