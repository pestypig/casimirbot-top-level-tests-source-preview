import { describe, expect, it, vi } from "vitest";
import {
  autoStartConfiguredDesktopMcpTunnelReadOnly,
  DESKTOP_MCP_TRANSITION_RESPONSE_DRAIN_MS,
  executeDesktopMcpTunnelTransitionNow,
  restoreDesktopMcpTunnelReadOnly,
  startDesktopMcpTunnelForUserSession,
  type DesktopMcpTunnelTransitionControllerPort,
} from "../apps/desktop/src/mcp-tunnel-transition-executor";
import type {
  DesktopMcpTunnelScope,
  DesktopMcpTunnelState,
} from "../shared/desktop-mcp-tunnel";

const state = (
  scope: DesktopMcpTunnelScope,
  ready: boolean,
): DesktopMcpTunnelState => ({
  schemaVersion: "casimir_desktop_mcp_tunnel/4",
  transport: "openai_secure_mcp_tunnel",
  access: "developer_private",
  scope,
  status: ready ? "ready" : "stopped",
  configured: true,
  vaultAvailable: true,
  binaryVersion: "0.0.13",
  processRunning: ready,
  healthy: ready,
  ready,
  adminUiAvailable: ready,
  failureCode: null,
  recovery: {
    phase: "idle",
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: null,
    lastReason: null,
    automaticScope: "local_supervisor_coordination_and_device_check",
    manualInterventionRequired: false,
  },
});

const controller = (input?: {
  failFull?: boolean;
}): DesktopMcpTunnelTransitionControllerPort & {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} => {
  let current = state("local_supervisor_coordination_and_device_check", true);
  const stop = vi.fn(async () => {
    current = state("local_supervisor_coordination_and_device_check", false);
    return current;
  });
  const start = vi.fn(async (
    _accountSessionId: string,
    scope: DesktopMcpTunnelScope,
  ) => {
    current = input?.failFull && scope === "full_helix_agent"
      ? state("full_helix_agent", false)
      : state(scope, true);
    return current;
  });
  return { getState: () => current, stop, start };
};

