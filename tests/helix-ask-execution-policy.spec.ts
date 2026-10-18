import { describe, expect, it } from "vitest";

import {
  shouldOverrideHelixAskRetrievalRetryPolicy,
  shouldPreferHelixAskPlannerLlmInFastMode,
  shouldUseHelixAskRiskTriggeredTwoPass,
} from "../server/services/helix-ask/policy/execution-policy";

describe("helix ask execution policy", () => {
  it("prefers planner llm in fast mode for repo-grounded turns", () => {
    expect(
      shouldPreferHelixAskPlannerLlmInFastMode({
        fastQualityMode: true,
        question: "Explain how answer_path is populated and useful for diagnostics.",
        intentDomain: "repo",
        requiresRepoEvidence: true,
        explicitRepoExpectation: true,
        hasFilePathHints: false,
        endpointHintCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldPreferHelixAskPlannerLlmInFastMode({
        fastQualityMode: true,
        question: "Define entropy.",
        intentDomain: "general",
        requiresRepoEvidence: false,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
      }),
    ).toBe(false);
  });

  it("uses heuristic and risk-triggered two-pass decisions", () => {
    expect(
      shouldUseHelixAskRiskTriggeredTwoPass({
        enabled: true,
        allowByPolicy: true,
        question: "How does the helix ask pipeline work?",
        promptIngested: false,
        hasRepoHints: false,
        isRepoQuestion: false,
        requiresRepoEvidence: false,
        format: "brief",
        retrievalConfidence: 0.9,
        hybridThreshold: 0.4,
        slotMissingCount: 0,
        docMissingCount: 0,
      }),
    ).toEqual({ use: true, reason: "heuristic_trigger" });
    expect(
      shouldUseHelixAskRiskTriggeredTwoPass({
        enabled: true,
        allowByPolicy: true,
        question: "Need current status.",
        promptIngested: false,
        hasRepoHints: true,
        isRepoQuestion: true,
        requiresRepoEvidence: true,
        format: "steps",
        retrievalConfidence: 0.18,
        hybridThreshold: 0.4,
        slotMissingCount: 1,
        docMissingCount: 0,
      }),
    ).toEqual({ use: true, reason: "risk_trigger" });
  });

  it("overrides retrieval retry policy only for fast repo risk", () => {
    expect(
      shouldOverrideHelixAskRetrievalRetryPolicy({
        fastQualityMode: true,
        isRepoQuestion: true,
        hasRepoHints: true,
        missingSlotsForRetry: true,
        retrievalConfidence: 0.55,
        hybridThreshold: 0.4,
      }),
    ).toBe(true);
    expect(
      shouldOverrideHelixAskRetrievalRetryPolicy({
        fastQualityMode: false,
        isRepoQuestion: true,
        hasRepoHints: true,
        missingSlotsForRetry: true,
        retrievalConfidence: 0.1,
        hybridThreshold: 0.4,
      }),
    ).toBe(false);
  });
});
