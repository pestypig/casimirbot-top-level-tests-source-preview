import { describe, expect, it } from "vitest";
import {
  runCasimirDpCrossScaleMetrologyStage4_2D,
} from "../scripts/research/run-casimir-dp-cross-scale-metrology-stage4-2d";

describe("Casimir-DP Stage-4.2D campaign", () => {
  it("executes the recovery and fail-closed fixture matrix without writing", async () => {
    const result =
      await runCasimirDpCrossScaleMetrologyStage4_2D({
        runId: "casimir-dp-cross-scale-metrology-stage4-2d-v1-test",
        generatedAt: "2026-07-28T16:00:00.000Z",
        writeArtifacts: false,
      });
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.integrity_gate).toBe("pass");
    expect(result.report.fixture_summary).toEqual({
      required: 10,
      executed: 10,
      passed: 10,
      all_pass: true,
    });
    expect(result.report.observable_bridge_edges_added).toBe(0);
  });

  it("is deterministic for a fixed run identity", async () => {
    const options = {
      runId: "casimir-dp-cross-scale-metrology-stage4-2d-v1-determinism",
      generatedAt: "2026-07-28T16:00:00.000Z",
      writeArtifacts: false,
    };
    const first =
      await runCasimirDpCrossScaleMetrologyStage4_2D(options);
    const second =
      await runCasimirDpCrossScaleMetrologyStage4_2D(options);
    expect(first.hashes).toEqual(second.hashes);
  });

  it("keeps empirical, collapse, manifold, and viability gates open", async () => {
    const result =
      await runCasimirDpCrossScaleMetrologyStage4_2D({
        runId: "casimir-dp-cross-scale-metrology-stage4-2d-v1-status",
        generatedAt: "2026-07-28T16:00:00.000Z",
        writeArtifacts: false,
      });
    expect(result.report.final_gates).toEqual({
      software_and_recovery_diagnostics: "pass",
      spectroscopic_response_authority: "not_ready",
      physical_pilot_readiness: "not_ready",
      measured_evidence: "not_ready",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
    });
    expect(result.receipt.downstream_verification).toEqual({
      status: "pending_external_verification",
      prior_stage4_2c_certificate_reused: false,
    });
  });
});
