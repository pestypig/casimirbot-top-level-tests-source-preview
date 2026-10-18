import { describe, expect, it, vi } from "vitest";
import { DesktopMcpTunnelRecoverySupervisor } from
  "../apps/desktop/src/mcp-tunnel-recovery-supervisor";
import type {
  DesktopMcpTunnelRecoveryState,
  DesktopMcpTunnelState,
} from "../shared/desktop-mcp-tunnel";

const recovery = (): DesktopMcpTunnelRecoveryState => ({
  phase: "idle",
  attemptCount: 0,
  maxAttempts: 3,
  nextAttemptAt: null,
  lastReason: null,
  automaticScope: "local_supervisor_coordination_and_device_check",
  manualInterventionRequired: false,
});

const tunnelState = (ready: boolean): DesktopMcpTunnelState => ({
  schemaVersion: "casimir_desktop_mcp_tunnel/4",
  transport: "openai_secure_mcp_tunnel",
  access: "developer_private",
  scope: "local_supervisor_coordination_and_device_check",
  status: ready ? "ready" : "degraded",
  configured: true,
  vaultAvailable: true,
  binaryVersion: "fixture",
  processRunning: ready,
  healthy: ready,
  ready,
  adminUiAvailable: ready,
  failureCode: ready ? null : "process_exit",
  recovery: recovery(),
});

const fixture = (input?: {
  startResults?: boolean[];
  account?: { sessionId: string; accountType: "developer" | "user" } | null;
  resolveAccount?: () => Promise<{ sessionId: string; accountType: "developer" | "user" }>;
}) => {
  let current = tunnelState(false);
  const scheduled: Array<() => void> = [];
  const projections: DesktopMcpTunnelRecoveryState[] = [];
  const startResults = [...(input?.startResults ?? [true])];
  const controller = {
    getState: () => current,
    setRecoveryState: vi.fn((next: DesktopMcpTunnelRecoveryState) => {
      projections.push(next);
      current = { ...current, recovery: next };
      return current;
    }),
    start: vi.fn(async (_accountSessionId: string, _scope: string) => {
      current = tunnelState(startResults.shift() ?? false);
      return current;
    }),
    stop: vi.fn(async () => {
      current = tunnelState(false);
      return current;
    }),
  };
  const supervisor = new DesktopMcpTunnelRecoverySupervisor({
    controller,
    retryDelaysMs: [10, 20, 30],
    now: () => Date.parse("2026-09-02T12:00:00.000Z"),
    schedule: (callback) => {
      scheduled.push(callback);
      return {} as NodeJS.Timeout;
    },
    cancelSchedule: () => undefined,
    resolveAccount: input?.resolveAccount ?? (async () => input?.account === null
      ? Promise.reject(new Error("signed_out"))
      : input?.account ?? {
          sessionId: "account_session:owner",
          accountType: "developer",
        }),
  });
  const runNext = async () => {
    const callback = scheduled.shift();
    if (!callback) throw new Error("scheduled recovery missing");
    callback();
    await vi.waitFor(() => {
      expect(controller.start.mock.calls.length +
        projections.filter((entry) => entry.phase === "exhausted").length)
        .toBeGreaterThan(0);
    });
  };
  return { supervisor, controller, projections, scheduled, runNext };
};

