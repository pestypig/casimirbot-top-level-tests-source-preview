import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNoRequiredCodexRuntimePackage,
  assertProviderNeutralRuntimeTree,
  classifyForbiddenAgentRuntimePath,
} from "../apps/desktop/scripts/provider-neutral-runtime-guard-lib.mjs";

const roots: string[] = [];

describe("desktop provider-neutral runtime guard", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ));
  });

  it("allows the explicit Codex client-adapter marketplace", () => {
    expect(classifyForbiddenAgentRuntimePath(
      "codex-marketplace/plugins/casimirbot-device-check/.mcp.json",
    )).toBeNull();
  });

  it.each([
    ["node_modules/@openai/codex/bin/codex.js", "bundled_openai_codex_npm_runtime"],
    ["bin/codex.exe", "bundled_codex_executable"],
    ["tools/codex.cmd", "bundled_codex_executable"],
    ["usr/bin/codex", "bundled_codex_executable"],
  ])("rejects %s", (candidate, reason) => {
    expect(classifyForbiddenAgentRuntimePath(candidate)).toBe(reason);
  });

  it("rejects a service dependency on the Codex npm runtime", () => {
    expect(() => assertNoRequiredCodexRuntimePackage({
      sharp: "0.34.3",
      "@openai/codex": "0.144.1",
    })).toThrow("must not require @openai/codex");
  });

  it("audits the actual file tree instead of trusting an allowlist label", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "casimir-runtime-guard-"));
    roots.push(root);
    await mkdir(path.join(root, "codex-marketplace"), { recursive: true });
    await writeFile(path.join(root, "codex-marketplace", "marketplace.json"), "{}\n");
    await assertProviderNeutralRuntimeTree(root);

    await mkdir(path.join(root, "bin"), { recursive: true });
    await writeFile(path.join(root, "bin", "codex.exe"), "not-an-executable");
    await expect(assertProviderNeutralRuntimeTree(root)).rejects.toThrow(
      "Forbidden bundled Codex runtime artifact",
    );
  });
});
