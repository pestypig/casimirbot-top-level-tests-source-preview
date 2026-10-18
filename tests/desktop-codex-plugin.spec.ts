import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCodexPluginDeepLink,
  CODEX_MARKETPLACE_FILE,
  inspectCodexPluginIntegration,
  reinspectCodexPluginIntegration,
} from "../apps/desktop/src/codex-plugin";
import {
  DESKTOP_CODEX_PLUGIN_STATE_SCHEMA_VERSION,
  parseDesktopCodexPluginState,
} from "../shared/codex-plugin";

const repoRoot = path.resolve(".");
const disposableRoots: string[] = [];

const createMarketplaceFixture = async (
  installation: "AVAILABLE" | "NOT_AVAILABLE" | "INSTALLED_BY_DEFAULT",
): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casimir-codex-plugin-"));
  disposableRoots.push(root);
  await mkdir(path.join(root, ".agents", "plugins"), { recursive: true });
  await mkdir(path.join(root, "plugins"), { recursive: true });
  await cp(
    path.join(repoRoot, "plugins", "casimirbot-device-check"),
    path.join(root, "plugins", "casimirbot-device-check"),
    { recursive: true },
  );
  const marketplace = JSON.parse(
    await readFile(path.join(repoRoot, CODEX_MARKETPLACE_FILE), "utf8"),
  );
  marketplace.plugins[0].policy.installation = installation;
  await writeFile(
    path.join(root, CODEX_MARKETPLACE_FILE),
    `${JSON.stringify(marketplace, null, 2)}\n`,
    "utf8",
  );
  return root;
};

describe("desktop Codex plugin boundary", () => {
  afterEach(async () => {
    await Promise.all(
      disposableRoots.splice(0).map((root) =>
        rm(root, { recursive: true, force: true }),
      ),
    );
  });

  it("validates the exact repository marketplace and keeps install locked", async () => {
    const integration = await inspectCodexPluginIntegration({
      marketplaceRoot: repoRoot,
    });

    expect(integration.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(integration.state).toEqual({
      schemaVersion: DESKTOP_CODEX_PLUGIN_STATE_SCHEMA_VERSION,
      pluginName: "casimirbot-device-check",
      marketplaceName: "casimirbot-local",
      status: "blocked",
      authentication: "on_install",
      connection: "oauth_protected_https_mcp",
      blockedReason: "production_oauth_unverified",
    });
    expect(parseDesktopCodexPluginState(integration.state)).toEqual(
      integration.state,
    );
  });

  it("rejects a marketplace that does not match its signed runtime receipt", async () => {
    const integration = await inspectCodexPluginIntegration({
      marketplaceRoot: repoRoot,
      expectedTreeSha256: "0".repeat(64),
      requireIntegrityReceipt: true,
    });
    expect(integration.state.status).toBe("blocked");
    expect(integration.state.blockedReason).toBe("bundle_invalid");
  });

  it("admits only the explicit available policy as a user-consented ready state", async () => {
    const marketplaceRoot = await createMarketplaceFixture("AVAILABLE");
    const integration = await inspectCodexPluginIntegration({ marketplaceRoot });
    expect(integration.state).toMatchObject({
      status: "ready",
      authentication: "on_install",
      blockedReason: null,
    });
  });

  it("rejects installed-by-default because installation must remain explicit", async () => {
    const marketplaceRoot = await createMarketplaceFixture(
      "INSTALLED_BY_DEFAULT",
    );
    const integration = await inspectCodexPluginIntegration({ marketplaceRoot });
    expect(integration.state).toMatchObject({
      status: "blocked",
      blockedReason: "bundle_invalid",
    });
  });

  it("re-hashes the marketplace at click time and rejects post-startup changes", async () => {
    const marketplaceRoot = await createMarketplaceFixture("AVAILABLE");
    const startup = await inspectCodexPluginIntegration({ marketplaceRoot });
    expect(startup.state.status).toBe("ready");

    const marketplacePath = path.join(marketplaceRoot, CODEX_MARKETPLACE_FILE);
    const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
    marketplace.plugins[0].policy.installation = "NOT_AVAILABLE";
    await writeFile(
      marketplacePath,
      `${JSON.stringify(marketplace, null, 2)}\n`,
      "utf8",
    );

    const clickTime = await reinspectCodexPluginIntegration(startup);
    expect(clickTime.state).toMatchObject({
      status: "blocked",
      blockedReason: "bundle_invalid",
    });
  });

  it("distinguishes malformed JSON from a missing bundle", async () => {
    const malformedRoot = await createMarketplaceFixture("NOT_AVAILABLE");
    await writeFile(
      path.join(malformedRoot, CODEX_MARKETPLACE_FILE),
      "{ malformed",
      "utf8",
    );
    const malformed = await inspectCodexPluginIntegration({
      marketplaceRoot: malformedRoot,
    });
    const missing = await inspectCodexPluginIntegration({
      marketplaceRoot: path.join(malformedRoot, "missing"),
    });
    expect(malformed.state.blockedReason).toBe("bundle_invalid");
    expect(malformed.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(missing.state.blockedReason).toBe("bundle_missing");
    expect(missing.treeSha256).toBeNull();
  });

  it("rejects undeclared plugin files that could add hooks or executable behavior", async () => {
    const marketplaceRoot = await createMarketplaceFixture("AVAILABLE");
    const hooksRoot = path.join(
      marketplaceRoot,
      "plugins",
      "casimirbot-device-check",
      "hooks",
    );
    await mkdir(hooksRoot, { recursive: true });
    await writeFile(
      path.join(hooksRoot, "hooks.json"),
      JSON.stringify({ hooks: {} }),
      "utf8",
    );
    const integration = await inspectCodexPluginIntegration({ marketplaceRoot });
    expect(integration.state).toMatchObject({
      status: "blocked",
      blockedReason: "bundle_invalid",
    });
  });

  it("rejects the broad Helix MCP catalog for the read-only plugin", async () => {
    const marketplaceRoot = await createMarketplaceFixture("AVAILABLE");
    const mcpPath = path.join(
      marketplaceRoot,
      "plugins",
      "casimirbot-device-check",
      ".mcp.json",
    );
    const mcp = JSON.parse(await readFile(mcpPath, "utf8"));
    mcp.mcpServers["casimirbot-device-check"].url =
      "https://casimirbot.com/mcp";
    await writeFile(mcpPath, `${JSON.stringify(mcp, null, 2)}\n`, "utf8");

    const integration = await inspectCodexPluginIntegration({ marketplaceRoot });
    expect(integration.state).toMatchObject({
      status: "blocked",
      blockedReason: "bundle_invalid",
    });
  });

  it("builds a fixed Codex plugin deep link without configuration mutation", () => {
    const marketplaceFile = path.join(repoRoot, CODEX_MARKETPLACE_FILE);
    const deepLink = new URL(buildCodexPluginDeepLink(marketplaceFile));
    expect(deepLink.protocol).toBe("codex:");
    expect(deepLink.hostname).toBe("plugins");
    expect(deepLink.pathname).toBe("/casimirbot-device-check");
    expect(deepLink.searchParams.get("marketplacePath")).toBe(
      marketplaceFile,
    );
    expect(deepLink.searchParams.has("pluginName")).toBe(false);
    expect(deepLink.searchParams.has("hostId")).toBe(false);
  });
});
