import { describe, expect, it } from "vitest";
import {
  DesktopMcpTunnelTransitionBrokerAdmission,
  parseDesktopMcpTunnelTransitionBrokerRequest,
  startDesktopMcpTunnelTransitionBroker,
} from
  "../apps/desktop/src/mcp-tunnel-transition-broker";
import { vi } from "vitest";
import { parsePrivateClockBrokerRequest, validatePrivateClockBrokerReceipt,
  type PrivateClockBrokerRequest, type PrivateClockBrokerHandler } from "../apps/desktop/src/environment-private-clock-broker";
import { HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA, HELIX_SYSTEM_CLOCK_READ_CAPABILITY } from "../shared/helix-environment-connector";
import type { ClockObservationReceipt } from "../apps/desktop/src/environment-clock-observation-journal";
import { createPrivateClockBrokerClient } from "../server/services/local-supervisor/private-clock-broker-client";

const now = Date.parse("2026-08-29T12:00:00.000Z");
const valid = {
  schema: "casimir_desktop_mcp_tunnel_transition_request/1",
  transitionRequestRef: "desktop_tunnel_request:fixture-1234",
  delegationRef: "desktop_tunnel_delegation:fixture-1234",
  accountSessionId: "account_session:fixture-owner",
  targetScope: "full_helix_agent",
  delegationExpiresAt: "2026-08-29T12:02:00.000Z",
};

describe("native desktop MCP transition broker parser", () => {
  it("admits only the exact bounded transition envelope", () => {
    expect(parseDesktopMcpTunnelTransitionBrokerRequest(valid, now)).toEqual(valid);
    for (const invalid of [
      { ...valid, extra: true },
      { ...valid, schema: "arbitrary" },
      { ...valid, targetScope: "trading" },
      { ...valid, accountSessionId: "oauth-token" },
      { ...valid, delegationExpiresAt: "2026-08-29T11:59:59.000Z" },
      { ...valid, delegationExpiresAt: "2026-08-29T12:05:01.000Z" },
      { ...valid, transitionRequestRef: "https://private.invalid/secret" },
    ]) expect(parseDesktopMcpTunnelTransitionBrokerRequest(invalid, now)).toBeNull();
  });

  it("admits an explicit return-to-read-only under the same lease envelope", () => {
    expect(parseDesktopMcpTunnelTransitionBrokerRequest({
      ...valid,
      targetScope: "local_supervisor_coordination_and_device_check",
      delegationExpiresAt: "2026-08-29T11:59:59.000Z",
    }, now)?.targetScope).toBe("local_supervisor_coordination_and_device_check");
  });

  it("coalesces concurrent identical requests and rejects request-ref conflicts", async () => {
    const admission = new DesktopMcpTunnelTransitionBrokerAdmission();
    const request = parseDesktopMcpTunnelTransitionBrokerRequest(valid, now)!;
    const execute = vi.fn(async () => ({
      nativeReceiptRef: "native_transition_receipt:fixture-1234",
      reconnectRequired: false,
      catalogRefreshRequired: false,
      stableScopeRouting: true,
    }));
    const [first, replay] = await Promise.all([
      admission.admit({ request, execute }),
      admission.admit({ request, execute }),
    ]);
    expect(first.idempotencyReplayed).toBe(false);
    expect(replay).toEqual({
      nativeReceiptRef: first.nativeReceiptRef,
      reconnectRequired: false,
      catalogRefreshRequired: false,
      stableScopeRouting: true,
      idempotencyReplayed: true,
    });
    expect(execute).toHaveBeenCalledOnce();
    const conflict = parseDesktopMcpTunnelTransitionBrokerRequest({
      ...valid,
      targetScope: "local_supervisor_coordination_and_device_check",
    }, now)!;
    await expect(admission.admit({ request: conflict, execute }))
      .rejects.toThrow("native_transition_replay_conflict");
    expect(execute).toHaveBeenCalledOnce();
  });
});

const clockRequest = (): PrivateClockBrokerRequest => ({ schema: "casimir_private_clock_observe_request/1",
  accountSessionId: "account_session:fixture-owner", clientRef: "mcp_client:fixture-owner", requestId: "probe:broker-fixture",
  installationRef: "environment_installation:11111111-1111-4111-8111-111111111111", expiresAt: new Date(Date.now() + 15000).toISOString() });
const clockReceipt = (request: PrivateClockBrokerRequest): ClockObservationReceipt => ({
  executionRef: "environment_execution:22222222-2222-4222-8222-222222222222", epoch: 1, installationRef: request.installationRef,
  result: { schema: HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA, probe_request_id: request.requestId,
    capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, capability_version: 1, outcome: "succeeded", summary: "Fixture clock observation",
    result: { uptime_ms: 42 }, side_effects_performed: false, commands_executed: [], environment_mutation_performed: false,
    deterministic: true, model_invoked: false, assistant_answer: false, raw_content_included: false, created_at: new Date().toISOString() },
});
const clockBroker = (onPrivateClockObserve?: PrivateClockBrokerHandler) => startDesktopMcpTunnelTransitionBroker({
  onTransition: async () => { throw Error("unused"); }, onPresent: async () => { throw Error("unused"); }, onPrivateClockObserve,
});
const callClock = (broker: Awaited<ReturnType<typeof clockBroker>>, body: unknown, token = broker.token, signal?: AbortSignal) =>
  fetch(`${broker.origin}/v1/private-clock/observe`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal });

