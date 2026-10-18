import { describe, expect, it } from "vitest";
import { runCasimirDpMicroscopicEmClosureStage4_2K } from "../scripts/research/run-casimir-dp-microscopic-em-closure-stage4-2k";

describe("Casimir-DP Stage-4.2K campaign", () => {
  it("replays immutable Stage-4.2J and preserves fail-closed standing", async () => {
    const result = await runCasimirDpMicroscopicEmClosureStage4_2K({ generatedAt: "2026-08-06T05:00:00.000Z", runId: "casimir-dp-microscopic-em-closure-stage4-2k-v1-20260806T050000000Z", writeArtifacts: false });
    expect(result.report.campaign_gate).toBe("pass");
    expect(result.report.immutable_stage4_2j.recovered).toBe(true);
    expect(result.report.nominal_synthetic_result.outcome.residual_attribution).toBe("blocked");
    expect(result.report.observable_bridge_edges_added).toBe(0);
    expect(result.report.final_gates.measured_evidence).toBe("not_ready");
    expect(result.report.final_gates.collapse_identification).toBe("blocked");
    expect(result.report.final_gates.manifold_dynamics).toBe("blocked");
    expect(result.report.final_gates.physical_viability).toBe("not_evaluated");
  });
});
