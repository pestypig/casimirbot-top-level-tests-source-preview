import { describe, expect, it } from "vitest";
import {
  runCasimirDpEmpiricalFeasibilityPilotStage4_2G,
} from "../scripts/research/run-casimir-dp-empirical-feasibility-pilot-stage4-2g";

describe("Casimir-DP Stage-4.2G campaign", () => {
  it("runs the canonical unacquired packet and synthetic ingestion check", async () => {
    const result =
      await runCasimirDpEmpiricalFeasibilityPilotStage4_2G({
        runId: "casimir-dp-stage4-2g-test",
        generatedAt: "2026-07-30T03:00:00.000Z",
        writeArtifacts: false,
      });
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.integrity_gate).toBe("pass");
    expect(result.report.current_packet.evidence_class).toBe(
      "unacquired_template",
    );
    expect(
      result.report.synthetic_ingestion_validation.packet_audit
        .identifiability_gate,
    ).toBe("pass");
    expect(result.report.pilot_decision).toBe(
      "no_go_until_provenance_bound_measured_packet_passes",
    );
  });

  it("is deterministic for a fixed run identity", async () => {
    const options = {
      runId: "casimir-dp-stage4-2g-determinism",
      generatedAt: "2026-07-30T03:00:00.000Z",
      writeArtifacts: false,
    };
    const first =
      await runCasimirDpEmpiricalFeasibilityPilotStage4_2G(options);
    const second =
      await runCasimirDpEmpiricalFeasibilityPilotStage4_2G(options);
    expect(first.hashes).toEqual(second.hashes);
  });

  it("preserves every empirical and interpretation blocker", async () => {
    const result =
      await runCasimirDpEmpiricalFeasibilityPilotStage4_2G({
        runId: "casimir-dp-stage4-2g-standing",
        generatedAt: "2026-07-30T03:00:00.000Z",
        writeArtifacts: false,
      });
    expect(result.report.final_gates).toEqual({
      software_and_packet_contract: "pass",
      design_identity_freeze: "pass",
      dp_companion_internal_consistency: "pass",
      physical_apparatus_identity: "not_ready",
      finite_geometry_maxwell_authority: "not_ready",
      measured_material_green_authority: "not_ready",
      state_preparation_authority: "not_ready",
      branch_hold_metrology_authority: "not_ready",
      quasistatic_modulation_authority: "not_ready",
      measured_background_covariance: "not_ready",
      companion_detector_authority: "not_ready",
      empirical_pilot_readiness: "not_ready",
      complete_apparatus_stress_energy: "not_ready",
      measured_evidence: "not_ready",
      collapse_identification: "blocked",
      manifold_dynamics: "blocked",
      physical_viability: "not_evaluated",
    });
    expect(result.report.observable_bridge_edges_added).toBe(0);
    expect(result.receipt.downstream_verification).toEqual({
      status: "pending_external_verification",
      prior_stage4_2f_certificate_reused: false,
    });
  });
});
