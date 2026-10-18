import { describe, expect, it } from "vitest";
import { collapseEvidenceBullets } from "../server/services/helix-ask/format";

describe("Helix Ask hybrid formatting", () => {
  it("collapses repo evidence bullets into a paragraph", () => {
    const repo = [
      "1. HelixAskPill renders the ask state (client/src/components/helix/HelixAskPill.tsx).",
      "2. buildHelixCorePrompt builds the prompt (server/routes/agi.plan.ts).",
    ].join("\n");
    const paragraph = collapseEvidenceBullets(repo);
    expect(paragraph).toContain("HelixAskPill");
    expect(paragraph).toContain("buildHelixCorePrompt");
    expect(paragraph).not.toMatch(/^\s*\d+\./m);
  });
});
