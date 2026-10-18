import { describe, expect, it } from "vitest";
import fs from "node:fs";

const TARGETS = [
  "docs/public-claims-boundary-sheet.md",
  "docs/warp-bubbles-lunar-transport-stakeholder-readiness-2026-02-23.md",
];

describe("wording guard", () => {
  it("prevents strobing loophole phrasing", () => {
    for (const file of TARGETS) {
      const text = fs.readFileSync(file, "utf8").toLowerCase();
      expect(/(?:strobing|pulsing)\s+is\s+a\s+loophole/.test(text)).toBe(false);
    }
  });
});
