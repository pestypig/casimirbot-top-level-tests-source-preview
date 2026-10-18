import { describe, expect, it, vi } from "vitest";

import { runHelixAskObjectiveMiniExecution } from "../server/services/helix-ask/objectives/objective-execution-runtime";
import type {
  HelixAskObjectiveLoopState,
  HelixAskObjectiveMiniAnswer,
  HelixAskObjectiveStepTranscript,
  HelixAskObjectiveTransition,
} from "../server/services/helix-ask/objectives/objective-loop-debug";
import { recordHelixAskObjectiveTransition } from "../server/services/helix-ask/objectives/objective-loop-debug";

const makeState = (): HelixAskObjectiveLoopState[] => [
  {
    objective_id: "obj-1",
    objective_label: "Explain fast mode deadlines",
    required_slots: ["docs-path", "runtime-flag"],
    matched_slots: ["docs-path"],
    status: "synthesizing",
    attempt: 1,
    retrieval_confidence: 0.95,
  },
];

const makeMiniAnswers = (): HelixAskObjectiveMiniAnswer[] => [
  {
    objective_id: "obj-1",
    objective_label: "Explain fast mode deadlines",
    status: "partial",
    matched_slots: ["docs-path"],
    missing_slots: ["runtime-flag"],
    evidence_refs: ["docs/helix-ask-reasoning-ladder-research-report.md"],
    summary: "Need the runtime flag to close the answer.",
  },
];

const buildArgs = () => {
  const debugPayload: Record<string, unknown> = {};
  const answerPath: string[] = [];
  const transcripts: HelixAskObjectiveStepTranscript[] = [];
  let transitionLog: HelixAskObjectiveTransition[] = [];
  return {
    debugPayload,
    answerPath,
    transcripts,
    args: {
      request: {
        max_tokens: 256,
        temperature: 0.2,
        seed: 7,
        stop: undefined,
        sessionId: "session-1",
      },
      answerMaxTokens: 512,
      baseQuestion: "How does fast quality mode alter answer generation deadlines?",
      responseLanguage: "en",
      dialogueProfile: null,
      personaId: "helix",
      traceId: "trace-1",
      llmUnavailableAtTurnStart: false,
      answerGenerationFailedForTurn: false,
      preserveAnswerAcrossComposer: false,
      fastQualityMode: false,
      getFastElapsedMs: () => 0,
      finalizeDeadlineMs: 5_000,
      objectiveRecoveryNoContextCount: 0,
      objectiveRecoveryNoContextWithFilesCount: 0,
      objectiveRecoveryPassCount: 0,
      objectiveRecoveryTargetsLength: 1,
      objectiveScopedRetrievalMaxObjectives: 4,
      objectivePromptRewriteMode: "on" as const,
      objectiveLoopState: makeState(),
      objectiveMiniAnswers: makeMiniAnswers(),
      objectiveRetrievalQueriesLog: [{ objective_id: "obj-1", query: "fast quality mode deadlines" }],
      debugPayload,
      applyDialogueProfilePrompt: (prompt: string) => prompt,
      recordPromptRewriteStage: vi.fn(),
      runLocalWithOverflowRetry: vi.fn(),
      appendLlmCallDebug: vi.fn(),
      stripPromptEchoFromAnswer: (text: string) => text,
      clipText: (value: string, maxChars: number) => value.slice(0, maxChars),
      pushAnswerPath: (entry: string) => answerPath.push(entry),
      pushObjectiveStepTranscript: (entry: HelixAskObjectiveStepTranscript) => transcripts.push(entry),
      recordObjectiveTransition: (
        state: HelixAskObjectiveLoopState,
        to,
        reason,
        at,
      ) => {
        const transitioned = recordHelixAskObjectiveTransition({
          state,
          to,
          reason,
          transitionLog,
          transitionLogMax: 16,
          at,
        });
        transitionLog = transitioned.transitionLog;
        return transitioned.state;
      },
    },
  };
};

describe("helix ask objective execution runtime", () => {
  it("completes the objective loop when mini synth and critic both cover the objective", async () => {
    const { args, transcripts } = buildArgs();
    const runLocal = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          text: JSON.stringify({
            objectives: [
              {
                objective_id: "obj-1",
                status: "covered",
                matched_slots: ["docs-path", "runtime-flag"],
                missing_slots: [],
                summary: "Fast quality mode shortens the finalize deadline and forces faster answer closure.",
                evidence_refs: ["docs/helix-ask-reasoning-ladder-research-report.md"],
              },
            ],
          }),
        },
        llm: { provider: "test", phase: "synth" },
      })
      .mockResolvedValueOnce({
        result: {
          text: JSON.stringify({
            objectives: [
              {
                objective_id: "obj-1",
                status: "covered",
                missing_slots: [],
                reason: "grounded enough",
              },
            ],
          }),
        },
        llm: { provider: "test", phase: "critic" },
      });

    const result = await runHelixAskObjectiveMiniExecution({
      ...args,
      runLocalWithOverflowRetry: runLocal,
    });

    expect(result.objectiveMiniSynthMode).toBe("llm");
    expect(result.objectiveMiniCriticMode).toBe("llm");
    expect(result.validationPassed).toBe(true);
    expect(result.objectiveGateConsistencyBlocked).toBe(false);
    expect(result.objectiveMiniAnswers[0]).toMatchObject({
      status: "covered",
      missing_slots: [],
    });
    expect(result.objectiveLoopState[0]).toMatchObject({
      status: "complete",
      matched_slots: ["docs-path", "runtime-flag"],
    });
    expect(transcripts.some((entry) => entry.verb === "MINI_SYNTH")).toBe(true);
    expect(transcripts.some((entry) => entry.verb === "MINI_CRITIC")).toBe(true);
    expect(runLocal).toHaveBeenCalledTimes(2);
  });

  it("fails closed when unresolved objectives are missing scoped retrieval evidence", async () => {
    const { args, debugPayload, answerPath } = buildArgs();

    const result = await runHelixAskObjectiveMiniExecution({
      ...args,
      llmUnavailableAtTurnStart: true,
      objectiveRetrievalQueriesLog: [],
      runLocalWithOverflowRetry: vi.fn(),
    });

    expect(result.objectiveMiniSynthMode).toBe("heuristic_fallback");
    expect(result.objectiveMiniCriticMode).toBe("heuristic_fallback");
    expect(result.objectiveMissingScopedRetrievalAny).toBe(true);
    expect(result.validationPassed).toBe(false);
    expect(result.validationFailReason).toBe("objective_retrieval_missing_for_unresolved");
    expect(result.objectiveGateConsistencyBlocked).toBe(true);
    expect(debugPayload.objective_gate_consistency_reasons).toContain("missing_scoped_retrieval");
    expect(answerPath).toContain("objectiveGateConsistency:blocked");
  });
});
