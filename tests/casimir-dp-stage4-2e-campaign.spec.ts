import { describe, expect, it } from "vitest";
import {
  runCasimirDpCausalConeClockStage4_2E,
} from "../scripts/research/run-casimir-dp-causal-cone-clock-stage4-2e";

describe("Casimir-DP Stage-4.2E campaign", () => {
  it("executes the causal recovery and fail-closed fixture matrix", async () => {
    const result = await runCasimirDpCausalConeClockStage4_2E({
      runId: "casimir-dp-causal-cone-clock-stage4-2e-v1-test",
      generatedAt: "2026-07-29T19:30:00.000Z",
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
      runId: "casimir-dp-causal-cone-clock-stage4-2e-v1-determinism",
      generatedAt: "2026-07-29T19:30:00.000Z",
      writeArtifacts: false,
    };
    const first = await runCasimirDpCausalConeClockStage4_2E(options);
    const second = await runCasimirDpCausalConeClockStage4_2E(options);
    expect(first.hashes).toEqual(second.hashes);
  });

  it("keeps empirical, collapse, manifold, and viability gates open", async () => {
    const result = await runCasimirDpCausalConeClockStage4_2E({
      runId: "casimir-dp-causal-cone-clock-stage4-2e-v1-status",
      generatedAt: "2026-07-29T19:30:00.000Z",
      writeArtifacts: false,
    });
    expect(result.report.final_gates).toEqual({
      software_and_causal_recovery_diagnostics: "pass",
      null_geodesic_apparatus_authority: "not_ready",
      complete_apparatus_metric_response: "not_ready",
      physical_pilot_readiness: "not_ready",
      measured_evidence: "not_ready",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
    });
    expect(result.receipt.downstream_verification).toEqual({
      status: "pending_external_verification",
      prior_stage4_2d_certificate_reused: false,
    });
  });
});
