import { describe, expect, it } from "vitest";
import {
  runCasimirDpMaxwellMacroscopicQedClosureStage4_2F,
} from "../scripts/research/run-casimir-dp-maxwell-macroscopic-qed-closure-stage4-2f";

describe("Casimir-DP Stage-4.2F campaign", () => {
  it("executes the closure and fail-closed fixture matrix", async () => {
    const result =
      await runCasimirDpMaxwellMacroscopicQedClosureStage4_2F({
        runId:
          "casimir-dp-maxwell-macroscopic-qed-closure-stage4-2f-v1-test",
        generatedAt: "2026-07-29T23:30:00.000Z",
        writeArtifacts: false,
      });
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.integrity_gate).toBe("pass");
    expect(result.report.fixture_summary).toEqual({
      required: 12,
      executed: 12,
      passed: 12,
      all_pass: true,
    });
    expect(result.report.observable_bridge_edges_added).toBe(0);
  });

  it("is deterministic for a fixed run identity", async () => {
    const options = {
      runId:
        "casimir-dp-maxwell-macroscopic-qed-closure-stage4-2f-v1-determinism",
      generatedAt: "2026-07-29T23:30:00.000Z",
      writeArtifacts: false,
    };
    const first =
      await runCasimirDpMaxwellMacroscopicQedClosureStage4_2F(options);
    const second =
      await runCasimirDpMaxwellMacroscopicQedClosureStage4_2F(options);
    expect(first.hashes).toEqual(second.hashes);
  });

  it("keeps empirical, apparatus, collapse, manifold, and viability gates open", async () => {
    const result =
      await runCasimirDpMaxwellMacroscopicQedClosureStage4_2F({
        runId:
          "casimir-dp-maxwell-macroscopic-qed-closure-stage4-2f-v1-status",
        generatedAt: "2026-07-29T23:30:00.000Z",
        writeArtifacts: false,
      });
    expect(result.report.final_gates).toMatchObject({
      software_and_equation_recovery: "pass",
      finite_geometry_maxwell_authority: "not_ready",
      candidate_transport_identity_authority: "not_ready",
      companion_detector_authority: "not_ready",
      companion_model_identity_authority: "not_ready",
      state_preparation_authority: "not_ready",
      quasistatic_modulation_authority: "not_ready",
      complete_apparatus_stress_energy: "not_ready",
      measured_evidence: "not_ready",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
    });
    expect(result.receipt.downstream_verification).toEqual({
      status: "pending_external_verification",
      prior_stage4_2e_certificate_reused: false,
    });
  });
});
