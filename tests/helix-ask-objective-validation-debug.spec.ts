import { describe, expect, it } from "vitest";

import { applyObjectiveValidationDebugPayload } from "../server/services/helix-ask/surface/objective-validation-debug";

describe("helix ask objective validation debug", () => {
  it("copies unresolved, unknown-block, and terminalization debug fields", () => {
    const debugPayload: Record<string, unknown> = {};

    applyObjectiveValidationDebugPayload({
      debugPayload,
      objectiveCoverageUnresolvedObjectiveIds: ["o-1", "o-2"],
      objectiveUnknownBlockObjectiveIds: ["o-2", "o-3", "o-4"],
      objectiveUnresolvedWithoutUnknownBlockIds: ["o-1"],
      unresolvedObjectiveCount: 4,
      unresolvedWithGenericUnknownCount: 2,
      objectiveOesScores: Array.from({ length: 14 }, (_, index) => ({ objective_id: `o-${index + 1}` })),
      objectiveTerminalizationReasons: {
        "o-1": "covered",
        "o-2": "unknown_terminal",
      },
    });

    expect(debugPayload.objective_coverage_unresolved_count).toBe(2);
    expect(debugPayload.objective_coverage_unresolved_objective_ids).toEqual(["o-1", "o-2"]);
    expect(debugPayload.objective_unknown_block_count).toBe(3);
    expect(debugPayload.objective_unknown_block_objective_ids).toEqual(["o-2", "o-3", "o-4"]);
    expect(debugPayload.objective_unresolved_without_unknown_block_count).toBe(1);
    expect(debugPayload.objective_unresolved_without_unknown_block_ids).toEqual(["o-1"]);
    expect(debugPayload.unresolved_without_unknown_block_rate).toBe(0.25);
    expect(debugPayload.generic_unknown_renderer_rate).toBe(0.5);
    expect(debugPayload.objective_oes_scores).toEqual(
      Array.from({ length: 12 }, (_, index) => ({ objective_id: `o-${index + 1}` })),
    );
    expect(debugPayload.objective_terminalization_reasons).toEqual({
      "o-1": "covered",
      "o-2": "unknown_terminal",
    });
    expect(debugPayload.objective_terminalization_reason).toBe("covered");
  });

  it("returns zero rates when unresolved objective count is empty", () => {
    const debugPayload: Record<string, unknown> = {};

    applyObjectiveValidationDebugPayload({
      debugPayload,
      objectiveCoverageUnresolvedObjectiveIds: [],
      objectiveUnknownBlockObjectiveIds: [],
      objectiveUnresolvedWithoutUnknownBlockIds: ["o-1"],
      unresolvedObjectiveCount: 0,
      unresolvedWithGenericUnknownCount: 3,
      objectiveOesScores: [],
      objectiveTerminalizationReasons: {},
    });

    expect(debugPayload.unresolved_without_unknown_block_rate).toBe(0);
    expect(debugPayload.generic_unknown_renderer_rate).toBe(0);
    expect(debugPayload.objective_terminalization_reason).toBeNull();
  });
});
