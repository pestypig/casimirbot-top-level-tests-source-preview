import { describe, expect, it } from "vitest";
import {
  runCasimirDpSchrodingerMassDensityStage4_2J,
} from "../scripts/research/run-casimir-dp-schrodinger-mass-density-stage4-2j";

describe("Casimir-DP Stage-4.2J campaign", () => {
  it("replays immutable Stage-4.2I and preserves every fail-closed boundary", async () => {
    const result = await runCasimirDpSchrodingerMassDensityStage4_2J({
      generatedAt: "2026-08-06T04:00:00.000Z",
      runId:
        "casimir-dp-schrodinger-mass-density-stage4-2j-v1-20260806T040000000Z",
      writeArtifacts: false,
    });
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.immutable_stage4_2i.recovered).toBe(true);
    expect(
      result.report.nominal_synthetic_result.outcome.diagnostic_gate,
    ).toBe("pass");
    expect(
      result.report.nominal_synthetic_result.outcome
        .complete_representation_robustness,
    ).toBe("blocked");
    expect(
      result.report.nominal_synthetic_result.outcome
        .declared_equilibrium_gas_screen,
    ).toBe("no_go");
    expect(
      result.report.nominal_synthetic_result.outcome
        .physical_candidate_selected,
    ).toBe(false);
    expect(result.report.adversarial_cases).toHaveLength(5);
    expect(
      result.report.adversarial_cases.every((row) => row.gate === "pass"),
    ).toBe(true);
    expect(result.report.observable_bridge_edges_added).toBe(0);
    expect(result.report.final_gates.measured_evidence).toBe("not_ready");
    expect(result.report.final_gates.collapse_identification).toBe("blocked");
    expect(result.report.final_gates.manifold_dynamics).toBe("blocked");
    expect(result.report.final_gates.physical_viability).toBe("not_evaluated");
    expect(result.receipt.downstream_verification.status).toBe(
      "pending_external_verification",
    );
  });
});