describe("private clock internal broker boundary", () => {
  it("uses the service client against the authenticated native HTTP broker", async () => {
    const handler = vi.fn(async request => clockReceipt(request)), broker = await clockBroker(handler);
    const env = { HELIX_DESKTOP_MCP_TRANSITION_BROKER_ORIGIN: broker.origin, HELIX_DESKTOP_MCP_TRANSITION_BROKER_TOKEN: broker.token };
    try {
      const client = createPrivateClockBrokerClient(env)!;
      expect(await client(clockRequest())).toMatchObject({ result: { result: { uptime_ms: 42 } } });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(createPrivateClockBrokerClient({})).toBeUndefined();
      expect(createPrivateClockBrokerClient({ ...env, HELIX_DESKTOP_MCP_TRANSITION_BROKER_ORIGIN: "https://example.com" })).toBeUndefined();
      expect(createPrivateClockBrokerClient({ ...env, HELIX_DESKTOP_MCP_TRANSITION_BROKER_TOKEN: "wrong" })).toBeUndefined();
    } finally { await broker.close(); }
  });
  it("accepts only the fixed short-lived envelope without program arguments or paths", () => {
    const value = clockRequest(); expect(parsePrivateClockBrokerRequest(value)).toEqual(value);
    for (const invalid of [null, [], { ...value, arguments: {} }, { ...value, executable: "node" }, { ...value, accountSessionId: "other" },
      { ...value, clientRef: "https://example.com" }, { ...value, installationRef: "arbitrary" },
      { ...value, expiresAt: new Date(Date.now() - 1).toISOString() }, { ...value, expiresAt: new Date(Date.now() + 21000).toISOString() }])
      expect(parsePrivateClockBrokerRequest(invalid)).toBeNull();
  });
  it("requires the existing broker authentication before reaching a native handler", async () => {
    const handler = vi.fn(async request => clockReceipt(request)), broker = await clockBroker(handler);
    try {
      const response = await callClock(broker, clockRequest(), "wrong"); expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    } finally { await broker.close(); }
  });
  it("is denied when the native authority handler is absent", async () => {
    const broker = await clockBroker();
    try { expect((await callClock(broker, clockRequest())).status).toBe(403); }
    finally { await broker.close(); }
  });
  it("rejects invalid envelopes before dispatch and returns a correlated valid receipt", async () => {
    const handler = vi.fn(async request => clockReceipt(request)), broker = await clockBroker(handler), request = clockRequest();
    try {
      expect((await callClock(broker, { ...request, path: "untrusted" })).status).toBe(400); expect(handler).not.toHaveBeenCalled();
      const response = await callClock(broker, request); expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, receipt: { installationRef: request.installationRef,
        result: { probe_request_id: request.requestId, result: { uptime_ms: 42 } } } });
      expect(handler).toHaveBeenCalledTimes(1);
    } finally { await broker.close(); }
  });
  it("rejects mismatched receipts and non-clock effects", () => {
    const request = clockRequest(), receipt = clockReceipt(request);
    const canonical = { ...receipt, result: { ...receipt.result,
      result: { uptime_ms: 42, result_summary: receipt.result.summary } } };
    expect(validatePrivateClockBrokerReceipt(request, canonical)).toEqual(canonical);
    for (const invalid of [{ ...receipt, installationRef: "another" }, { ...receipt, epoch: -1 },
      { ...receipt, result: { ...receipt.result, probe_request_id: "probe:other" } },
      { ...receipt, result: { ...receipt.result, model_invoked: true } },
      { ...receipt, result: { ...receipt.result, result: { uptime_ms: 42, result_summary: "wrong summary" } } },
      { ...receipt, result: { ...receipt.result, result: { uptime_ms: 42, content: "arbitrary" } } }])
      expect(() => validatePrivateClockBrokerReceipt(request, invalid)).toThrow("private_clock_broker_receipt_invalid");
  });
  it("does not expose native error text", async () => {
    const broker = await clockBroker(async () => { throw Error("secret-path-that-must-not-leak"); });
    try { const response = await callClock(broker, clockRequest()); expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ ok: false, error: "private_clock_broker_observation_failed" });
    } finally { await broker.close(); }
  });
  it("aborts an expired native request and suppresses a late valid receipt", async () => {
    let cancelled = false;
    const broker = await clockBroker(async (request, signal) => {
      await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true }); });
      cancelled = signal.aborted; return clockReceipt(request);
    });
    try {
      const response = await callClock(broker, { ...clockRequest(), expiresAt: new Date(Date.now() + 500).toISOString() });
      expect(response.status).toBe(409); expect(cancelled).toBe(true);
      expect(await response.json()).toEqual({ ok: false, error: "private_clock_broker_cancelled" });
    } finally { await broker.close(); }
  });
  it("signals client disconnect to native cleanup", async () => {
    let entered!: () => void, cancelled!: () => void;
    const start = new Promise<void>(resolve => { entered = resolve; }), stopped = new Promise<void>(resolve => { cancelled = resolve; });
    const broker = await clockBroker(async (request, signal) => {
      entered(); await new Promise<void>(resolve => signal.addEventListener("abort", () => { cancelled(); resolve(); }, { once: true }));
      return clockReceipt(request);
    });
    try {
      const controller = new AbortController();
      const response = callClock(broker, clockRequest(), broker.token, controller.signal);
      const rejected = expect(response).rejects.toThrow(); await start; controller.abort(); await rejected; await stopped;
    } finally { await broker.close(); }
  });
});
