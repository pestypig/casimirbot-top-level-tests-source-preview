import { describe, expect, it, vi } from "vitest";

import { runHelixAskObjectiveRetrieveProposal } from "../server/services/helix-ask/objectives/objective-retrieval-shell";

const mergeQueries = (baseQueries: string[], extraQueries: string[], maxQueries: number): string[] =>
  Array.from(new Set([...baseQueries, ...extraQueries])).slice(0, maxQueries);

describe("helix ask objective retrieval shell", () => {
  it("uses llm proposal queries when structured output succeeds", async () => {
    const runLocal = vi.fn(async () => ({
      result: {
        text: '{"objective_id":"obj-1","queries":["q2","q3"],"rationale":"better coverage"}',
      },
      llm: { provider: "test" },
    }));
    const result = await runHelixAskObjectiveRetrieveProposal({
      baseQuestion: "How does it work?",
      objectiveId: "obj-1",
      objectiveLabel: "Mechanism",
      requiredSlots: ["mechanism"],
      missingSlots: ["mechanism"],
      queryHints: ["mechanism"],
      responseLanguage: "en",
      dialogueProfile: null,
      promptRewriteMode: "on",
      proposalBudget: 200,
      mergeQueryLimit: 6,
      deterministicQueries: ["q1"],
      traceId: "trace-1",
      applyDialogueProfilePrompt: (prompt) => prompt,
      recordPromptRewriteStage: vi.fn(),
      runLocalWithOverflowRetry: runLocal,
      appendLlmCallDebug: vi.fn(),
      stripPromptEchoFromAnswer: (text) => text,
      clipText: (text, maxChars) => text.slice(0, maxChars),
      mergeQueries,
    });
    expect(result.used).toBe(true);
    expect(result.queries).toEqual(["q1", "q2", "q3"]);
    expect(result.reason).toBe("better coverage");
    expect(runLocal).toHaveBeenCalledTimes(1);
  });

  it("repairs invalid proposal output before falling back", async () => {
    const runLocal = vi
      .fn()
      .mockResolvedValueOnce({
        result: { text: "not json" },
        llm: { provider: "test" },
      })
      .mockResolvedValueOnce({
        result: {
          text: '{"objective_id":"obj-1","queries":["q-fixed"],"rationale":"repaired"}',
        },
        llm: { provider: "test" },
      });
    const onSchemaRepairApplied = vi.fn();
    const result = await runHelixAskObjectiveRetrieveProposal({
      baseQuestion: "How does it work?",
      objectiveId: "obj-1",
      objectiveLabel: "Mechanism",
      requiredSlots: ["mechanism"],
      missingSlots: ["mechanism"],
      queryHints: ["mechanism"],
      responseLanguage: "en",
      dialogueProfile: null,
      promptRewriteMode: "on",
      proposalBudget: 200,
      mergeQueryLimit: 6,
      deterministicQueries: ["q1"],
      traceId: "trace-2",
      applyDialogueProfilePrompt: (prompt) => prompt,
      recordPromptRewriteStage: vi.fn(),
      runLocalWithOverflowRetry: runLocal,
      appendLlmCallDebug: vi.fn(),
      stripPromptEchoFromAnswer: (text) => text,
      clipText: (text, maxChars) => text.slice(0, maxChars),
      mergeQueries,
      onSchemaRepairApplied,
    });
    expect(result.used).toBe(true);
    expect(result.repairAttempted).toBe(true);
    expect(result.repairSuccess).toBe(true);
    expect(result.queries).toEqual(["q1", "q-fixed"]);
    expect(onSchemaRepairApplied).toHaveBeenCalledTimes(1);
    expect(runLocal).toHaveBeenCalledTimes(2);
  });

  it("returns deterministic queries when llm output stays invalid", async () => {
    const result = await runHelixAskObjectiveRetrieveProposal({
      baseQuestion: "How does it work?",
      objectiveId: "obj-1",
      objectiveLabel: "Mechanism",
      requiredSlots: ["mechanism"],
      missingSlots: ["mechanism"],
      queryHints: ["mechanism"],
      responseLanguage: "en",
      dialogueProfile: null,
      promptRewriteMode: "on",
      proposalBudget: 200,
      mergeQueryLimit: 6,
      deterministicQueries: ["q1"],
      traceId: "trace-3",
      applyDialogueProfilePrompt: (prompt) => prompt,
      recordPromptRewriteStage: vi.fn(),
      runLocalWithOverflowRetry: vi.fn(async () => ({
        result: { text: "still bad" },
        llm: { provider: "test" },
      })),
      appendLlmCallDebug: vi.fn(),
      stripPromptEchoFromAnswer: (text) => text,
      clipText: (text, maxChars) => text.slice(0, maxChars),
      mergeQueries,
    });
    expect(result.used).toBe(false);
    expect(result.queries).toEqual(["q1"]);
    expect(result.failReason).toBeTruthy();
  });
});
