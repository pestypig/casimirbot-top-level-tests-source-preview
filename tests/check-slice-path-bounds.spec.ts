import { describe, expect, it } from "vitest";
import { evaluateSlicePathBounds } from "../scripts/check-slice-path-bounds";

describe("evaluateSlicePathBounds", () => {
  it("accepts files under allowlisted folders", () => {
    const result = evaluateSlicePathBounds({
      changedPaths: [
        "reports/helix-ask-direct-codex-build-closure-2026-02-27.md",
        "tests/new-check.spec.ts",
      ],
      allowedPaths: ["reports/", "tests/"],
    });

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("rejects files outside allowlist with deterministic reason", () => {
    const result = evaluateSlicePathBounds({
      changedPaths: ["server/routes/knowledge.ts", "reports/a.md"],
      allowedPaths: ["reports/"],
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      { path: "server/routes/knowledge.ts", reason: "outside_allowlist" },
    ]);
  });
});
