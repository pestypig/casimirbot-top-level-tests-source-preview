import { describe, expect, it } from "vitest";
import { runCasimirDpEmpiricalAuthorityStage4_2L } from "../scripts/research/run-casimir-dp-empirical-authority-stage4-2l";

describe("Casimir-DP Stage-4.2L campaign", () => {
  it("replays immutable Stage-4.2K and preserves empirical fail-closed standing", async () => {
    const result = await runCasimirDpEmpiricalAuthorityStage4_2L({
      generatedAt: "2026-08-06T06:00:00.000Z",
      runId: "casimir-dp-empirical-authority-stage4-2l-v1-20260806T060000000Z",
      writeArtifacts: false,
    });
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.immutable_stage4_2k.recovered).toBe(true);
    expect(result.report.nominal_result.outcome.apparatus_reference).toBe("redesign_required_before_empirical_pilot");
    expect(result.report.final_gates.measured_evidence).toBe("not_ready");
    expect(result.report.final_gates.residual_attribution).toBe("blocked");
    expect(result.report.final_gates.confirmatory_campaign).toBe("not_authorized");
    expect(result.report.final_gates.collapse_identification).toBe("blocked");
    expect(result.report.observable_bridge_edges_added).toBe(0);
  });
});
