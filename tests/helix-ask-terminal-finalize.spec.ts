import { describe, expect, it } from "vitest";

import {
  applyGlobalTerminalValidatorOutcome,
  applyTerminalAnswerText,
  clearGlobalTerminalValidatorState,
} from "../server/services/helix-ask/surface/terminal-finalize";
import {
  applyFinalModeGateConsistencyDebugState,
  clearObjectiveModeGateConsistencyForFinalize,
  reconcileObjectiveFinalizeGateAfterSurface,
} from "../server/services/helix-ask/surface/terminal-reconciliation";

describe("helix ask terminal finalize helpers", () => {
  it("syncs terminal answer text into result text and envelope", () => {
    const result = {
      text: "before",
      envelope: { answer: "before" },
    };

    const updated = applyTerminalAnswerText({
      result,
      nextText: "after",
    });

    expect(updated).toBe("after");
    expect(result.text).toBe("after");
    expect(result.envelope?.answer).toBe("after");
  });

  it("records a minimal repair rewrite into text, answer path, and debug payload", () => {
    const result = {
      text: "before",
      envelope: { answer: "before" },
    };
    const answerPath: string[] = [];
    const debugPayload: Record<string, unknown> = {};

    const outcome = applyGlobalTerminalValidatorOutcome({
      mode: "minimal_repair",
      reasons: ["required_sections_missing", "sources_missing"],
      currentText: "before",
      nextText: "after",
      result,
      answerPath,
      debugPayload,
    });

    expect(outcome.text).toBe("after");
    expect(result.text).toBe("after");
    expect(result.envelope?.answer).toBe("after");
    expect(answerPath).toEqual([
      "globalTerminalValidator:minimal_repair:required_sections_missing,sources_missing",
    ]);
    expect(debugPayload.global_terminal_validator_mode).toBe("minimal_repair");
    expect(debugPayload.final_mode_gate_consistency_blocked).toBe(false);
  });

  it("records observe-no-rewrite without mutating text", () => {
    const result = {
      text: "before",
      envelope: { answer: "before" },
    };
    const answerPath: string[] = [];
    const debugPayload: Record<string, unknown> = {};

    const outcome = applyGlobalTerminalValidatorOutcome({
      mode: "observe_no_rewrite",
      reasons: ["anchor_integrity_violation"],
      currentText: "before",
      result,
      answerPath,
      debugPayload,
    });

    expect(outcome.text).toBe("before");
    expect(result.text).toBe("before");
    expect(answerPath).toEqual([]);
    expect(debugPayload.global_terminal_validator_mode).toBe("observe_no_rewrite");
    expect(debugPayload.final_mode_gate_consistency_blocked).toBe(true);
  });

  it("clears global terminal validator state", () => {
    const debugPayload: Record<string, unknown> = {
      global_terminal_validator_applied: true,
      global_terminal_validator_reasons: ["required_sections_missing"],
      global_terminal_validator_mode: "rewrite",
      final_mode_gate_consistency_blocked: true,
      final_mode_gate_consistency_reasons: ["required_sections_missing"],
    };

    clearGlobalTerminalValidatorState(debugPayload);

    expect(debugPayload.global_terminal_validator_applied).toBe(false);
    expect(debugPayload.global_terminal_validator_reasons).toEqual([]);
    expect(debugPayload.global_terminal_validator_mode).toBe("none");
    expect(debugPayload.final_mode_gate_consistency_blocked).toBe(false);
    expect(debugPayload.final_mode_gate_consistency_reasons).toEqual([]);
  });
});

describe("helix ask terminal reconciliation helpers", () => {
  it("clears objective mode consistency when finalize is already recovered", () => {
    const debugRecord: Record<string, unknown> = {
      objective_mode_gate_consistency_blocked: true,
      objective_mode_gate_consistency_reasons: ["sources_missing"],
    };

    clearObjectiveModeGateConsistencyForFinalize(debugRecord);

    expect(debugRecord.objective_mode_gate_consistency_blocked).toBe(false);
    expect(debugRecord.objective_mode_gate_consistency_reasons).toEqual([]);
  });

  it("records blocked final mode consistency and objective finalize fallback", () => {
    const debugRecord: Record<string, unknown> = {
      objective_mode_gate_consistency_reasons: ["existing_reason"],
    };

    applyFinalModeGateConsistencyDebugState({
      debugRecord,
      blocked: true,
      reasons: ["required_sections_missing", "sources_missing"],
      objectiveLoopEnabled: true,
      strictCoveredRecovered: false,
      objectiveFallbackShapeSuppressed: false,
    });

    expect(debugRecord.final_mode_gate_consistency_blocked).toBe(true);
    expect(debugRecord.objective_finalize_gate_mode).toBe("blocked");
    expect(debugRecord.objective_finalize_gate_passed).toBe(false);
    expect(debugRecord.objective_mode_gate_consistency_reasons).toEqual([
      "existing_reason",
      "required_sections_missing",
      "sources_missing",
    ]);
  });

  it("reconciles strict-covered objective finalize state when consistency clears", () => {
    const debugRecord: Record<string, unknown> = {
      answer_obligations_missing: ["repo_gap"],
    };

    applyFinalModeGateConsistencyDebugState({
      debugRecord,
      blocked: false,
      reasons: [],
      objectiveLoopEnabled: true,
      strictCoveredRecovered: true,
      objectiveFallbackShapeSuppressed: true,
    });

    expect(debugRecord.objective_finalize_gate_passed).toBe(true);
    expect(debugRecord.objective_finalize_gate_mode).toBe("strict_covered");
    expect(debugRecord.objective_mode_gate_consistency_blocked).toBe(false);
    expect(debugRecord.objective_mode_gate_consistency_reasons).toEqual([]);
    expect(debugRecord.answer_obligations_missing).toEqual([]);
  });

  it("reconciles post-surface strict-covered state to blocked when consistency regresses", () => {
    const debugRecord: Record<string, unknown> = {
      objective_finalize_gate_mode: "strict_covered",
      objective_mode_gate_consistency_reasons: ["required_sections_missing"],
    };

    reconcileObjectiveFinalizeGateAfterSurface({
      debugRecord,
      strictCoveredConsistent: false,
      objectiveObligationsSuppressed: false,
      consistencyReasons: ["required_sections_missing", "sources_missing"],
    });

    expect(debugRecord.objective_finalize_gate_passed).toBe(false);
    expect(debugRecord.objective_finalize_gate_mode).toBe("blocked");
    expect(debugRecord.objective_mode_gate_consistency_blocked).toBe(true);
    expect(debugRecord.objective_mode_gate_consistency_reasons).toEqual([
      "required_sections_missing",
      "sources_missing",
    ]);
  });
});
