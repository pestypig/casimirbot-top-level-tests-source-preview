import { describe, expect, it } from "vitest";

import {
  buildHelixAskClarifyRescuePrompt,
  isHelixAskClarifyRescueCandidateQuestion,
  isHelixAskClarifyRescueGreetingOnlyQuestion,
  parseHelixAskClarifyRescueDecision,
  renderHelixAskClarifyRescueGreetingOnlyAnswer,
} from "../server/services/helix-ask/policy/clarify-rescue";

describe("helix ask clarify rescue policy", () => {
  it("builds a strict-json micro-planner prompt", () => {
    const prompt = buildHelixAskClarifyRescuePrompt({
      question: "Hello?",
      currentClarify: "Do you mean client/src or tests?",
      repoCueSummary: "explicitRepoExpectation=no",
    });
    expect(prompt).toMatch(/Return strict JSON only/i);
    expect(prompt).toMatch(/Question: Hello\?/);
    expect(prompt).toMatch(/Current clarify candidate/i);
  });

  it("parses strict-json rescue decisions", () => {
    const parsed = parseHelixAskClarifyRescueDecision(
      '{"lane":"conversation","action":"answer","answer":"Hi. I can help with code, docs, or strategy.","confidence":0.92}',
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.action).toBe("answer");
    expect(parsed?.confidence).toBeCloseTo(0.92, 5);
    expect(parsed?.answer).toMatch(/^Hi\./);
  });

  it("returns null on malformed rescue output", () => {
    expect(parseHelixAskClarifyRescueDecision("not-json")).toBeNull();
  });

  it("targets greeting-like turns only", () => {
    expect(isHelixAskClarifyRescueCandidateQuestion("Hello?")).toBe(true);
    expect(isHelixAskClarifyRescueCandidateQuestion("How are you")).toBe(true);
    expect(isHelixAskClarifyRescueCandidateQuestion("What is 2 + 2?")).toBe(false);
    expect(
      isHelixAskClarifyRescueCandidateQuestion(
        "How does llm.local.generate route to HTTP in this codebase?",
      ),
    ).toBe(false);
  });

  it("detects greeting-only turns for deterministic fast-path", () => {
    expect(isHelixAskClarifyRescueGreetingOnlyQuestion("Hello")).toBe(true);
    expect(isHelixAskClarifyRescueGreetingOnlyQuestion("thanks!")).toBe(true);
    expect(isHelixAskClarifyRescueGreetingOnlyQuestion("hello can you inspect server/routes.ts")).toBe(
      false,
    );
    expect(isHelixAskClarifyRescueGreetingOnlyQuestion("What is 2 + 2?")).toBe(false);
  });

  it("renders deterministic greeting-only replies", () => {
    expect(renderHelixAskClarifyRescueGreetingOnlyAnswer("Hello")).toBe(
      "Hello! How can I assist you today?",
    );
    expect(renderHelixAskClarifyRescueGreetingOnlyAnswer("Thank you")).toMatch(/^You're welcome\./);
    expect(renderHelixAskClarifyRescueGreetingOnlyAnswer("How are you?")).toMatch(/^I'm ready to help\./);
    expect(renderHelixAskClarifyRescueGreetingOnlyAnswer("hello can you inspect tests")).toBeNull();
  });
});
