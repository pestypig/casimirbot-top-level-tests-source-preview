import { describe, expect, it } from "vitest";
import {
  runCasimirDpIdentifiabilityRedesignStage4_2C,
} from "../scripts/research/run-casimir-dp-identifiability-redesign-stage4-2c";

describe("Casimir-DP Stage-4.2C campaign", () => {
  it("executes H-M and all adversarial fixtures without writing", async () => {
    const result =
      await runCasimirDpIdentifiabilityRedesignStage4_2C({
        runId:
          "casimir-dp-identifiability-redesign-stage4-2c-v1-test",
        generatedAt: "2026-07-28T12:00:00.000Z",
        writeArtifacts: false,
      });
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.integrity_gate).toBe("pass");
    expect(result.report.fixture_summary).toEqual({
      required: 16,
      executed: 16,
      matched_expected_gate_and_status: 16,
      all_pass: true,
    });
    expect(result.report.design_selection).toMatchObject({
      verdict: "bounded_powered_region_available",
      selected_candidate_id: "silica_high_mass_identifiable",
      required_paired_windows: 542,
    });
  });

  it("is deterministic for a fixed run identity and timestamp", async () => {
    const options = {
      runId:
        "casimir-dp-identifiability-redesign-stage4-2c-v1-determinism",
      generatedAt: "2026-07-28T12:00:00.000Z",
      writeArtifacts: false,
    };
    const first =
      await runCasimirDpIdentifiabilityRedesignStage4_2C(options);
    const second =
      await runCasimirDpIdentifiabilityRedesignStage4_2C(options);
    expect(first.hashes).toEqual(second.hashes);
  });

  it("keeps the strongest scientific statuses open", async () => {
    const result =
      await runCasimirDpIdentifiabilityRedesignStage4_2C({
        runId:
          "casimir-dp-identifiability-redesign-stage4-2c-v1-status",
        generatedAt: "2026-07-28T12:00:00.000Z",
        writeArtifacts: false,
      });
    expect(result.report.final_gates).toMatchObject({
      bounded_design_region: "available",
      physical_pilot_readiness: "not_ready",
      measured_evidence: "not_ready",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
    });
    expect(result.receipt.downstream_verification.status).toBe(
      "pending_external_verification",
    );
  });
});
