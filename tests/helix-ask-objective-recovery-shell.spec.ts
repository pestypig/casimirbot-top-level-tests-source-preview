import { describe, expect, it, vi } from "vitest";

import { runHelixAskObjectiveScopedRecoveryShell } from "../server/services/helix-ask/objectives/objective-recovery-shell";
import type {
  HelixAskObjectiveLoopState,
  HelixAskObjectiveStepTranscript,
} from "../server/services/helix-ask/objectives/objective-loop-debug";

const makeState = (): HelixAskObjectiveLoopState[] => [
  {
    objective_id: "obj-1",
    objective_label: "Warp bubble mechanism",
    required_slots: ["mechanism"],
    matched_slots: [],
    status: "pending",
    attempt: 0,
    retrieval_confidence: 0.2,
  },
];

const mergeQueries = (baseQueries: string[], extraQueries: string[], maxQueries: number): string[] =>
  Array.from(new Set([...baseQueries, ...extraQueries])).slice(0, maxQueries);

const buildArgs = (options?: {
  applyResult?: boolean;
  files?: string[];
}) => {
  let objectiveLoopState = makeState();
  let objectiveRetrievalQueriesLog: Array<{ objective_id: string }> = [];
  let objectiveRetrievalPassCount = 0;
  let retrievalConfidence = 0.2;
  let syncCount = 0;
  const debugPayload: Record<string, unknown> = {};
  const answerPath: string[] = [];
  const transcripts: HelixAskObjectiveStepTranscript[] = [];

  return {
    debugPayload,
    answerPath,
    transcripts,
    args: {
      objectiveLoopEnabled: true,
      initialObjectiveLoopState: objectiveLoopState,
      getObjectiveLoopState: () => objectiveLoopState,
      getObjectiveRetrievalQueriesLog: () => objectiveRetrievalQueriesLog,
      getObjectiveRetrievalPassCount: () => objectiveRetrievalPassCount,
      getRetrievalConfidence: () => retrievalConfidence,
      promptIngested: false,
      definitionRoutingSalvagePreEligible: false,
      definitionRepoAnchorCueDetected: false,
      definitionRepoAnchorObjectiveCue: false,
      definitionCommonalityCueDetected: false,
      definitionCommonalityObjectiveCue: false,
      baseQuestion: "How does the warp bubble mechanism work?",
      responseLanguage: "en",
      dialogueProfile: null,
      personaId: "helix",
      traceId: "trace-1",
      request: {
        max_tokens: 256,
        temperature: 0.2,
        seed: 7,
        stop: undefined,
        sessionId: "session-1",
        topK: 4,
      },
      llmUnavailableAtTurnStart: true,
      answerGenerationFailedForTurn: false,
      preserveAnswerAcrossComposer: false,
      fastQualityMode: false,
      getFastElapsedMs: () => 0,
      finalizeDeadlineMs: 5_000,
      answerMaxTokens: 512,
      queryMergeMax: 8,
      contextFilesLimit: 4,
      objectiveScopedRetrievalMaxObjectives: 4,
      objectiveScopedRetrievalMaxQueryHints: 4,
      objectivePromptRewriteMode: "on" as const,
      objectiveRetrieveProposalMode: "none" as const,
      objectiveRetrieveProposalFailReason: null,
      objectiveRetrieveProposalLlmAttempted: false,
      objectiveRetrieveProposalLlmInvoked: false,
      objectiveRetrieveProposalPromptPreview: null,
      objectiveRetrieveProposalAppliedCount: 0,
      objectiveRetrieveProposalRepairAttempted: false,
      objectiveRetrieveProposalRepairSuccess: false,
      objectiveRetrieveProposalRepairFailReason: null,
      objectiveRecoveryNoContextRetryableCount: 0,
      objectiveRecoveryNoContextTerminalCount: 0,
      objectiveRecoveryErrorRetryableCount: 0,
      objectiveRecoveryErrorTerminalCount: 0,
      routingSalvageApplied: false,
      routingSalvageReason: null,
      routingSalvageRetrievalAddedCount: 0,
      verificationAnchorHints: ["mechanism"],
      routingSalvageHints: [],
      contextFiles: ["docs/warp.md"],
      objectiveContractsByLabel: new Map([
        ["warp bubble mechanism", { label: "Warp bubble mechanism", query_hints: ["mechanism"] }],
      ]),
      normalizeObjectiveLabelKey: (value: string) => value.trim().toLowerCase(),
      canAgentAct: () => true,
      computeObjectiveLoopPrimaryActive: () => true,
      buildRetryHintsForSlots: (slots: string[]) => slots,
      mergeQueries,
      buildAskContextFromQueries: vi.fn(async () => ({
        files: options?.files ?? ["docs/warp.md"],
        queryHitCount: 1,
        topScore: 0.9,
        scoreGap: 0.3,
        topicMustIncludeOk: true,
      })),
      topicProfile: {},
      planScope: undefined,
      intentDomain: "repo",
      intentId: "repo_lookup",
      topicTags: ["warp"],
      codeMixedTurn: false,
      applyContextAttempt: vi.fn((_label, result) => {
        if (options?.applyResult === false) {
          return { applied: false, missingSlots: ["mechanism"] };
        }
        if (result.files.length > 0) {
          objectiveLoopState = objectiveLoopState.map((state) =>
            state.objective_id === "obj-1"
              ? {
                  ...state,
                  matched_slots: ["mechanism"],
                  status: "complete",
                }
              : state,
          );
          retrievalConfidence = 0.8;
          return { applied: true, missingSlots: [] };
        }
        return { applied: false, missingSlots: ["mechanism"] };
      }),
      objectiveCoverageRatio: (state?: HelixAskObjectiveLoopState | null) =>
        state && state.required_slots.length > 0
          ? Number((state.matched_slots.length / state.required_slots.length).toFixed(4))
          : 0,
      beginObjectiveRetrievalPass: (_reason: string, _queries: string[], objectiveIds?: string[]) => {
        objectiveRetrievalPassCount += 1;
        if (objectiveIds?.[0]) {
          objectiveRetrievalQueriesLog = [
            ...objectiveRetrievalQueriesLog,
            { objective_id: objectiveIds[0] },
          ];
        }
      },
      pushObjectiveRetrievalProbe: vi.fn(),
      logStepStart: vi.fn(() => 123),
      logStepEnd: vi.fn(),
      pushObjectiveStepTranscript: (entry: HelixAskObjectiveStepTranscript) =>
        transcripts.push(entry),
      pushAnswerPath: (entry: string) => answerPath.push(entry),
      applyDialogueProfilePrompt: (prompt: string) => prompt,
      recordPromptRewriteStage: vi.fn(),
      runLocalWithOverflowRetry: vi.fn(),
      appendLlmCallDebug: vi.fn(),
      stripPromptEchoFromAnswer: (text: string) => text,
      clipText: (text: string, maxChars: number) => text.slice(0, maxChars),
      isObjectiveRecoveryRetryableError: () => false,
      debugPayload,
      syncObjectiveLoopDebug: () => {
        syncCount += 1;
      },
    },
    getSyncCount: () => syncCount,
  };
};

