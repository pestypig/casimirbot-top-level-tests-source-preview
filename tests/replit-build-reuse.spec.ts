import { describe, expect, it } from "vitest";
import { isExpectedBuildCleanupStatus } from "../scripts/replit-build-reuse.mjs";

describe("Replit deployment artifact reuse", () => {
  it("accepts only the tracked evaluation cleanup and generated docs metadata", () => {
    expect(isExpectedBuildCleanupStatus([
      " D artifacts/research/old-result.json",
      " D reports/old-result.md",
      " D test-results/.last-run.json",
      " M client/src/lib/docs/docMetadata.generated.ts",
    ])).toBe(true);
    expect(isExpectedBuildCleanupStatus([])).toBe(false);
    expect(isExpectedBuildCleanupStatus([
      " M client/src/lib/docs/docMetadata.generated.ts",
    ])).toBe(false);
  });

  it("rejects source edits, added files, staged deletions and renamed paths", () => {
    const cleanup = " D artifacts/research/old-result.json";
    for (const untrusted of [
      " M server/routes/managed-ai-text-turn.ts",
      "?? scripts/override.mjs",
      "D  artifacts/research/old-result.json",
      " R artifacts/result.json -> server/result.json",
      " D server/routes/managed-ai-text-turn.ts",
    ]) {
      expect(isExpectedBuildCleanupStatus([cleanup, untrusted])).toBe(false);
    }
  });
});