describe("native desktop MCP tunnel transition executor", () => {
  it("freezes the MCP response-drain window before native process replacement", () => {
    expect(DESKTOP_MCP_TRANSITION_RESPONSE_DRAIN_MS).toBe(15_000);
  });

  it("stops read-only and starts the exact requested full scope", async () => {
    const port = controller();
    const result = await executeDesktopMcpTunnelTransitionNow({
      controller: port,
      accountSessionId: "account_session:fixture-owner",
      targetScope: "full_helix_agent",
    });
    expect(result).toEqual({
      requestedScope: "full_helix_agent",
      finalScope: "full_helix_agent",
      requestedScopeReady: true,
      readOnlyFallbackAttempted: false,
      readOnlyFallbackReady: false,
    });
    expect(port.stop).toHaveBeenCalledOnce();
    expect(port.start).toHaveBeenCalledWith(
      "account_session:fixture-owner",
      "full_helix_agent",
    );
  });

  it("switches a stable routed tunnel without replacing its process", async () => {
    let current = state("local_supervisor_coordination_and_device_check", true);
    const stop = vi.fn(async () => current);
    const start = vi.fn(async () => current);
    const switchScope = vi.fn(async (
      _accountSessionId: string,
      scope: DesktopMcpTunnelScope,
    ) => {
      current = state(scope, true);
      return current;
    });
    const port: DesktopMcpTunnelTransitionControllerPort = {
      getState: () => current,
      stop,
      start,
      switchScope,
    };
    const result = await executeDesktopMcpTunnelTransitionNow({
      controller: port,
      accountSessionId: "account_session:fixture-owner",
      targetScope: "full_helix_agent",
    });
    expect(result.requestedScopeReady).toBe(true);
    expect(switchScope).toHaveBeenCalledWith(
      "account_session:fixture-owner",
      "full_helix_agent",
    );
    expect(stop).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();

    expect(await restoreDesktopMcpTunnelReadOnly({
      controller: port,
      accountSessionId: "account_session:fixture-owner",
    })).toBe(true);
    expect(switchScope).toHaveBeenLastCalledWith(
      "account_session:fixture-owner",
      "local_supervisor_coordination_and_device_check",
    );
    expect(stop).not.toHaveBeenCalled();
  });

  it("treats native full-session start as permission to replace active read-only transport", async () => {
    const port = controller();
    const result = await startDesktopMcpTunnelForUserSession({
      controller: port,
      accountSessionId: "account_session:fixture-owner",
      accountType: "developer",
      requestedScope: "full_helix_agent",
    });
    expect(result).toMatchObject({
      scope: "full_helix_agent",
      processRunning: true,
      ready: true,
    });
    expect(port.stop).toHaveBeenCalledOnce();
    expect(port.start).toHaveBeenCalledWith(
      "account_session:fixture-owner",
      "full_helix_agent",
    );
  });

  it("rejects full-session start for a user account without stopping read-only transport", async () => {
    const port = controller();
    await expect(startDesktopMcpTunnelForUserSession({
      controller: port,
      accountSessionId: "account_session:fixture-user",
      accountType: "user",
      requestedScope: "full_helix_agent",
    })).rejects.toThrow("mcp_tunnel_full_developer_account_required");
    expect(port.stop).not.toHaveBeenCalled();
    expect(port.start).not.toHaveBeenCalled();
  });

  it("restores read-only transport when explicit full-session start throws", async () => {
    const port = controller();
    port.start.mockRejectedValueOnce(new Error("full start failed"));
    await expect(startDesktopMcpTunnelForUserSession({
      controller: port,
      accountSessionId: "account_session:fixture-owner",
      accountType: "developer",
      requestedScope: "full_helix_agent",
    })).rejects.toThrow("full start failed");
    expect(port.stop).toHaveBeenCalledTimes(2);
    expect(port.start).toHaveBeenLastCalledWith(
      "account_session:fixture-owner",
      "local_supervisor_coordination_and_device_check",
    );
  });

  it("restores read-only transport when explicit full-session start is degraded", async () => {
    const port = controller({ failFull: true });
    await expect(startDesktopMcpTunnelForUserSession({
      controller: port,
      accountSessionId: "account_session:fixture-owner",
      accountType: "developer",
      requestedScope: "full_helix_agent",
    })).rejects.toThrow("mcp_tunnel_requested_scope_not_ready");
    expect(port.stop).toHaveBeenCalledTimes(2);
    expect(port.start).toHaveBeenLastCalledWith(
      "account_session:fixture-owner",
      "local_supervisor_coordination_and_device_check",
    );
  });

  it("fails closed to a ready read-only tunnel when full startup is degraded", async () => {
    const port = controller({ failFull: true });
    const result = await executeDesktopMcpTunnelTransitionNow({
      controller: port,
      accountSessionId: "account_session:fixture-owner",
      targetScope: "full_helix_agent",
    });
    expect(result).toEqual({
      requestedScope: "full_helix_agent",
      finalScope: "local_supervisor_coordination_and_device_check",
      requestedScopeReady: false,
      readOnlyFallbackAttempted: true,
      readOnlyFallbackReady: true,
      failureReason: "transport_not_ready",
    });
    expect(port.stop).toHaveBeenCalledTimes(2);
    expect(port.start).toHaveBeenLastCalledWith(
      "account_session:fixture-owner",
      "local_supervisor_coordination_and_device_check",
    );
  });

  it("reports an account-session rejection without weakening it or exposing raw errors", async () => {
    const port = { ...controller(), switchScope: vi.fn(async () => {
      throw new Error("Tunnel account session changed before scope transition");
    }) };
    const result = await executeDesktopMcpTunnelTransitionNow({
      controller: port,
      accountSessionId: "private-session-value",
      targetScope: "full_helix_agent",
    });
    expect(result.failureReason).toBe("account_session_changed");
    expect(result.requestedScopeReady).toBe(false);
    expect(result.readOnlyFallbackReady).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-session-value");
    expect(port.stop).not.toHaveBeenCalled();
  });

  it("uses the same exact stop/start downgrade path for lease expiry", async () => {
    const port = controller();
    await port.start("account_session:fixture-owner", "full_helix_agent");
    expect(await restoreDesktopMcpTunnelReadOnly({
      controller: port,
      accountSessionId: "account_session:fixture-owner",
    })).toBe(true);
    expect(port.start).toHaveBeenLastCalledWith(
      "account_session:fixture-owner",
      "local_supervisor_coordination_and_device_check",
    );
  });

  it("auto-starts only configured read-only transport after developer revalidation", async () => {
    const port = controller();
    await port.stop();
    const result = await autoStartConfiguredDesktopMcpTunnelReadOnly({
      controller: port,
      resolveAccount: async () => ({
        sessionId: "account_session:fixture-owner",
        accountType: "developer",
      }),
    });
    expect(result).toEqual({ attempted: true, ready: true, reason: "ready" });
    expect(port.start).toHaveBeenCalledWith(
      "account_session:fixture-owner",
      "local_supervisor_coordination_and_device_check",
    );
  });

  it("does not downgrade an owner-started full tunnel while startup resolves the account", async () => {
    const port = controller();
    await port.stop();
    let finishAccount!: (account: { sessionId: string; accountType: "developer" }) => void;
    const account = new Promise<{ sessionId: string; accountType: "developer" }>(
      (resolve) => { finishAccount = resolve; },
    );
    const startup = autoStartConfiguredDesktopMcpTunnelReadOnly({
      controller: port,
      resolveAccount: () => account,
    });
    await port.start("account_session:fixture-owner", "full_helix_agent");
    finishAccount({ sessionId: "account_session:fixture-owner", accountType: "developer" });
    expect(await startup).toEqual({ attempted: false, ready: false, reason: "already_running" });
    expect(port.start).toHaveBeenCalledOnce();
    expect(port.getState().scope).toBe("full_helix_agent");
  });

  it("does not auto-start a configured developer-private tunnel for a user account", async () => {
    const port = controller();
    await port.stop();
    const result = await autoStartConfiguredDesktopMcpTunnelReadOnly({
      controller: port,
      resolveAccount: async () => ({
        sessionId: "account_session:fixture-user",
        accountType: "user",
      }),
    });
    expect(result).toEqual({
      attempted: false,
      ready: false,
      reason: "developer_required",
    });
    expect(port.start).not.toHaveBeenCalled();
  });

  it("recovers after unavailable account resolution without starting duplicate or full-scope transport", async () => {
    const port = controller();
    await port.stop();
    port.stop.mockClear();
    const unavailable = await autoStartConfiguredDesktopMcpTunnelReadOnly({
      controller: port,
      resolveAccount: async () => { throw new Error("fixture-private-account-error"); },
    });
    expect(unavailable).toEqual({ attempted: false, ready: false, reason: "account_unavailable" });
    expect(port.start).not.toHaveBeenCalled();
    expect(port.stop).not.toHaveBeenCalled();
    expect(port.getState().configured).toBe(true);
    const resolveAccount = vi.fn(async () => ({
      sessionId: "account_session:recovered-fixture",
      accountType: "developer" as const,
    }));
    expect(await autoStartConfiguredDesktopMcpTunnelReadOnly({ controller: port, resolveAccount }))
      .toEqual({ attempted: true, ready: true, reason: "ready" });
    expect(await autoStartConfiguredDesktopMcpTunnelReadOnly({ controller: port, resolveAccount }))
      .toEqual({ attempted: false, ready: true, reason: "already_running" });
    expect(resolveAccount).toHaveBeenCalledOnce();
    expect(port.start).toHaveBeenCalledOnce();
    expect(port.start).toHaveBeenCalledWith(
      "account_session:recovered-fixture", "local_supervisor_coordination_and_device_check",
    );
    expect(port.stop).not.toHaveBeenCalled();
  });
});
