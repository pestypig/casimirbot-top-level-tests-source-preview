import { describe, expect, it } from "vitest";

import {
  buildGeneralAmbiguityAnswerFloor,
  hasHelixAskConcreteDefinitionTarget,
  hasHelixAskRepoTechnicalCue,
  shouldBypassHelixAskPreIntentClarifyForCompareTarget,
  shouldBypassHelixAskPreIntentClarifyForCompositionalPrompt,
  shouldBypassHelixAskPreIntentClarifyForDefinitionTarget,
  shouldBypassHelixAskPreIntentClarifyForGeneralDefinitionTarget,
  shouldPreserveHelixAskGeneralCompareRouting,
  shouldUseGeneralAmbiguityAnswerFloor,
} from "../server/services/helix-ask/policy/pre-intent-clarify";

describe("helix ask pre-intent policy", () => {
  it("uses the general ambiguity floor only for open-world general turns", () => {
    expect(
      shouldUseGeneralAmbiguityAnswerFloor({
        intentDomain: "general",
        requiresRepoEvidence: false,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldUseGeneralAmbiguityAnswerFloor({
        intentDomain: "general",
        requiresRepoEvidence: true,
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
      }),
    ).toBe(false);
  });

  it("builds an answer-first ambiguity floor that clears the text floor", () => {
    const answer = buildGeneralAmbiguityAnswerFloor({
      question: "What's a good way to summarize evidence?",
      clarifyLine: "Do you mean for a scientific report, a code review, or a general audience?",
      minTextChars: 220,
    });

    expect(answer).toMatch(/^Best-effort answer for "What's a good way to summarize evidence\?":/);
    expect(answer).toContain("Clarify:");
    expect(answer).toContain("Implication:");
    expect(answer.length).toBeGreaterThanOrEqual(220);
  });

  it("bypasses clarify for composition, compare, and concrete definition targets", () => {
    expect(
      shouldBypassHelixAskPreIntentClarifyForCompositionalPrompt({
        question: "Say hello in one sentence.",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(true);
    expect(
      shouldBypassHelixAskPreIntentClarifyForCompareTarget(
        "Compare Needle Hull Mark 2 and Natario zero expansion.",
      ),
    ).toBe(true);
    expect(hasHelixAskConcreteDefinitionTarget("What does entropy mean in physics?")).toBe(true);
    expect(
      shouldBypassHelixAskPreIntentClarifyForDefinitionTarget({
        question: "OK what is needle hull mark 2?",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
      }),
    ).toBe(true);
    expect(
      shouldBypassHelixAskPreIntentClarifyForGeneralDefinitionTarget({
        question: "What does entropy mean in physics?",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
        intentDomain: "general",
      }),
    ).toBe(true);
  });

  it("detects repo-technical cues without over-triggering on generic wording", () => {
    expect(
      hasHelixAskRepoTechnicalCue(
        "Explain how answer_path is populated and useful for diagnostics.",
      ),
    ).toBe(true);
    expect(hasHelixAskRepoTechnicalCue("What is a practical debug payload used for?")).toBe(
      false,
    );
  });

  it("keeps short generic compare prompts out of the repo-routing lane", () => {
    expect(
      shouldPreserveHelixAskGeneralCompareRouting({
        question: "Help me compare precision and recall quickly.",
        intentDomain: "general",
        explicitRepoExpectation: false,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
      }),
    ).toBe(true);
    expect(
      shouldPreserveHelixAskGeneralCompareRouting({
        question: "Compare precision and recall in this repo.",
        intentDomain: "general",
        explicitRepoExpectation: true,
        hasFilePathHints: false,
        endpointHintCount: 0,
        requiresRepoEvidence: false,
      }),
    ).toBe(false);
  });
});
