import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMcpTunnelEnvironment,
  DesktopMcpTunnelController,
  hasRepeatedControlPlaneTokenInvalidation,
  parseMcpTunnelCredentials,
  projectMcpTunnelProbeState,
  type SecureStoragePort,
} from "../apps/desktop/src/mcp-tunnel";
import {
  parseDesktopMcpTunnelStartRequest,
  parseDesktopMcpTunnelState,
} from "../shared/desktop-mcp-tunnel";

const roots: string[] = [];
const validCredentials = {
  tunnelId: "tunnel_0123456789abcdef0123456789abcdef",
  runtimeApiKey: "sk-runtime_test_0123456789abcdef",
};

const fakeStorage: SecureStoragePort = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf16le"),
  decryptString: (value) => {
    const decoded = value.toString("utf16le");
    if (!decoded.startsWith("encrypted:")) throw new Error("invalid ciphertext");
    return decoded.slice("encrypted:".length);
  },
};

const makeController = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casimir-mcp-tunnel-"));
  roots.push(root);
  const binaryPath = path.join(root, "tunnel-client.exe");
  const bytes = Buffer.from("verified tunnel binary fixture");
  await writeFile(binaryPath, bytes);
  return {
    root,
    controller: new DesktopMcpTunnelController({
      binaryPath,
      expectedBinarySha256: createHash("sha256").update(bytes).digest("hex"),
      binaryVersion: "test",
      userDataPath: root,
      runtimeOrigin: "http://127.0.0.1:43123",
      desktopSessionSecret: "desktop-secret-that-never-leaves-the-child-environment",
      storage: fakeStorage,
    }),
  };
};

