import { describe, expect, it } from "vitest";

import {
  collectSourcesLineCitationRefs,
  scoreDeterministicClaimCitationLinkage,
} from "../server/services/helix-ask/surface/citation-linking";
import { completeHelixAskCitations } from "../server/services/helix-ask/surface/citation-completion";

const splitGroundedSentences = (text: string): string[] =>
  text
    .split(/[.!?]\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const extractCitationTokensFromText = (value: string): string[] => {
  const matches = value.match(/\[(gate|certificate):[^\]]+\]/gi) ?? [];
  return matches.map((entry) => entry.slice(1, -1));
};

describe("helix ask citation linking helpers", () => {
  it("collects and deduplicates sources-line citations", () => {
    expect(
      collectSourcesLineCitationRefs(
        "Sources: server/routes/agi.plan.ts, docs/helix-ask-flow.md\nSources: docs/helix-ask-flow.md",
      ),
    ).toEqual(["server/routes/agi.plan.ts", "docs/helix-ask-flow.md"]);
  });

  it("scores missing and weak deterministic claim citation linkage", () => {
    const missing = scoreDeterministicClaimCitationLinkage({
      value:
        "The system enforces deterministic evidence gates. It records strict fail reasons.",
      splitGroundedSentences,
      extractCitationTokensFromText,
    });
    expect(missing.failReasons).toEqual(["CLAIM_CITATION_LINK_MISSING"]);

    const weak = scoreDeterministicClaimCitationLinkage({
      value: [
        "Quality floor appends source anchors from server/routes/agi.plan.ts.",
        "Semantic scoring also evaluates unsupported claim rates.",
        "Sources: server/routes/agi.plan.ts",
      ].join("\n\n"),
      splitGroundedSentences,
      extractCitationTokensFromText,
    });
    expect(weak.failReasons).toEqual(["CLAIM_CITATION_LINK_WEAK"]);
    expect(weak.linkedClaimCount).toBe(1);
  });
});

describe("helix ask citation completion helpers", () => {
  it("filters unlinked citations when grounded evidence covers a subset", async () => {
    const result = await completeHelixAskCitations({
      outputText: "The route logic lives in server/routes/agi.plan.ts.",
      citations: ["server/routes/agi.plan.ts", "docs/missing.md"],
      retrievalCandidates: [{ kind: "repo", path: "server/routes/agi.plan.ts" } as any],
      retrievalSelected: [{ kind: "repo", path: "server/routes/agi.plan.ts" } as any],
      buildSafeRetrievalFallback: async () => ({ candidates: [], selected: [] }),
    });

    expect(result.citations).toEqual(["server/routes/agi.plan.ts"]);
    expect(result.added).toBe(true);
    expect(result.metrics.citationsPreCompletion).toBe(2);
    expect(result.metrics.citationsPostCompletion).toBe(1);
  });

  it("adds grounded citations from retrieval evidence when claims are present", async () => {
    const result = await completeHelixAskCitations({
      outputText:
        "The route handler is implemented in server/routes/agi.plan.ts and surface shaping lives in server/services/helix-ask/surface/ask-answer-surface.ts.",
      citations: [],
      retrievalCandidates: [
        { kind: "repo", path: "server/routes/agi.plan.ts" } as any,
        { kind: "repo", path: "server/services/helix-ask/surface/ask-answer-surface.ts" } as any,
      ],
      retrievalSelected: [],
      buildSafeRetrievalFallback: async () => ({ candidates: [], selected: [] }),
    });

    expect(result.citations).toContain("server/routes/agi.plan.ts");
    expect(result.citations).toContain(
      "server/services/helix-ask/surface/ask-answer-surface.ts",
    );
    expect(result.metrics.citationsPreCompletion).toBe(0);
    expect(result.metrics.citationsPostCompletion).toBeGreaterThanOrEqual(2);
  });

  it("uses safe retrieval fallback when completion needs evidence", async () => {
    const result = await completeHelixAskCitations({
      outputText: "The route handler is implemented in server/routes/agi.plan.ts.",
      citations: [],
      retrievalCandidates: [],
      retrievalSelected: [],
      searchQuery: "ask route",
      buildSafeRetrievalFallback: async () => ({
        candidates: [{ kind: "repo", path: "server/routes/agi.plan.ts" } as any],
        selected: [],
      }),
    });

    expect(result.citations).toEqual(["server/routes/agi.plan.ts"]);
    expect(result.metrics.completionQueriesCount).toBe(1);
  });
});
