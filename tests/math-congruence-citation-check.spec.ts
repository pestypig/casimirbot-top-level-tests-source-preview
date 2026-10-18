import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

describe("math congruence citation checker bridge claims", () => {
  it("passes with required atomic-curvature bridge claims present", () => {
    const repoRoot = process.cwd();
    const output = execFileSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
        "scripts/math-congruence-citation-check.ts",
        "--json",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    const result = JSON.parse(output) as { errors: number; issues: Array<{ code: string }> };
    expect(result.errors).toBe(0);
    expect(result.issues.some((issue) => issue.code === "bridge_claim_required_missing")).toBe(false);
  });
});
