import { describe, expect, it } from "vitest";

import { applyHelixTerminalAuthoritySingleWriter } from "../server/services/helix-ask/terminal-authority-single-writer";
import {
  isHelixAskClarifyForcedShortCircuitRule,
  isHelixAskConceptForcedShortCircuitRule,
  isHelixAskHardForcedShortCircuitRule,
  renderHelixAskSimpleCompositionalAnswer,
  shouldFastPathFinalizeHelixAskForcedAnswer,
  shouldPreserveHelixAskForcedAnswerAcrossComposer,
  shouldPreserveHelixAskForcedAnswerAcrossFinalizer,
} from "../server/services/helix-ask/policy/forced-answer";

describe("helix ask forced answer policy", () => {
  it("renders simple composition prompts locally", () => {
    expect(renderHelixAskSimpleCompositionalAnswer("Say hello in one sentence.")).toBe("Hello.");
    expect(renderHelixAskSimpleCompositionalAnswer("Respond with ok")).toBe("Ok.");
  });

  it("fast-path finalizes hard forced answers only when they are structured enough", () => {
    expect(
      shouldFastPathFinalizeHelixAskForcedAnswer({
        shouldShortCircuitAnswer: true,
        fallbackAnswer:
          "Lead with the direct answer.\n\nSources: docs/helix-ask-flow.md, docs/helix-ask-agent-policy.md",
        forcedAnswerIsHard: true,
        forcedRule: "forcedAnswer:simple_composition",
        conceptFastPath: false,
        isIdeologyReferenceIntent: false,
        verbosity: "brief",
      }),
    ).toBe(true);
    expect(
      shouldFastPathFinalizeHelixAskForcedAnswer({
        shouldShortCircuitAnswer: true,
        fallbackAnswer: "Lead with the direct answer.",
        forcedAnswerIsHard: true,
        forcedRule: "forcedAnswer:simple_composition",
        conceptFastPath: false,
        isIdeologyReferenceIntent: false,
        verbosity: "brief",
      }),
    ).toBe(false);
    expect(
      shouldFastPathFinalizeHelixAskForcedAnswer({
        shouldShortCircuitAnswer: true,
        fallbackAnswer: "Hello! How can I assist you today?",
        forcedAnswerIsHard: true,
        forcedRule: "forcedAnswer:smalltalk_fast_path",
        conceptFastPath: false,
        isIdeologyReferenceIntent: false,
        verbosity: "brief",
      }),
    ).toBe(false);
  });

  it("preserves only the intended forced-answer categories across composer and finalizer", () => {
    expect(isHelixAskHardForcedShortCircuitRule("forcedAnswer:concept_short_definition")).toBe(
      true,
    );
    expect(
      isHelixAskHardForcedShortCircuitRule("forcedAnswer:pre_intent_microplanner_answer"),
    ).toBe(false);
    expect(isHelixAskHardForcedShortCircuitRule("forcedAnswer:pre_intent_clarify_deictic")).toBe(
      true,
    );
    expect(isHelixAskHardForcedShortCircuitRule("forcedAnswer:smalltalk_fast_path")).toBe(true);
    expect(isHelixAskConceptForcedShortCircuitRule("forcedAnswer:concept")).toBe(true);
    expect(isHelixAskClarifyForcedShortCircuitRule("forcedAnswer:pre_intent_clarify")).toBe(
      true,
    );
    expect(
      isHelixAskClarifyForcedShortCircuitRule("forcedAnswer:pre_intent_clarify_deictic"),
    ).toBe(false);
    expect(
      shouldPreserveHelixAskForcedAnswerAcrossComposer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:concept_short_definition",
      }),
    ).toBe(true);
    expect(
      shouldPreserveHelixAskForcedAnswerAcrossFinalizer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:pre_intent_microplanner_answer",
      }),
    ).toBe(false);
    expect(
      shouldPreserveHelixAskForcedAnswerAcrossComposer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:pre_intent_microplanner_answer",
      }),
    ).toBe(false);
    expect(
      shouldPreserveHelixAskForcedAnswerAcrossFinalizer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:smalltalk_fast_path",
      }),
    ).toBe(false);
    expect(
      shouldPreserveHelixAskForcedAnswerAcrossFinalizer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:concept_short_definition",
      }),
    ).toBe(false);
  });

  it("does not allow pre-intent microplanner answers to bypass composer or finalizer", () => {
    expect(
      shouldPreserveHelixAskForcedAnswerAcrossComposer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:pre_intent_microplanner_answer",
      }),
    ).toBe(false);
    expect(
      shouldPreserveHelixAskForcedAnswerAcrossFinalizer({
        forcedAnswerPinned: true,
        forcedRule: "forcedAnswer:pre_intent_microplanner_answer",
      }),
    ).toBe(false);
  });

  it("does not allow pre-intent microplanner answers to bypass terminal authority", () => {
    const turnId = "turn-forced-answer-policy";
    const finalAnswer =
      "Helix Ask final answer language is decided after request language metadata is carried into the repo evidence synthesis path. The terminal answer remains grounded by the repo observation and cites server/services/helix-ask/policy/forced-answer.ts as support.";
    const payload: Record<string, unknown> = {
      turn_id: turnId,
      thread_id: "thread-forced-answer-policy",
      active_prompt:
        "What exact source files decide Helix Ask final answer language? Use repo evidence and cite paths.",
      selected_final_answer: "Pre-intent microplanner answer should not be terminal.",
      answer: "Pre-intent microplanner answer should not be terminal.",
      text: "Pre-intent microplanner answer should not be terminal.",
      terminal_artifact_kind: "direct_answer_text",
      final_answer_source: "model_direct_answer",
      route_product_contract: {
        source_target: "repo_code",
        allowed_terminal_artifact_kinds: ["repo_code_evidence_answer", "typed_failure"],
        forbidden_terminal_artifact_kinds: ["direct_answer_text", "no_tool_direct"],
      },
      canonical_goal_frame: {
        goal_kind: "repo_code_evidence_question",
        required_terminal_kind: "repo_code_evidence_answer",
      },
      goal_satisfaction_evaluation: {
        satisfaction: "satisfied",
        next_decision: "allow_terminal",
      },
      agent_step_decision: {
        decision_id: `${turnId}:decision:post_observation_answer`,
        decision_timing: "post_observation",
        decision_authority: "llm",
        next_step: "answer",
        chosen_capability: "model.direct_answer",
      },
      agent_runtime_loop: {
        iterations: [
          {
            decision_id: `${turnId}:decision:repo_search`,
            decision_timing: "tool_admission",
            decision_authority: "llm",
            next_step: "tool",
            chosen_capability: "repo-code.search_concept",
            observed_artifact_refs: [`${turnId}:repo_code_evidence_observation:1`],
          },
          {
            decision_id: `${turnId}:decision:post_observation_answer`,
            decision_timing: "post_observation",
            decision_authority: "llm",
            next_step: "answer",
            chosen_capability: "model.direct_answer",
            observed_artifact_refs: [`${turnId}:final_answer_draft:1`],
          },
        ],
      },
      current_turn_artifact_ledger: [
        {
          artifact_id: `${turnId}:direct_answer_text:pre_intent`,
          kind: "direct_answer_text",
          payload: {
            schema: "helix.direct_answer_text.v1",
            text: "Pre-intent microplanner answer should not be terminal.",
            fallback_reason_taxonomy: "pre_intent_microplanner_answer",
          },
        },
        {
          artifact_id: `${turnId}:repo_code_evidence_observation:1`,
          kind: "repo_code_evidence_observation",
          payload: {
            schema: "helix.repo_code_evidence_observation.v1",
            evidence_refs: ["server/services/helix-ask/policy/forced-answer.ts:30"],
            spans: [
              {
                ref: "server/services/helix-ask/policy/forced-answer.ts:30",
                path: "server/services/helix-ask/policy/forced-answer.ts",
              },
            ],
          },
        },
        {
          artifact_id: `${turnId}:repo_evidence_synthesis_attempt:1`,
          kind: "repo_evidence_synthesis_attempt",
          payload: {
            schema: "helix.repo_evidence_synthesis_attempt.v1",
            model_step_capability: "model.synthesize_from_repo_evidence",
          },
        },
        {
          artifact_id: `${turnId}:final_answer_draft:1`,
          kind: "final_answer_draft",
          payload: {
            schema: "helix.final_answer_draft.v1",
            text: finalAnswer,
            answer_text: finalAnswer,
            authority: "llm_post_observation_composer",
            model_step_capability: "model.synthesize_from_repo_evidence",
            artifact_refs: ["server/services/helix-ask/policy/forced-answer.ts:30"],
          },
        },
      ],
    };

    const result = applyHelixTerminalAuthoritySingleWriter({
      turnId,
      threadId: "thread-forced-answer-policy",
      payload,
    });

    expect(payload.terminal_artifact_kind).toBe("repo_code_evidence_answer");
    expect(payload.final_answer_source).toBe("final_answer_draft");
    expect(payload.selected_final_answer).toBe(finalAnswer);
    expect(result.selected_terminal_artifact_kind).toBe("repo_code_evidence_answer");
    expect(result.rejected_candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "direct_answer_text",
          reason: "later_valid_final_answer_draft",
        }),
      ]),
    );
  });
});