describe("desktop MCP tunnel recovery supervisor", () => {
  it("restores only read-only scope after exact developer-session revalidation", async () => {
    const value = fixture({ startResults: [true] });
    value.supervisor.trigger({
      accountSessionId: "account_session:owner",
      reason: "process_exit",
    });
    expect(value.projections.at(-1)).toMatchObject({
      phase: "scheduled",
      attemptCount: 0,
      nextAttemptAt: "2026-09-02T12:00:00.010Z",
    });
    await value.runNext();
    expect(value.controller.start).toHaveBeenCalledWith(
      "account_session:owner",
      "local_supervisor_coordination_and_device_check",
    );
    expect(value.projections.at(-1)).toMatchObject({
      phase: "idle",
      attemptCount: 0,
      manualInterventionRequired: false,
    });
  });

  it("uses a finite retry budget and requires manual intervention when exhausted", async () => {
    const value = fixture({ startResults: [false, false, false] });
    value.supervisor.trigger({
      accountSessionId: "account_session:owner",
      reason: "health_failed",
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const previousStarts = value.controller.start.mock.calls.length;
      const callback = value.scheduled.shift();
      expect(callback).toBeTypeOf("function");
      callback?.();
      await vi.waitFor(() => {
        expect(value.controller.start.mock.calls.length).toBe(previousStarts + 1);
      });
      await vi.waitFor(() => {
        const phase = value.projections.at(-1)?.phase;
        expect(["scheduled", "exhausted"]).toContain(phase);
      });
    }
    expect(value.controller.start).toHaveBeenCalledTimes(3);
    expect(value.projections.at(-1)).toMatchObject({
      phase: "exhausted",
      attemptCount: 3,
      lastReason: "start_failed",
      manualInterventionRequired: true,
    });
    expect(value.scheduled).toHaveLength(0);
  });

  it.each([
    { account: null, reason: "account_unavailable" },
    { account: { sessionId: "account_session:owner", accountType: "user" as const }, reason: "developer_required" },
    { account: { sessionId: "account_session:other", accountType: "developer" as const }, reason: "account_session_changed" },
  ])("fails closed without restarting for $reason", async ({ account, reason }) => {
    const value = fixture({ account });
    value.supervisor.trigger({
      accountSessionId: "account_session:owner",
      reason: "process_exit",
    });
    await value.runNext();
    expect(value.controller.start).not.toHaveBeenCalled();
    expect(value.projections.at(-1)).toMatchObject({
      phase: "exhausted",
      lastReason: reason,
      manualInterventionRequired: true,
    });
    expect(value.scheduled).toHaveLength(0);
    expect(value.controller.stop).not.toHaveBeenCalled();
  });

  it("cancels a pending retry on operator stop without creating another loop", () => {
    const value = fixture();
    value.supervisor.trigger({
      accountSessionId: "account_session:owner",
      reason: "process_exit",
    });
    value.supervisor.cancel("operator_stop");
    value.scheduled.shift()?.();
    expect(value.controller.start).not.toHaveBeenCalled();
    expect(value.projections.at(-1)).toMatchObject({
      phase: "idle",
      attemptCount: 0,
      lastReason: "operator_stop",
    });
  });

  it.each(["operator_stop", "credentials_cleared", "credentials_reconfigured", "scope_transition"] as const)(
    "does not restart from a late account result after %s",
    async (reason) => {
      let resolveAccount!: (value: { sessionId: string; accountType: "developer" }) => void;
      const pendingAccount = new Promise<{ sessionId: string; accountType: "developer" }>(resolve => {
        resolveAccount = resolve;
      });
      const readAccount = vi.fn(() => pendingAccount);
      const value = fixture({ resolveAccount: readAccount });
      value.supervisor.trigger({ accountSessionId: "account_session:owner", reason: "health_failed" });
      value.scheduled.shift()?.();
      expect(readAccount).toHaveBeenCalledOnce();
      expect(value.projections.at(-1)?.phase).toBe("revalidating");
      value.supervisor.cancel(reason);
      const projectionsAfterCancel = value.projections.length;
      resolveAccount({ sessionId: "account_session:owner", accountType: "developer" });
      await pendingAccount;
      await Promise.resolve();
      expect(value.controller.start).not.toHaveBeenCalled();
      expect(value.controller.stop).not.toHaveBeenCalled();
      expect(value.scheduled).toHaveLength(0);
      expect(value.projections).toHaveLength(projectionsAfterCancel);
      expect(value.projections.at(-1)).toMatchObject({ phase: "idle", lastReason: reason });
    },
  );
});
