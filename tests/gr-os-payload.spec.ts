import { beforeEach, describe, expect, it } from "vitest";
import type { GrEvaluation } from "../shared/schema";
import { grOsPayloadSchema } from "../shared/schema";
import type { GrPipelineDiagnostics } from "../server/energy-pipeline";
import { buildGrOsPayload } from "../server/gr/gr-os-payload";
import {
  __resetGrOsPayloadStore,
  getGrOsPayloads,
  recordGrOsPayload,
} from "../server/services/observability/gr-os-payload-store";

type EvaluationOverrides = Partial<
  Omit<GrEvaluation, "policy" | "gate" | "certificate" | "residuals">
> & {
  policy?: Partial<GrEvaluation["policy"]> & {
    gate?: Partial<GrEvaluation["policy"]["gate"]>;
    certificate?: Partial<GrEvaluation["policy"]["certificate"]>;
  };
  gate?: Partial<GrEvaluation["gate"]>;
  certificate?: Partial<GrEvaluation["certificate"]>;
  residuals?: Partial<GrEvaluation["residuals"]>;
};

const makeEvaluation = (
  pass: boolean,
  overrides: EvaluationOverrides = {},
): GrEvaluation => {
  const base: GrEvaluation = {
    kind: "gr-evaluation",
    updatedAt: Date.now(),
    policy: {
      gate: {
        version: 1,
        source: "default",
        thresholds: { H_rms_max: 1, M_rms_max: 1 },
        policy: { mode: "hard-only", unknownAsFail: true },
      },
      certificate: {
        admissibleStatus: "ADMISSIBLE",
        allowMarginalAsViable: false,
        treatMissingCertificateAsNotCertified: true,
      },
    },
    residuals: {
      H_rms: 0.01,
      M_rms: 0.02,
      H_maxAbs: 0.1,
      M_maxAbs: 0.2,
    },
    gate: {
      status: pass ? "pass" : "fail",
      evaluatedAt: Date.now(),
      thresholds: { H_rms_max: 1, M_rms_max: 1 },
      policy: { mode: "hard-only", unknownAsFail: true },
    },
    constraints: [],
    certificate: {
      status: pass ? "ADMISSIBLE" : "REJECTED",
      admissibleStatus: "ADMISSIBLE",
      hasCertificate: true,
      certificateHash: null,
      certificateId: null,
      integrityOk: true,
    },
    pass,
  };

  return {
    ...base,
    ...overrides,
    residuals: { ...base.residuals, ...(overrides.residuals ?? {}) },
    gate: { ...base.gate, ...(overrides.gate ?? {}) },
    certificate: { ...base.certificate, ...(overrides.certificate ?? {}) },
    policy: {
      gate: { ...base.policy.gate, ...(overrides.policy?.gate ?? {}) },
      certificate: {
        ...base.policy.certificate,
        ...(overrides.policy?.certificate ?? {}),
      },
    },
    constraints: overrides.constraints ?? base.constraints,
  };
};

const makeDiagnostics = (): GrPipelineDiagnostics => ({
  updatedAt: Date.now(),
  source: "gr-evolve-brick",
  grid: {
    dims: [2, 2, 2],
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    voxelSize_m: [1, 1, 1],
    time_s: 0,
    dt_s: 0.1,
  },
  solver: {
    steps: 4,
    iterations: 2,
    tolerance: 0.01,
    cfl: 0.5,
  },
  constraints: {
    H_constraint: { min: -0.1, max: 0.1, maxAbs: 0.1, rms: 0.05 },
    M_constraint: {
      rms: 0.05,
      maxAbs: 0.1,
      components: {
        x: { min: -0.05, max: 0.05, maxAbs: 0.05, rms: 0.02 },
        y: { min: -0.05, max: 0.05, maxAbs: 0.05, rms: 0.02 },
        z: { min: -0.05, max: 0.05, maxAbs: 0.05, rms: 0.02 },
      },
    },
  },
});

describe("gr-os payload", () => {
  beforeEach(() => {
    __resetGrOsPayloadStore();
  });

  it("builds a contract-valid payload with certified stage", () => {
    const payload = buildGrOsPayload({
      evaluation: makeEvaluation(true),
      diagnostics: makeDiagnostics(),
      essenceId: "essence:test",
    });

    expect(grOsPayloadSchema.parse(payload)).toBeTruthy();
    expect(payload.stage).toBe("certified");
    expect(payload.constraints?.status).toBe("PASS");
    expect(payload.actions.length).toBe(0);
  });

  it("flags hard failures and gate failures with halt actions", () => {
    const hardFail: GrEvaluation["constraints"][number] = {
      id: "BSSN_H_rms",
      severity: "HARD",
      status: "fail",
      value: 0.02,
      limit: "<= 0.01",
    };
    const evaluation = makeEvaluation(false, {
      constraints: [hardFail],
      certificate: { status: "INADMISSIBLE" },
    });

    const payload = buildGrOsPayload({
      evaluation,
      diagnostics: makeDiagnostics(),
      essenceId: "essence:test",
    });

    expect(payload.stage).toBe("diagnostic");
    expect(payload.constraints?.status).toBe("FAIL");
    expect(payload.constraints?.hard_fail_ids).toContain("BSSN_H_rms");
    const reasons = payload.actions.map((action) => action.reason);
    expect(reasons).toContain("constraint_gate_failed");
    expect(reasons).toContain("hard_constraints_failed");
    expect(reasons).toContain("certificate_status_not_admissible");
  });

  it("downgrades to reduced-order when diagnostics are missing", () => {
    const payload = buildGrOsPayload({
      evaluation: makeEvaluation(true),
    });

    expect(payload.stage).toBe("reduced-order");
    expect(payload.actions.map((action) => action.reason)).toContain(
      "missing_diagnostics",
    );
  });

  it("throttles on soft constraint failures", () => {
    const softFail: GrEvaluation["constraints"][number] = {
      id: "TS_ratio_min",
      severity: "SOFT",
      status: "fail",
      value: 1.2,
      limit: ">= 1.5",
    };
    const payload = buildGrOsPayload({
      evaluation: makeEvaluation(true, { constraints: [softFail] }),
      diagnostics: makeDiagnostics(),
      essenceId: "essence:test",
    });

    expect(payload.stage).toBe("reduced-order");
    expect(payload.constraints?.status).toBe("WARN");
    const reasons = payload.actions.map((action) => action.reason);
    expect(reasons).toContain("soft_constraints_failed");
  });

  it("records telemetry snapshots for payloads", () => {
    const payload = buildGrOsPayload({
      evaluation: makeEvaluation(true),
      diagnostics: makeDiagnostics(),
      essenceId: "essence:test",
    });
    const record = recordGrOsPayload({
      stage: payload.stage,
      pass: true,
      constraints_status: payload.constraints?.status,
      viability_status: payload.viability?.status,
      certificate_hash: payload.viability?.certificate_hash ?? null,
      integrity_ok: payload.viability?.integrity_ok,
      essence_id: "essence:test",
      payload,
    });

    const list = getGrOsPayloads(5);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(record.id);
    expect(list[0].constraints_status).toBe(payload.constraints?.status);
    expect(list[0].viability_status).toBe(payload.viability?.status);
    expect(list[0].payload.schema_version).toBe("gr-os/0.1");
  });
});
