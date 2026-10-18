import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand } from "../server/utils/execute-command";
import { describe, expect, it } from "vitest";

describe("NHM2 cavity contract validator CLI", () => {
  const scriptPath = path.join(
    "scripts",
    "validate-needle-hull-mark2-cavity-contract.ts",
  );

  it("passes for the canonical NHM2 contract", async () => {
    const result = await runCommand("npx", ["tsx", scriptPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("PASS needle_hull_mark2_cavity_contract");
    expect(result.stdout).toContain("status=geometry_freeze");
  });

  it("fails deterministically for an invalid contract payload", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nhm2-contract-"));
    const invalidPath = path.join(tempDir, "invalid-contract.json");
    fs.writeFileSync(
      invalidPath,
      JSON.stringify({
        solutionCategory: "Needle Hull Mark 2",
        status: "geometry_freeze",
      }),
      "utf8",
    );

    const result = await runCommand(
      "npx",
      ["tsx", scriptPath, "--contract", invalidPath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FAIL nhm2_cavity_contract_schema");
  });
});
