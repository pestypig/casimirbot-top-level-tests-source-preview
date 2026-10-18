import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("helix dottie docs schema gate", () => {
  it("passes when docs/template constraints align with schema", () => {
    const result = spawnSync("npx tsx scripts/validate-helix-dottie-docs-schema.ts", {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: true,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"ok": true');
  });
});
