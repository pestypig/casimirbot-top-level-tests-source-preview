import { describe, expect, it } from "vitest";

import { __testHelixAskReliabilityGuards } from "../server/routes/agi.plan";

describe("helix ask warp+ethos relation routing guard", () => {
  it("detects true warp+ethos relation prompts", () => {
    const question = "How does warp bubble progress relate to mission ethos constraints?";
    expect(__testHelixAskReliabilityGuards.isWarpEthosRelationHeuristicQuestion(question)).toBe(true);
    expect(__testHelixAskReliabilityGuards.isWarpEthosRelationQuestion(question)).toBe(true);
  });

  it("rejects relation prompts without ethos cues", () => {
    const question = "How does a warp bubble relate to Mercury precession?";
    expect(__testHelixAskReliabilityGuards.isWarpEthosRelationHeuristicQuestion(question)).toBe(false);
    expect(__testHelixAskReliabilityGuards.isWarpEthosRelationQuestion(question)).toBe(false);
  });

  it("rejects relation prompts without warp cues", () => {
    const question = "How does mission ethos relate to civic trust?";
    expect(__testHelixAskReliabilityGuards.isWarpEthosRelationHeuristicQuestion(question)).toBe(false);
    expect(__testHelixAskReliabilityGuards.isWarpEthosRelationQuestion(question)).toBe(false);
  });
});
