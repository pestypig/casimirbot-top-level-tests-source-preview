import { describe, it, expect } from "vitest";
import { runCommand } from "../server/utils/execute-command";

describe("AGIBOT asset manifest validator", () => {
  it("passes deterministic validator", async () => {
    const result = await runCommand("npx", ["tsx", "scripts/validate-agibot-asset-manifest.ts"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("PASS agibot_asset_manifest");
  });
});