describe("desktop Secure MCP Tunnel boundary", () => {
  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("degrades aggregate readiness after repeated invalidated control-plane polls while retaining local health", async () => {
    const { root } = await makeController();
    const logPath = path.join(root, "current-run.log");
    const invalidated = JSON.stringify({
      component: "controlplane", status_code: 401, error_code: "token_invalidated",
    });
    const recovered = JSON.stringify({ component: "controlplane", status_code: 200 });
    expect(hasRepeatedControlPlaneTokenInvalidation(logPath)).toBe(false);
    await writeFile(logPath, `${JSON.stringify({ component: "local", status_code: 401, error_code: "token_invalidated" })}\n`);
    expect(hasRepeatedControlPlaneTokenInvalidation(logPath)).toBe(false);
    await writeFile(logPath, `${invalidated}\n${invalidated}\n`);
    expect(hasRepeatedControlPlaneTokenInvalidation(logPath)).toBe(false);
    await writeFile(logPath, `${invalidated}\n${invalidated}\n${invalidated}\n`);
    expect(hasRepeatedControlPlaneTokenInvalidation(logPath)).toBe(true);
    expect(projectMcpTunnelProbeState({
      healthy: true, localReady: true, controlPlaneAuthInvalidated: true,
    })).toEqual({
      status: "degraded", healthy: true, ready: false,
      failureCode: "control_plane_auth_invalidated",
    });
    await writeFile(logPath, `${invalidated}\n${invalidated}\n${invalidated}\n${recovered}\n`);
    expect(hasRepeatedControlPlaneTokenInvalidation(logPath)).toBe(false);
    expect(projectMcpTunnelProbeState({
      healthy: true, localReady: true, controlPlaneAuthInvalidated: false,
    })).toEqual({ status: "ready", healthy: true, ready: true, failureCode: null });
    expect(projectMcpTunnelProbeState({
      healthy: false, localReady: true, controlPlaneAuthInvalidated: true,
    })).toEqual({ status: "degraded", healthy: false, ready: false, failureCode: "health_failed" });
  });

  it("admits only the exact tunnel ID and restricted runtime-key shape", () => {
    expect(parseMcpTunnelCredentials(validCredentials)).toEqual(validCredentials);
    expect(() =>
      parseMcpTunnelCredentials({ ...validCredentials, tunnelId: "organization-secret" }),
    ).toThrow();
    expect(() =>
      parseMcpTunnelCredentials({ ...validCredentials, runtimeApiKey: "admin key" }),
    ).toThrow();
    expect(() =>
      parseMcpTunnelCredentials({ ...validCredentials, extra: "not admitted" }),
    ).toThrow();
  });

  it("builds a narrow child environment without ambient OpenAI, database, proxy, or Node secrets", () => {
    const environment = buildMcpTunnelEnvironment({
      processEnv: {
        SystemRoot: "C:\\Windows",
        TEMP: "C:\\Temp",
        PATH: "untrusted-path",
        OPENAI_API_KEY: "ambient-openai-secret",
        OPENAI_ADMIN_KEY: "ambient-admin-secret",
        DATABASE_URL: "database-secret",
        NODE_OPTIONS: "--inspect",
        HTTPS_PROXY: "http://user:password@proxy.invalid",
        HELIX_AGENT_OAUTH_ISSUER: "https://tenant.example.auth0.com/",
      },
      credentials: validCredentials,
      runtimeOrigin: "http://127.0.0.1:43123",
      desktopSessionSecret: "desktop-session-secret",
      accountSessionId: "account_session:fixture-owner",
      healthUrlFile: "C:\\state\\health.url",
    });

    expect(environment).toMatchObject({
      SystemRoot: "C:\\Windows",
      CONTROL_PLANE_TUNNEL_ID: validCredentials.tunnelId,
      CONTROL_PLANE_API_KEY: validCredentials.runtimeApiKey,
      MCP_SERVER_URL:
        "http://127.0.0.1:43123/mcp/local-supervisor-coordination",
      MCP_EXTRA_HEADERS:
        "X-Casimir-Desktop-Session: env:CASIMIR_TUNNEL_DESKTOP_SESSION_SECRET, x-casimir-desktop-account-session: env:CASIMIR_TUNNEL_ACCOUNT_SESSION_ID",
      MCP_DISCOVERY_EXTRA_HEADERS:
        "X-Casimir-Desktop-Session: env:CASIMIR_TUNNEL_DESKTOP_SESSION_SECRET, x-casimir-desktop-account-session: env:CASIMIR_TUNNEL_ACCOUNT_SESSION_ID",
      CASIMIR_TUNNEL_ACCOUNT_SESSION_ID: "account_session:fixture-owner",
      HEALTH_LISTEN_ADDR: "127.0.0.1:0",
      LOG_FILE: "C:\\state\\health.url.log",
      ALLOW_REMOTE_UI: "false",
      HARPOON_TARGETS:
        "label=oauth-auth-server-metadata-0,url=https://tenant.example.auth0.com/.well-known/oauth-authorization-server,desc=OAuth authorization server metadata;label=oauth-registration-endpoint-0,url=https://tenant.example.auth0.com/oidc/register,desc=OAuth dynamic client registration",
      HARPOON_ALLOW_PLAINTEXT_HTTP: "true",
      HARPOON_HOSTS_INCLUDE_LOOPBACK: "true",
    });
    expect(environment).not.toHaveProperty("HARPOON_HOSTS_INCLUDE_PRIVATE");
    for (const excluded of [
      "PATH",
      "OPENAI_API_KEY",
      "OPENAI_ADMIN_KEY",
      "DATABASE_URL",
      "NODE_OPTIONS",
      "HTTPS_PROXY",
    ]) {
      expect(environment).not.toHaveProperty(excluded);
    }
    expect(environment).not.toHaveProperty("HELIX_AGENT_OAUTH_ISSUER");
  });

  it("selects full Helix MCP only for the exact explicit start scope", () => {
    expect(parseDesktopMcpTunnelStartRequest(undefined)).toEqual({
      scope: "local_supervisor_coordination_and_device_check",
    });
    expect(
      parseDesktopMcpTunnelStartRequest({ scope: "full_helix_agent" }),
    ).toEqual({ scope: "full_helix_agent" });
    expect(parseDesktopMcpTunnelStartRequest({ scope: "full_helix_agent", extra: true }))
      .toBeNull();
    expect(parseDesktopMcpTunnelStartRequest({ scope: "arbitrary" })).toBeNull();

    const environment = buildMcpTunnelEnvironment({
      processEnv: {},
      credentials: validCredentials,
      runtimeOrigin: "http://127.0.0.1:43123",
      desktopSessionSecret: "desktop-session-secret",
      accountSessionId: "account_session:fixture-owner",
      healthUrlFile: "C:\\state\\health.url",
      scope: "full_helix_agent",
    });
    expect(environment.MCP_SERVER_URL).toBe("http://127.0.0.1:43123/mcp");
    expect(environment.MCP_EXTRA_HEADERS).toBe(
      "X-Casimir-Desktop-Session: env:CASIMIR_TUNNEL_DESKTOP_SESSION_SECRET, x-casimir-desktop-account-session: env:CASIMIR_TUNNEL_ACCOUNT_SESSION_ID",
    );

    const stableEnvironment = buildMcpTunnelEnvironment({
      processEnv: {},
      credentials: validCredentials,
      runtimeOrigin: "http://127.0.0.1:43124",
      desktopSessionSecret: "desktop-session-secret",
      accountSessionId: "account_session:fixture-owner",
      healthUrlFile: "C:\\state\\stable-health.url",
      scope: "local_supervisor_coordination_and_device_check",
      stableMcpRoute: true,
    });
    expect(stableEnvironment.MCP_SERVER_URL).toBe(
      "http://127.0.0.1:43124/mcp",
    );
  });

  it("admits only exact HTTPS OAuth metadata and registration targets", () => {
    const build = (issuer: string) =>
      buildMcpTunnelEnvironment({
        processEnv: { HELIX_AGENT_OAUTH_ISSUER: issuer },
        credentials: validCredentials,
        runtimeOrigin: "http://127.0.0.1:43123",
        desktopSessionSecret: "desktop-session-secret",
        accountSessionId: "account_session:fixture-owner",
        healthUrlFile: "C:\\state\\health.url",
      });

    expect(build("https://login.customer.example/oauth/").HARPOON_TARGETS)
      .toBe(
        "label=oauth-auth-server-metadata-0,url=https://login.customer.example/.well-known/oauth-authorization-server/oauth,desc=OAuth authorization server metadata;label=oauth-registration-endpoint-0,url=https://login.customer.example/oidc/register,desc=OAuth dynamic client registration",
      );
    expect(build("https://login.customer.example/oauth/")).toMatchObject({
      HARPOON_ALLOW_PLAINTEXT_HTTP: "true",
      HARPOON_HOSTS_INCLUDE_LOOPBACK: "true",
    });
    for (const invalid of [
      "http://login.customer.example/",
      "https://localhost/",
      "https://127.0.0.1/",
      "https://com/",
      "https://user:password@login.customer.example/",
      "https://login.customer.example/?redirect=elsewhere",
      "not-a-url",
    ]) {
      const environment = build(invalid);
      expect(environment).not.toHaveProperty("HARPOON_TARGETS");
      expect(environment).not.toHaveProperty("HARPOON_ALLOW_PLAINTEXT_HTTP");
      expect(environment).not.toHaveProperty("HARPOON_HOSTS_INCLUDE_LOOPBACK");
    }
  });

  it("stores credentials only through the OS-bound vault and never projects them into state", async () => {
    const { root, controller } = await makeController();
    expect(controller.getState()).toMatchObject({
      status: "unconfigured",
      configured: false,
      vaultAvailable: true,
      binaryVersion: "test",
    });
    const state = controller.configure(validCredentials);
    expect(parseDesktopMcpTunnelState(state)).toEqual(state);
    expect(parseDesktopMcpTunnelState({
      ...state,
      recovery: { ...state.recovery, attemptCount: 4, maxAttempts: 3 },
    })).toBeNull();
    expect(parseDesktopMcpTunnelState({
      ...state,
      schemaVersion: "casimir_desktop_mcp_tunnel/3",
    })).toBeNull();
    expect(state).toMatchObject({ status: "stopped", configured: true });
    expect(state.scope).toBe(
      "local_supervisor_coordination_and_device_check",
    );
    expect(JSON.stringify(state)).not.toContain(validCredentials.tunnelId);
    expect(JSON.stringify(state)).not.toContain(validCredentials.runtimeApiKey);

    const vault = await readFile(
      path.join(root, "mcp-tunnel", "credentials.dpapi"),
    );
    expect(vault.toString("utf8")).not.toContain(validCredentials.runtimeApiKey);

    const cleared = await controller.clear();
    expect(cleared).toMatchObject({ status: "unconfigured", configured: false });
  });

  it("fails closed when the bundled executable hash is wrong", async () => {
    const { root } = await makeController();
    const binaryPath = path.join(root, "tampered.exe");
    await writeFile(binaryPath, "tampered");
    const controller = new DesktopMcpTunnelController({
      binaryPath,
      expectedBinarySha256: "0".repeat(64),
      binaryVersion: "test",
      userDataPath: root,
      runtimeOrigin: "http://127.0.0.1:43123",
      desktopSessionSecret: "desktop-session-secret-long-enough",
      storage: fakeStorage,
    });
    expect(controller.getState()).toMatchObject({
      status: "blocked",
      failureCode: "binary_invalid",
      binaryVersion: null,
    });
  });
});
