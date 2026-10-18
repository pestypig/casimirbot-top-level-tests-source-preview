import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DESKTOP_LOCAL_DATABASE_RELATIVE_PATH,
  buildDesktopServiceEnvironment,
  resolveDesktopRoomAuthority,
  resolveDesktopUserDataOverride,
} from "../apps/desktop/src/service-environment";

const TEST_PROVIDER_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString("base64url");
const TEST_PROVIDER_CREDENTIAL_BROKER = Object.freeze({
  origin: "http://127.0.0.1:43122",
  token: TEST_PROVIDER_CREDENTIAL_KEY,
});
const TEST_MCP_TRANSITION_BROKER = Object.freeze({
  origin: "http://127.0.0.1:43123",
  token: Buffer.alloc(32, 8).toString("base64url"),
});
const TEST_DEVICE_ID = `desktop_device_${Buffer.alloc(16, 3).toString("base64url")}`;

describe("desktop service environment", () => {
  it.each([
    [undefined, undefined, undefined], ["1", undefined, undefined], [undefined, "1", undefined],
    ["1", "true", undefined], ["1", " 1 ", undefined], ["1", "1", "1"],
  ])("requires exact Home/runtime opt-ins (%s/%s) without exporting artifact paths", (home, runtime, expected) => {
    const environment = buildDesktopServiceEnvironment({
      processEnv: { HELIX_PRIVATE_ENVIRONMENT_HOME: home, HELIX_PRIVATE_CLOCK_RUNTIME: runtime,
        HELIX_PRIVATE_CLOCK_RUNTIME_ROOT: "C:\\native-only", HELIX_PRIVATE_CLOCK_RUNTIME_COMMAND: "never-export" },
      userDataPath: "C:\\Users\\person\\CasimirBot", serviceOrigin: "http://127.0.0.1:43121",
      providerCredentialBroker: TEST_PROVIDER_CREDENTIAL_BROKER, mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
      friendsPartiesCoordinationBroker: null, deviceId: TEST_DEVICE_ID,
    });
    expect(environment.HELIX_PRIVATE_CLOCK_RUNTIME).toBe(expected);
    expect(environment.HELIX_PRIVATE_CLOCK_RUNTIME_ROOT).toBeUndefined();
    expect(environment.HELIX_PRIVATE_CLOCK_RUNTIME_COMMAND).toBeUndefined();
  });
  it("inherits only the Windows process allowlist", () => {
    const environment = buildDesktopServiceEnvironment({
      processEnv: {
        SystemRoot: "C:\\Windows",
        PATH: "C:\\Windows\\System32",
        DATABASE_URL: "postgres://must-not-cross-the-boundary",
        OPENAI_API_KEY: "must-not-cross-the-boundary",
        HELIX_PROVIDER_CREDENTIAL_ENCRYPTION_KEY:
          Buffer.alloc(32, 9).toString("base64url"),
        NODE_OPTIONS: "--require=must-not-cross-the-boundary",
        HELIX_LOCAL_DB_PATH: "C:\\untrusted\\override.json",
        VOICE_LANE_CRASH_BREADCRUMB_DIR: "C:\\untrusted\\diagnostics",
        TRAINING_TRACE_AUDIT_PATH: "C:\\untrusted\\training-trace.jsonl",
      },
      userDataPath: "C:\\Users\\person\\AppData\\Roaming\\CasimirBot",
      serviceOrigin: "http://127.0.0.1:43121",
      providerCredentialBroker: TEST_PROVIDER_CREDENTIAL_BROKER,
      mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
      deviceId: TEST_DEVICE_ID,
    });

    expect(environment.SystemRoot).toBe("C:\\Windows");
    expect(environment.PATH).toBe("C:\\Windows\\System32");
    expect(environment.DATABASE_URL).toBeUndefined();
    expect(environment.OPENAI_API_KEY).toBeUndefined();
    expect(environment.HELIX_PROVIDER_CREDENTIAL_ENCRYPTION_KEY).toBeUndefined();
    expect(environment.NODE_OPTIONS).toBeUndefined();
    expect(environment.HELIX_LOCAL_DB_PATH).not.toBe(
      "C:\\untrusted\\override.json",
    );
    expect(environment.VOICE_LANE_CRASH_BREADCRUMB_DIR).toBe(path.join(
      "C:\\Users\\person\\AppData\\Roaming\\CasimirBot",
      "logs",
      "diagnostics",
    ));
    expect(environment.TRAINING_TRACE_AUDIT_PATH).toBe(path.join(
      "C:\\Users\\person\\AppData\\Roaming\\CasimirBot",
      "state",
      "training-trace.jsonl",
    ));
  });

  it("enables GPT Live through the native broker without exposing the OpenAI key", () => {
    const environment = buildDesktopServiceEnvironment({
      processEnv: {
        OPENAI_API_KEY: "must-remain-native-only",
      },
      userDataPath: "C:\\Users\\person\\AppData\\Roaming\\CasimirBot",
      serviceOrigin: "http://127.0.0.1:43121",
      providerCredentialBroker: {
        ...TEST_PROVIDER_CREDENTIAL_BROKER,
        openAiRealtimeAvailable: true,
      },
      mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
      deviceId: TEST_DEVICE_ID,
    });

    expect(environment.OPENAI_API_KEY).toBeUndefined();
    expect(environment).toMatchObject({
      HELIX_NATIVE_OPENAI_REALTIME_BROKER_ENABLED: "1",
      HELIX_REALTIME_SESSION_DESCRIPTOR_ENABLED: "1",
      HELIX_REALTIME_SESSION_ADAPTER_ENABLED: "1",
      HELIX_REALTIME_SESSION_LIVE_TRANSPORT_ENABLED: "1",
      HELIX_REALTIME_SESSION_OPENAI_CONTRACT_ENABLED: "1",
    });
  });

  it("inherits only the exact developer pilot policy and bounded C3 evidence root", () => {
    const environment = buildDesktopServiceEnvironment({
      processEnv: {
        HELIX_DEVELOPER_PROFILE_IDS:
          " profile:developer-one,developer@example.com ",
        HELIX_PRIVATE_COMPANION_C3_WORKSPACE_ROOT:
          " C:\\acceptance\\canonical-workspace ",
        HELIX_PRIVATE_ENVIRONMENT_HOME: "1",
        HELIX_LOCAL_PROFILE_PASSWORD_HASH: "must-not-flow",
        HELIX_LOCAL_PROFILE_PASSWORD: "must-not-flow",
      },
      userDataPath: "C:\\Users\\person\\AppData\\Roaming\\CasimirBot",
      serviceOrigin: "http://127.0.0.1:43121",
      providerCredentialBroker: TEST_PROVIDER_CREDENTIAL_BROKER,
      mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
      deviceId: TEST_DEVICE_ID,
    });

    expect(environment.HELIX_DEVELOPER_PROFILE_IDS).toBe(
      "profile:developer-one,developer@example.com",
    );
    expect(environment.HELIX_PRIVATE_COMPANION_C3_WORKSPACE_ROOT).toBe(
      "C:\\acceptance\\canonical-workspace",
    );
    expect(environment.HELIX_LOCAL_PROFILE_PASSWORD_HASH).toBeUndefined();
    expect(environment.HELIX_PRIVATE_ENVIRONMENT_HOME).toBe("1");
    expect(environment.HELIX_LOCAL_PROFILE_PASSWORD).toBeUndefined();
  });

  it("pins local state beneath Electron userData with bounded deferred telemetry persistence", () => {
    const userDataPath = path.resolve("C:\\Users\\person\\CasimirBot");
    const environment = buildDesktopServiceEnvironment({
      processEnv: {},
      userDataPath,
      serviceOrigin: "http://127.0.0.1:43121",
      providerCredentialBroker: TEST_PROVIDER_CREDENTIAL_BROKER,
      mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
      deviceId: TEST_DEVICE_ID,
    });
    const databasePath = environment.HELIX_LOCAL_DB_PATH!;
    const relative = path.relative(userDataPath, databasePath);

    expect(relative).toBe(DESKTOP_LOCAL_DATABASE_RELATIVE_PATH);
    expect(relative.startsWith("..")).toBe(false);
    expect(path.isAbsolute(relative)).toBe(false);
    expect(environment.HELIX_LOCAL_PG_MEM_PERSIST).toBe("1");
    // The committed desktop configuration coalesces telemetry; authority writes
    // separately require a strict durability barrier before acknowledgement.
    expect(environment.HELIX_LOCAL_PG_MEM_WRITE_MODE).toBe("deferred");
    expect(environment.HELIX_LOCAL_PG_MEM_IDLE_FLUSH_MS).toBe("2500");
    expect(environment.HELIX_LOCAL_PG_MEM_MAX_FLUSH_MS).toBe("15000");
    expect(environment.HELIX_DESKTOP_MINECRAFT_PROFILE_STORE).toBe(
      path.join(userDataPath, "state", "local-minecraft-run-profiles.json"),
    );
  });

  it("admits public OAuth verifier metadata without inheriting OAuth or admin secrets", () => {
    const environment = buildDesktopServiceEnvironment({
      processEnv: {
        SystemRoot: "C:\\Windows",
        HELIX_AGENT_OAUTH_ISSUER: "https://tenant.auth0.com/",
        HELIX_AGENT_OAUTH_AUDIENCE: "https://casimirbot.com/mcp",
        HELIX_AGENT_OAUTH_JWKS_URL:
          "https://tenant.auth0.com/.well-known/jwks.json",
        HELIX_AGENT_OAUTH_PROVIDER: "auth0",
        HELIX_AGENT_OAUTH_ALGORITHMS: "RS256",
        HELIX_AGENT_OAUTH_TENANT_CLAIM:
          "https://casimirbot.com/tenant_id",
        HELIX_AGENT_OAUTH_NATIVE_CLIENT_ID: "nativeClientId_123456",
        HELIX_AGENT_OAUTH_LINK_SCOPE: "openid profile",
        HELIX_SHARED_LIVE_ROOM_AUTHORITY_ORIGIN: "https://casimirbot.com",
        HELIX_SHARED_LIVE_ROOM_ACCESS_TOKEN: "must-not-flow",
        CASIMIR_PUBLIC_BASE_URL: "https://casimirbot.com",
        OPENAI_API_KEY: "must-not-flow",
        OPENAI_ADMIN_KEY: "must-not-flow",
        AUTH0_CLIENT_SECRET: "must-not-flow",
      },
      userDataPath: "C:\\Users\\test\\AppData\\Roaming\\CasimirBot",
      serviceOrigin: "http://127.0.0.1:43121",
      providerCredentialBroker: TEST_PROVIDER_CREDENTIAL_BROKER,
      mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
      deviceId: TEST_DEVICE_ID,
    });
    expect(environment).toMatchObject({
      HELIX_AGENT_OAUTH_ISSUER: "https://tenant.auth0.com/",
      HELIX_AGENT_OAUTH_AUDIENCE: "https://casimirbot.com/mcp",
      HELIX_AGENT_OAUTH_PROVIDER: "auth0",
      HELIX_AGENT_OAUTH_TENANT_CLAIM:
        "https://casimirbot.com/tenant_id",
      HELIX_AGENT_OAUTH_NATIVE_CLIENT_ID: "nativeClientId_123456",
      HELIX_AGENT_OAUTH_LINK_SCOPE: "openid profile",
      HELIX_SHARED_LIVE_ROOM_AUTHORITY_ORIGIN: "https://casimirbot.com",
      CASIMIR_PUBLIC_BASE_URL: "http://127.0.0.1:43121",
    });
    expect(environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(environment).not.toHaveProperty("OPENAI_ADMIN_KEY");
    expect(environment).not.toHaveProperty("AUTH0_CLIENT_SECRET");
    expect(environment).not.toHaveProperty("HELIX_SHARED_LIVE_ROOM_ACCESS_TOKEN");
  });

  it("uses one exact OAuth-audience room authority for service and navigation", () => {
    expect(resolveDesktopRoomAuthority(" https://casimirbot.com/ ",
      "https://casimirbot.com/mcp")).toBe("https://casimirbot.com");
    for (const origin of ["https://other.example", "http://casimirbot.com",
      "https://casimirbot.com/rooms", "https://casimirbot.com?next=1",
      "https://user@casimirbot.com"]) {
      expect(resolveDesktopRoomAuthority(origin, "https://casimirbot.com/mcp")).toBeNull();
    }
    expect(resolveDesktopRoomAuthority("https://casimirbot.com", undefined)).toBeNull();
    const environment = buildDesktopServiceEnvironment({
      processEnv: { HELIX_AGENT_OAUTH_AUDIENCE: "https://casimirbot.com/mcp",
        HELIX_SHARED_LIVE_ROOM_AUTHORITY_ORIGIN: "https://other.example" },
      userDataPath: "C:\\Users\\test\\AppData\\Roaming\\CasimirBot",
      serviceOrigin: "http://127.0.0.1:43121",
      providerCredentialBroker: TEST_PROVIDER_CREDENTIAL_BROKER,
      mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
      deviceId: TEST_DEVICE_ID,
    });
    expect(environment.HELIX_SHARED_LIVE_ROOM_AUTHORITY_ORIGIN).toBeUndefined();
  });

  it("pins OAuth discovery to the exact private desktop origin", () => {
    const environment = buildDesktopServiceEnvironment({
      processEnv: {
        CASIMIR_PUBLIC_BASE_URL: "https://stale-public-site.example",
      },
      userDataPath: "C:\\Users\\test\\AppData\\Roaming\\CasimirBot",
      serviceOrigin: "http://127.0.0.1:43121",
      providerCredentialBroker: TEST_PROVIDER_CREDENTIAL_BROKER,
      mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
      deviceId: TEST_DEVICE_ID,
    });

    expect(environment.CASIMIR_PUBLIC_BASE_URL).toBe(
      "http://127.0.0.1:43121",
    );
    expect(() =>
      buildDesktopServiceEnvironment({
        processEnv: {},
        userDataPath: "C:\\Users\\test\\AppData\\Roaming\\CasimirBot",
        serviceOrigin: "https://casimirbot.com",
        providerCredentialBroker: TEST_PROVIDER_CREDENTIAL_BROKER,
        mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
        deviceId: TEST_DEVICE_ID,
      }),
    ).toThrow(/exact HTTP 127\.0\.0\.1 origin/);
  });

  it("rejects an empty per-user data root", () => {
    expect(() =>
      buildDesktopServiceEnvironment({
        processEnv: {},
        userDataPath: "  ",
        serviceOrigin: "http://127.0.0.1:43121",
        providerCredentialBroker: TEST_PROVIDER_CREDENTIAL_BROKER,
        mcpTransitionBroker: TEST_MCP_TRANSITION_BROKER,
        deviceId: TEST_DEVICE_ID,
      }),
    ).toThrow(/userData path is required/);
  });

  it("accepts only absolute local-drive user-data overrides", () => {
    expect(resolveDesktopUserDataOverride("  ")).toBeNull();
    expect(
      resolveDesktopUserDataOverride("C:\\Temp\\casimir-profile\\..\\profile"),
    ).toBe("C:\\Temp\\profile");
    expect(() => resolveDesktopUserDataOverride("relative\\profile")).toThrow(
      /absolute local Windows drive path/,
    );
    expect(() =>
      resolveDesktopUserDataOverride("\\\\server\\share\\profile"),
    ).toThrow(/absolute local Windows drive path/);
  });
});
