import { describe, expect, it } from "vitest";

import { applyObjectiveStateDebugPayload } from "../server/services/helix-ask/surface/objective-state-debug";

describe("helix ask objective state debug", () => {
  it("clips loop state and transition history to the expected windows", () => {
    const debugPayload: Record<string, unknown> = {};
    const objectiveLoopState = Array.from({ length: 20 }, (_, index) => ({ objective_id: `o-${index + 1}` }));
    const objectiveTransitionLog = Array.from({ length: 70 }, (_, index) => ({ from: index, to: index + 1 }));

    applyObjectiveStateDebugPayload({
      debugPayload,
      objectiveLoopState,
      objectiveTransitionLog,
    });

    expect(debugPayload.objective_loop_state).toEqual(objectiveLoopState.slice(0, 16));
    expect(debugPayload.objective_transition_log).toEqual(objectiveTransitionLog.slice(-64));
  });
});