describe("helix ask objective recovery shell", () => {
  it("applies deterministic recovery and records recovery debug", async () => {
    const { args, debugPayload, transcripts, getSyncCount } = buildArgs();

    const result = await runHelixAskObjectiveScopedRecoveryShell(args);

    expect(result.objectiveRecoveryPassCount).toBe(2);
    expect(result.objectiveRecoveryNoContextCount).toBe(0);
    expect(result.objectiveRetrieveProposalMode).toBe("heuristic_fallback");
    expect(debugPayload.objective_scoped_retrieval_recovery_applied).toBe(true);
    expect(debugPayload.objective_scoped_retrieval_recovery_count).toBe(1);
    expect(transcripts.filter((entry) => entry.decision === "retrieval_applied")).toHaveLength(1);
    expect(getSyncCount()).toBe(1);
  });

  it("tracks retryable then terminal no-context recovery outcomes", async () => {
    const { args, debugPayload, transcripts } = buildArgs({
      applyResult: false,
      files: [],
    });

    const result = await runHelixAskObjectiveScopedRecoveryShell(args);

    expect(result.objectiveRecoveryPassCount).toBe(2);
    expect(result.objectiveRecoveryNoContextCount).toBe(2);
    expect(result.objectiveRecoveryNoContextRetryableCount).toBe(1);
    expect(result.objectiveRecoveryNoContextTerminalCount).toBe(1);
    expect(debugPayload.objective_scoped_retrieval_recovery_no_context_count).toBe(2);
    expect(transcripts.filter((entry) => entry.decision === "retrieval_no_context")).toHaveLength(2);
  });
});
