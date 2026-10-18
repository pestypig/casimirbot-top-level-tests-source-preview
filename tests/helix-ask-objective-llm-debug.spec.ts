import { describe, expect, it } from "vitest";

import { applyObjectiveLlmDebugPayload } from "../server/services/helix-ask/surface/objective-llm-debug";

describe("helix ask objective llm debug", () => {
  it("copies mini-synth, mini-critic, and assembly debug fields", () => {
    const debugPayload: Record<string, unknown> = {};
    const objectiveMiniAnswers = Array.from({ length: 14 }, (_, index) => ({
      objective_id: `o-${index + 1}`,
      status: index % 2 === 0 ? "covered" : "blocked",
    }));

    applyObjectiveLlmDebugPayload({
      debugPayload,
      objectiveMiniAnswers,
      objectiveMiniValidation: { unresolved: 2, blocked: 1 },
      objectiveMiniSynthMode: "llm",
      objectiveMiniSynthLlmAttempted: true,
      objectiveMiniSynthLlmInvoked: true,
      objectiveMiniSynthFailReason: "none",
      objectiveMiniSynthPromptPreview: "synth prompt",
      objectiveMiniSynthRepairAttempted: true,
      objectiveMiniSynthRepairSuccess: false,
      objectiveMiniSynthRepairFailReason: "timeout",
      objectiveMiniCriticMode: "heuristic_fallback",
      objectiveMiniCriticLlmAttempted: true,
      objectiveMiniCriticLlmInvoked: false,
      objectiveMiniCriticFailReason: "provider_unavailable",
      objectiveMiniCriticPromptPreview: "critic prompt",
      objectiveMiniCriticRepairAttempted: false,
      objectiveMiniCriticRepairSuccess: false,
      objectiveMiniCriticRepairFailReason: "none",
      objectiveAssemblyMode: "deterministic_fallback",
      objectiveAssemblyFailReason: "composer_validation_fail",
      objectiveAssemblyBlockedReason: "answer_obligations_missing",
      objectiveAssemblyLlmAttempted: true,
      objectiveAssemblyLlmInvoked: false,
      objectiveAssemblyPromptPreview: "assembly prompt",
      objectiveAssemblyRescuePromptPreview: "rescue prompt",
      objectiveAssemblyRescueAttempted: true,
      objectiveAssemblyRescueSuccess: true,
      objectiveAssemblyRescueFailReason: "none",
      objectiveAssemblyRepairAttempted: true,
      objectiveAssemblyRepairSuccess: false,
      objectiveAssemblyRepairFailReason: "repair_fail",
      objectiveAssemblyRescueRepairAttempted: true,
      objectiveAssemblyRescueRepairSuccess: true,
      objectiveAssemblyRescueRepairFailReason: "none",
      objectiveAssemblyWeakRejectCount: 3,
    });

    expect(debugPayload.objective_mini_answers).toEqual(objectiveMiniAnswers.slice(0, 12));
    expect(debugPayload.objective_mini_validation).toEqual({ unresolved: 2, blocked: 1 });
    expect(debugPayload.objective_mini_synth_mode).toBe("llm");
    expect(debugPayload.objective_mini_synth_attempted).toBe(true);
    expect(debugPayload.objective_mini_synth_invoked).toBe(true);
    expect(debugPayload.objective_mini_synth_prompt_preview).toBe("synth prompt");
    expect(debugPayload.objective_mini_synth_repair_fail_reason).toBe("timeout");
    expect(debugPayload.objective_mini_critic_mode).toBe("heuristic_fallback");
    expect(debugPayload.objective_mini_critic_prompt_preview).toBe("critic prompt");
    expect(debugPayload.objective_mini_critic_repair_success).toBe(false);
    expect(debugPayload.objective_assembly_mode).toBe("deterministic_fallback");
    expect(debugPayload.objective_assembly_input_count).toBe(14);
    expect(debugPayload.objective_assembly_fail_reason).toBe("composer_validation_fail");
    expect(debugPayload.objective_assembly_blocked_reason).toBe("answer_obligations_missing");
    expect(debugPayload.objective_assembly_rescue_prompt_preview).toBe("rescue prompt");
    expect(debugPayload.objective_assembly_rescue_success).toBe(true);
    expect(debugPayload.objective_assembly_rescue_repair_success).toBe(true);
    expect(debugPayload.objective_assembly_weak_reject_count).toBe(3);
  });

  it("preserves nullish and falsey values without coercion", () => {
    const debugPayload: Record<string, unknown> = {};

    applyObjectiveLlmDebugPayload({
      debugPayload,
      objectiveMiniAnswers: [],
      objectiveMiniValidation: null,
      objectiveMiniSynthMode: null,
      objectiveMiniSynthLlmAttempted: false,
      objectiveMiniSynthLlmInvoked: false,
      objectiveMiniSynthFailReason: null,
      objectiveMiniSynthPromptPreview: "",
      objectiveMiniSynthRepairAttempted: false,
      objectiveMiniSynthRepairSuccess: false,
      objectiveMiniSynthRepairFailReason: null,
      objectiveMiniCriticMode: null,
      objectiveMiniCriticLlmAttempted: false,
      objectiveMiniCriticLlmInvoked: false,
      objectiveMiniCriticFailReason: null,
      objectiveMiniCriticPromptPreview: "",
      objectiveMiniCriticRepairAttempted: false,
      objectiveMiniCriticRepairSuccess: false,
      objectiveMiniCriticRepairFailReason: null,
      objectiveAssemblyMode: null,
      objectiveAssemblyFailReason: null,
      objectiveAssemblyBlockedReason: null,
      objectiveAssemblyLlmAttempted: false,
      objectiveAssemblyLlmInvoked: false,
      objectiveAssemblyPromptPreview: "",
      objectiveAssemblyRescuePromptPreview: "",
      objectiveAssemblyRescueAttempted: false,
      objectiveAssemblyRescueSuccess: false,
      objectiveAssemblyRescueFailReason: null,
      objectiveAssemblyRepairAttempted: false,
      objectiveAssemblyRepairSuccess: false,
      objectiveAssemblyRepairFailReason: null,
      objectiveAssemblyRescueRepairAttempted: false,
      objectiveAssemblyRescueRepairSuccess: false,
      objectiveAssemblyRescueRepairFailReason: null,
      objectiveAssemblyWeakRejectCount: 0,
    });

    expect(debugPayload.objective_mini_answers).toEqual([]);
    expect(debugPayload.objective_mini_validation).toBeNull();
    expect(debugPayload.objective_mini_synth_mode).toBeNull();
    expect(debugPayload.objective_mini_synth_attempted).toBe(false);
    expect(debugPayload.objective_mini_critic_mode).toBeNull();
    expect(debugPayload.objective_assembly_mode).toBeNull();
    expect(debugPayload.objective_assembly_input_count).toBe(0);
    expect(debugPayload.objective_assembly_weak_reject_count).toBe(0);
  });
});
