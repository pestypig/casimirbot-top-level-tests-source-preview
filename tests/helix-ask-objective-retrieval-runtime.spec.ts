import { describe, expect, it, vi } from "vitest";

import { runHelixAskRetrievalRuntimeShell } from "../server/services/helix-ask/objectives/objective-retrieval-runtime";

const mergeQueries = (baseQueries: string[], extraQueries: string[], maxQueries: number): string[] =>
  Array.from(new Set([...baseQueries, ...extraQueries])).slice(0, maxQueries);

const buildArgs = (options?: {
  allowRetrievalRetryByPolicy?: boolean;
  canAgentAct?: boolean;
}) => {
  const debugPayload: Record<string, unknown> = {};
  const answerPath: string[] = [];
  const agentActions: Array<Record<string, unknown>> = [];
  const controllerSteps: Array<Record<string, unknown>> = [];
  const buildFallbackContext = vi
    .fn()
    .mockResolvedValueOnce({ files: ["docs/capsule.md"] })
    .mockResolvedValueOnce({ files: ["docs/retry.md"] })
    .mockResolvedValueOnce({ files: ["server/runtime.ts"] });
  const applyContextAttempt = vi
    .fn()
    .mockReturnValueOnce({ applied: true, missingSlots: [], observedDelta: "capsule" })
    .mockReturnValueOnce({
      applied: true,
      missingSlots: ["scheduler"],
      observedDelta: "retry",
    })
    .mockReturnValueOnce({ applied: true, missingSlots: [], observedDelta: "code" });

  return {
    debugPayload,
    answerPath,
    agentActions,
    controllerSteps,
    buildFallbackContext,
    applyContextAttempt,
    args: {
      capsuleRetryApplied: false,
      contextText: "General answer without capsule anchors.",
      contextFiles: ["docs/overview.md"],
      capsuleMustKeepTerms: ["scheduler"],
      capsulePreferredEvidencePaths: ["docs/capsule.md"],
      retrievalRetryEnabled: true,
      promptIngested: false,
      objectiveLoopEnabled: true,
      objectiveLoopStateLength: 1,
      canAgentAct: () => options?.canAgentAct ?? true,
      baseQueries: ["warp bubble"],
      queryMergeMax: 8,
      contextFilesLimit: 4,
      requestTopK: 3,
      retryTopKBonus: 1,
      planScope: { allowlistTiers: [] },
      buildFallbackContext,
      applyContextAttempt,
      beginObjectiveRetrievalPass: vi.fn(),
      logStepStart: vi.fn(() => 100),
      logStepEnd: vi.fn(),
      mergeQueries,
      pushAnswerPath: (entry: string) => answerPath.push(entry),
      hasCapsuleFocusTerm: vi.fn(() => false),
      normalizeCapsulePathKey: (value: string) => value.toLowerCase(),
      isCapsuleRetrievalDriftDetected: vi.fn(() => true),
      fastQualityMode: true,
      getAskElapsedMs: () => 0,
      fastQualityPlanRetrievalBudgetMs: 5_000,
      pushFastQualityDecision: vi.fn(),
      isRepoQuestion: true,
      hasRepoHints: true,
      slotCoverageFailed: true,
      docSlotSummary: { missingSlots: ["scheduler"] },
      coverageSlotSummary: { missingSlots: [] },
      retrievalConfidence: 0.2,
      arbiterRepoRatio: 0.8,
      arbiterHybridRatio: 0.6,
      allowRetrievalRetryByPolicy: options?.allowRetrievalRetryByPolicy ?? false,
      buildRetryHintsForSlots: (slotIds: string[]) => slotIds.map((slotId) => `${slotId} hint`),
      topicMustIncludeFiles: ["docs/required.md"],
      compositeRequiredFiles: ["docs/composite.md"],
      verificationAnchorHints: ["docs/anchor.md"],
      codeFirstEnabled: true,
      buildCodeFirstPlanScopeOverride: (scope?: Record<string, unknown> | null) => ({
        ...(scope ?? {}),
        codeFirst: true,
      }),
      recordAgentAction: (
        action: string,
        reason: string,
        goal: string,
        delta: string,
        applied?: boolean,
        durationMs?: number,
      ) => {
        agentActions.push({ action, reason, goal, delta, applied, durationMs });
      },
      recordControllerStep: (entry: Record<string, unknown>) => {
        controllerSteps.push(entry);
      },
      evidenceGateOk: true,
      slotCoverageOk: false,
      docSlotCoverageFailed: true,
      markAgentStopIfBlocked: vi.fn(),
      debugPayload,
    },
  };
};

describe("helix ask objective retrieval runtime shell", () => {
  it("runs capsule retry plus retry/code-first retrieval and records debug payload", async () => {
    const {
      args,
      debugPayload,
      answerPath,
      buildFallbackContext,
      applyContextAttempt,
      agentActions,
      controllerSteps,
    } = buildArgs();

    const result = await runHelixAskRetrievalRuntimeShell(args);

    expect(result.capsuleRetryApplied).toBe(true);
    expect(result.retrievalRetryPolicyOverride).toBe(true);
    expect(result.allowRetrievalRetryEffective).toBe(true);
    expect(result.shouldRetryRetrieval).toBe(true);
    expect(debugPayload.capsule_retry_triggered).toBe(true);
    expect(debugPayload.capsule_retry_applied).toBe(true);
    expect(debugPayload.retrieval_retry_policy_override).toBe(true);
    expect(debugPayload.retrieval_retry_allow_effective).toBe(true);
    expect(debugPayload.retrieval_retry_skipped_by_policy).toBe(true);
    expect(answerPath).toContain("retrieval:capsule_retry");
    expect(buildFallbackContext).toHaveBeenCalledTimes(3);
    expect(applyContextAttempt).toHaveBeenCalledTimes(3);
    expect(agentActions.map((entry) => entry.action)).toEqual([
      "slot_local_retry",
      "retrieve_code_first",
    ]);
    expect(controllerSteps.map((entry) => entry.step)).toEqual(["retry", "code_first"]);
  });

  it("marks the agent blocked when code-first remains but the agent cannot act", async () => {
    const { args, buildFallbackContext } = buildArgs({
      allowRetrievalRetryByPolicy: true,
      canAgentAct: false,
    });

    const result = await runHelixAskRetrievalRuntimeShell(args);

    expect(result.shouldRetryRetrieval).toBe(false);
    expect(buildFallbackContext).not.toHaveBeenCalled();
    expect(args.markAgentStopIfBlocked).toHaveBeenCalledTimes(1);
  });
});
