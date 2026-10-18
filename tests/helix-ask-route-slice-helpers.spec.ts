import { describe, expect, it } from "vitest";

import {
  resolveExecutionHandledSummary,
  resolveSafetyHandledSummary,
} from "../server/services/helix-ask/policy/summary-handling";
import { buildEvidenceKey, mergeEvidence } from "../server/services/helix-ask/retrieval/evidence-merging";
import { collectStepCitations } from "../server/services/helix-ask/surface/step-citations";

describe("helix ask summary handling policy", () => {
  it("preserves pre-handled summaries", () => {
    const detector = () => ({ handled: true });
    expect(resolveSafetyHandledSummary("denied", false, detector)).toEqual({
      summary: "denied",
      handled: true,
    });
    expect(resolveExecutionHandledSummary("failed", false, detector)).toEqual({
      summary: "failed",
      handled: true,
    });
  });

  it("injects deterministic fallback text when not handled", () => {
    const detector = () => ({ handled: false });
    expect(resolveSafetyHandledSummary("", false, detector).summary).toContain("cannot comply");
    expect(resolveExecutionHandledSummary("", false, detector).summary).toContain("unable to complete");
  });
});

describe("helix ask evidence merging", () => {
  it("deduplicates by deterministic evidence key", () => {
    const merged = mergeEvidence(
      [{ kind: "repo", id: "a", path: "docs/a.md" }],
      [{ kind: "repo", id: "a", path: "docs/a.md" }, { hash: "h2", id: "b" }],
    );
    expect(merged).toHaveLength(2);
    expect(buildEvidenceKey(merged[1] as any)).toBe("h2");
  });
});

describe("helix ask step citations", () => {
  it("collects and deduplicates citations from step and output surfaces", () => {
    const citations = collectStepCitations([
      { citations: ["docs/a.md", " "] },
      { output: { citations: ["docs/a.md", "server/x.ts"] } },
    ]);
    expect(citations).toEqual(["docs/a.md", "server/x.ts"]);
  });
});
