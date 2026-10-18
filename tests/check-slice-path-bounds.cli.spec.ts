import path from "node:path";
import { runCommand } from "../server/utils/execute-command";
import { describe, expect, it } from "vitest";

describe("check-slice-path-bounds CLI", () => {
  const scriptPath = path.join("scripts", "check-slice-path-bounds.ts");

  it("exits 0 and emits JSON when all changed paths are allowed", async () => {
    const result = await runCommand("npx", [
      "tsx",
      scriptPath,
      "reports/a.md,tests/check.spec.ts",
      "reports/,tests/",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, violations: [] });
  });

  it("exits 2 and emits deterministic outside_allowlist violation JSON", async () => {
    const result = await runCommand(
      "npx",
      ["tsx", scriptPath, "server/routes/knowledge.ts,reports/a.md", "reports/"],
      { reject: false },
    );

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      violations: [{ path: "server/routes/knowledge.ts", reason: "outside_allowlist" }],
    });
  });
});
