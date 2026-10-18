import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateCasimirDpProposalReadiness } from "../shared/casimir-dp-proposal-readiness";
import { CasimirDpProposalClosureConfig } from "../shared/contracts/casimir-dp-proposal-closure.v1";
import {
  CASIMIR_DP_PROPOSAL_CLOSURE_RUN_ORDER,
  buildCasimirDpProposalClosureReport,
  renderCasimirDpProposalClosureMarkdown,
} from "../scripts/research/run-casimir-dp-proposal-closure";

const configPath = path.resolve(process.cwd(), "configs/research/casimir-dp-proposal-closure.v1.json");
const rawConfig = readFileSync(configPath);
const config = CasimirDpProposalClosureConfig.parse(JSON.parse(rawConfig.toString("utf8")));

describe("Casimir-DP proposal closure", () => {
  it("freezes a transverse, sample-and-hold architecture in dependency order", () => {
    expect(config.run_order).toEqual([...CASIMIR_DP_PROPOSAL_CLOSURE_RUN_ORDER]);
    expect(config.architecture.branch_orientation).toBe("transverse_to_surface_normal");
    expect(config.architecture.boundary_operation).toBe("randomized_sample_and_hold_between_shots");
    expect(config.architecture.force_calibrator).toBe("independent_cofabricated_nanomechanical_reference");
    expect(config.commissioning.map((stage) => stage.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("passes proposal completeness without promoting hardware or mechanism evidence", () => {
    const readiness = evaluateCasimirDpProposalReadiness(config);
    expect(readiness.gate_ledger.proposal_package).toBe("pass");
    expect(readiness.gate_ledger.commissioning_entry).toBe("conditional_pass");
    expect(readiness.gate_ledger.measured_optical_and_surface_response).toBe("not_ready");
    expect(readiness.gate_ledger.finite_geometry_boundary_contrast).toBe("not_ready");
    expect(readiness.gate_ledger.collapse_identification).toBe("blocked");
    expect(readiness.gate_ledger.manifold_dynamics).toBe("blocked");
    expect(readiness.promotion_allowed).toBe(false);
    expect(readiness.systematics.registered_count).toBe(12);
    expect(Object.values(readiness.contracts).every((status) => status === "pass")).toBe(true);
    expect(readiness.inference.main_paired_windows).toBeGreaterThanOrEqual(
      readiness.inference.required_paired_windows,
    );
  });

  it("enforces cross-field preregistration invariants", () => {
    const mutated = JSON.parse(JSON.stringify(config));
    mutated.synchronization_contract.maximum_clock_skew_s = 0.002;
    const result = CasimirDpProposalClosureConfig.safeParse(mutated);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) =>
        issue.path.join(".") === "synchronization_contract.maximum_clock_skew_s"
      )).toBe(true);
    }
  });

  it("computes the reference force and exposes the phase-stability risk", () => {
    const readiness = evaluateCasimirDpProposalReadiness(config);
    expect(readiness.architecture.particle_mass_kg).toBeCloseTo(3.8877e-18, 4);
    expect(readiness.reference_physics.c4_J_m4).toBeCloseTo(3.20625e-49, 5);
    expect(readiness.reference_physics.casimir_polder_force_N).toBeCloseTo(-4.104e-22, 4);
    expect(readiness.phase_stability.maximum_differential_force_noise_N).toBeCloseTo(5.2729e-27, 4);
    expect(readiness.phase_stability.status).toBe("high_risk_commissioning_requirement");
  });

  it("fails proposal completeness when a systematic family is duplicated", () => {
    const mutated = structuredClone(config);
    mutated.systematics[mutated.systematics.length - 1] = structuredClone(mutated.systematics[0]);
    const readiness = evaluateCasimirDpProposalReadiness(mutated);
    expect(readiness.systematics.coverage_gate).toBe("not_ready");
    expect(readiness.systematics.missing_families).toContain("analysis_drift_and_label_leakage");
    expect(readiness.gate_ledger.proposal_package).toBe("not_ready");
  });

  it("renders a hashed report with explicit claim ceilings", () => {
    const report = buildCasimirDpProposalClosureReport({
      config,
      configSha256: createHash("sha256").update(rawConfig).digest("hex"),
      now: new Date("2026-07-21T00:00:00.000Z"),
    });
    const markdown = renderCasimirDpProposalClosureMarkdown(report);
    expect(report.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(markdown).toContain("The package can enter commissioning");
    expect(markdown).toContain("Machine-validated preregistration contracts");
    expect(markdown).toContain("unexplained boundary-conditioned residual");
    expect(markdown).toContain("No manifold-response rate is computed");
  });
});
