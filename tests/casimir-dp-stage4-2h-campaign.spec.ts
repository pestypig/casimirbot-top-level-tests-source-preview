import { describe, expect, it } from "vitest";
import {
  runCasimirDpCommissioningIntakeStage4_2H,
} from "../scripts/research/run-casimir-dp-commissioning-intake-stage4-2h";

describe("Casimir-DP Stage-4.2H campaign", () => {
  it("runs the canonical blank intake and synthetic dry run", async () => {
    const result = await runCasimirDpCommissioningIntakeStage4_2H({
      runId: "casimir-dp-stage4-2h-test",
      generatedAt: "2026-07-30T05:00:00.000Z",
      writeArtifacts: false,
    });
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.current_dossier.evidence_class).toBe(
      "blank_commissioning_template",
    );
    expect(
      result.report.synthetic_dry_run_result.compiled_stage4_2g_result
        ?.packet_audit.identifiability_gate,
    ).toBe("pass");
    expect(result.report.pilot_decision).toBe(
      "no_go_until_provenance_bound_measured_dossier_passes",
    );
  });

  it("is deterministic for a fixed run identity", async () => {
    const options = {
      runId: "casimir-dp-stage4-2h-determinism",
      generatedAt: "2026-07-30T05:00:00.000Z",
      writeArtifacts: false,
    };
    const first =
      await runCasimirDpCommissioningIntakeStage4_2H(options);
    const second =
      await runCasimirDpCommissioningIntakeStage4_2H(options);
    expect(first.hashes).toEqual(second.hashes);
  });

  it("preserves the fail-closed scientific standing", async () => {
    const result = await runCasimirDpCommissioningIntakeStage4_2H({
      runId: "casimir-dp-stage4-2h-standing",
      generatedAt: "2026-07-30T05:00:00.000Z",
      writeArtifacts: false,
    });
    expect(result.report.final_gates).toEqual({
      commissioning_contract: "pass",
      synthetic_dry_run: "pass",
      instrument_registry: "not_ready",
      calibration_ancestry: "not_ready",
      custody_and_blind_freeze: "not_ready",
      raw_data_availability: "not_ready",
      stage4_2g_packet_compilation: "not_ready",
      empirical_pilot_readiness: "not_ready",
      measured_evidence: "not_ready",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
    });
    expect(result.report.observable_bridge_edges_added).toBe(0);
    expect(result.receipt.downstream_verification).toEqual({
      status: "pending_external_verification",
      prior_stage4_2g_certificate_reused: false,
    });
  });

  it("reproduces the authoritative content hashes", async () => {
    const result = await runCasimirDpCommissioningIntakeStage4_2H({
      runId:
        "casimir-dp-commissioning-intake-stage4-2h-v1-20260730T050000000Z",
      generatedAt: "2026-07-30T05:00:00.000Z",
      writeArtifacts: false,
    });
    expect(result.hashes).toEqual({
      report_json_sha256:
        "d5954986d73d7eb9d5d9a07ad4f945d9b636d1c6a37efe28c2de6b5ad1fd32aa",
      report_markdown_sha256:
        "7eec6b9cbd7ff714f0ae89c5151748d4a3fab40a248f04e6d6f4459093d46ee7",
      trace_sha256:
        "9bd74a2fc42d93856a4f4656f95668ffb885e07d67f3afd344adcda511e2846f",
      receipt_sha256:
        "d0aacee6611e5aec1c75934a24fc709c434107e3e685eba0f96fc1addd1be56b",
      synthetic_dry_run_sha256:
        "de337a193fb34e41b6aab792cb758d7f29102a225b1cff584d5cafb75eb3d1c0",
    });
  });
});
