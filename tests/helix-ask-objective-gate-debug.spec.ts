import { describe, expect, it } from "vitest";

import { applyObjectiveGateDebugPayload } from "../server/services/helix-ask/surface/objective-gate-debug";

describe("helix ask objective gate debug", () => {
  it("records finalize gate state and soft reasons for strict-covered mode", () => {
    const debugPayload: Record<string, unknown> = {};

    applyObjectiveGateDebugPayload({
      debugPayload,
      objectiveFinalizeGatePassed: true,
      objectiveFinalizeGateMode: "strict_covered",
      unknownTerminalPass: false,
      strictCoveredPass: true,
      unresolvedCount: 0,
      blockedCount: 0,
      objectiveAnswerObligationsMissingCount: 1,
      objectiveComposerValidationFailCount: 1,
    });

    expect(debugPayload.objective_finalize_gate_passed).toBe(true);
    expect(debugPayload.objective_finalize_gate_mode).toBe("strict_covered");
    expect(debugPayload.objective_finalize_gate_unknown_terminal_eligible).toBe(false);
    expect(debugPayload.objective_finalize_gate_soft_reasons).toEqual([
      "answer_obligations_missing",
      "composer_validation_fail",
    ]);
    expect(debugPayload.objective_mode_gate_consistency_blocked).toBe(false);
    expect(debugPayload.objective_mode_gate_consistency_reasons).toBeUndefined();
  });

  it("records blocked mode reasons when strict-covered fails", () => {
    const debugPayload: Record<string, unknown> = {};

    applyObjectiveGateDebugPayload({
      debugPayload,
      objectiveFinalizeGatePassed: false,
      objectiveFinalizeGateMode: "blocked",
      unknownTerminalPass: true,
      strictCoveredPass: false,
      unresolvedCount: 2,
      blockedCount: 1,
      objectiveAnswerObligationsMissingCount: 0,
      objectiveComposerValidationFailCount: 1,
    });

    expect(debugPayload.objective_finalize_gate_passed).toBe(false);
    expect(debugPayload.objective_mode_gate_consistency_blocked).toBe(true);
    expect(debugPayload.objective_mode_gate_consistency_reasons).toEqual([
      "objective_unresolved",
      "objective_blocked",
      "composer_validation_fail",
    ]);
  });
});
