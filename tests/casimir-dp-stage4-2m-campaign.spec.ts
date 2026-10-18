import { describe, expect, it } from "vitest";
import { runCasimirDpApparatusSearchStage4_2M } from "../scripts/research/run-casimir-dp-apparatus-search-stage4-2m";

describe("Casimir-DP Stage-4.2M campaign", () => {
  it("replays immutable Stage-4.2L and preserves empirical fail-closed standing", async () => {
    const result = await runCasimirDpApparatusSearchStage4_2M({ writeArtifacts: false });
    expect(result.report.upstream_integrity).toBe(true);
    expect(result.report.eligible_synthetic_candidate_count).toBeGreaterThanOrEqual(3);
    expect(result.report.outcome.measured_evidence).toBe("not_ready");
    expect(result.report.outcome.physical_pilot_authorized).toBe(false);
    expect(result.report.outcome.observable_bridge_edges_added).toBe(0);
  });
});
