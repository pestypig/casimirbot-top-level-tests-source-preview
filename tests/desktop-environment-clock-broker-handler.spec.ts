import { describe, expect, it, vi } from "vitest";
import { PrivateEnvironmentDesktopOwner } from "../apps/desktop/src/environment-private-desktop-owner";
import { createPrivateClockBrokerHandler, type PrivateClockBrokerRequest,
  type PrivateClockObservationAuthority } from "../apps/desktop/src/environment-private-clock-broker";
import { HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA, helixEnvironmentConnectorProbeRequestSchema,
  type HelixEnvironmentConnectorProbeRequest } from "../shared/helix-environment-connector";
import type { ClockObservationReceipt } from "../apps/desktop/src/environment-clock-observation-journal";

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  let time = Date.parse("2026-09-27T08:00:00Z");
  const session = {}, revoked = new AbortController(), connection = new AbortController();
  const request: PrivateClockBrokerRequest = { schema: "casimir_private_clock_observe_request/1",
    accountSessionId: "account_session:fixture-owner", clientRef: "mcp_client:fixture-owner", requestId: "probe:handler-fixture",
    installationRef: "environment_installation:11111111-1111-4111-8111-111111111111", expiresAt: new Date(time + 15000).toISOString() };
  const permission: PrivateClockObservationAuthority<object> = { session, accountSessionId: request.accountSessionId,
    clientRef: request.clientRef, installationRef: request.installationRef, grantRef: "grant:fixture-clock",
    catalogSnapshotId: "catalog:fixture-clock", expiresAt: new Date(time + 60000).toISOString(), revoked: revoked.signal };
  const authorize = vi.fn(async () => permission);
  const receipt = (probe: HelixEnvironmentConnectorProbeRequest): ClockObservationReceipt => ({
    executionRef: "environment_execution:22222222-2222-4222-8222-222222222222", epoch: 1, installationRef: request.installationRef,
    result: { schema: HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA, probe_request_id: probe.probe_request_id,
      capability_id: probe.capability_id, capability_version: 1, outcome: "succeeded", summary: "Fixture observation",
      result: { uptime_ms: 42 }, side_effects_performed: false, commands_executed: [], environment_mutation_performed: false,
      deterministic: true, model_invoked: false, assistant_answer: false, raw_content_included: false, created_at: new Date(time).toISOString() } });
  const clock = {
    prepare: vi.fn(async () => ({ ready: true as const, installationRef: request.installationRef })),
    observe: vi.fn(async (value: unknown) => receipt(helixEnvironmentConnectorProbeRequestSchema.parse(value))),
    recoverObservation: vi.fn(async () => ({ state: "absent" as const, fresh: false as const })),
    stop: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  const owner = new PrivateEnvironmentDesktopOwner<object>({
    accessForSession: () => ({ featureEnabled: () => true,
      readAccount: async () => ({ sessionId: request.accountSessionId, profileId: "profile:fixture", accountType: "developer" }),
      readPolicy: async () => ({}), readRuntimePolicy: async () => ({}), selectArchive: async () => null }),
    createOwner: () => ({ clock, installer: { inspect: async () => { throw Error("unused"); }, install: async () => { throw Error("unused"); } } }),
  });
  const handler = createPrivateClockBrokerHandler({ owner, authorize, now: () => time });
  return { request, permission, session, revoked, connection, authorize, clock, owner, handler, advance: (ms: number) => { time += ms; } };
}

describe("private clock native authority composition", () => {
  it("creates the bounded clock request after preparation and finishes cleanup before returning", async () => {
    const s = fixture(), initial = Date.parse(s.request.expiresAt) - 15000;
    s.clock.prepare.mockImplementationOnce(async () => { s.advance(2000); return { ready: true, installationRef: s.request.installationRef }; });
    const receipt = await s.handler(s.request, s.connection.signal);
    expect(receipt.result.result).toEqual({ uptime_ms: 42 });
    expect(s.clock.observe).toHaveBeenCalledTimes(1);
    expect(s.clock.observe.mock.calls[0][0]).toMatchObject({ probe_request_id: s.request.requestId,
      catalog_snapshot_id: s.permission.catalogSnapshotId, created_at: new Date(initial + 2000).toISOString(),
      deadline_at: new Date(initial + 7000).toISOString(), arguments: { clock: "monotonic" },
      constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 } });
    expect(s.clock.stop).toHaveBeenCalledTimes(1);
    expect(s.authorize).toHaveBeenCalledTimes(5);
    // No reservation remains after the successful composed operation.
    const nextSession = {}; await s.owner.prepare(nextSession); await s.owner.stop(nextSession);
  });
  it.each(["accountSessionId", "clientRef", "installationRef"] as const)("rejects a grant with a different %s before preparing", async field => {
    const s = fixture(); s.authorize.mockResolvedValue({ ...s.permission, [field]: "other:identity" });
    await expect(s.handler(s.request, s.connection.signal)).rejects.toThrow("private_clock_broker_authority_inactive");
    expect(s.clock.prepare).not.toHaveBeenCalled(); expect(s.clock.observe).not.toHaveBeenCalled();
  });
  it("rejects a grant changed during preparation and disposes the prepared helper", async () => {
    const s = fixture();
    s.clock.prepare.mockImplementationOnce(async () => {
      s.authorize.mockResolvedValue({ ...s.permission, grantRef: "grant:replacement" });
      return { ready: true, installationRef: s.request.installationRef };
    });
    await expect(s.handler(s.request, s.connection.signal)).rejects.toThrow("private_clock_broker_authority_inactive");
    expect(s.clock.observe).not.toHaveBeenCalled(); expect(s.clock.stop).toHaveBeenCalledTimes(1);
  });
  it("rejects installation replacement between consent and preparation", async () => {
    const s = fixture(); s.clock.prepare.mockResolvedValueOnce({ ready: true, installationRef: "different-installation" });
    await expect(s.handler(s.request, s.connection.signal)).rejects.toThrow("private_clock_broker_authority_inactive");
    expect(s.clock.observe).not.toHaveBeenCalled(); expect(s.clock.stop).toHaveBeenCalledTimes(1);
  });
  it.each(["revoke", "disconnect"] as const)("%s during preparation stops the owned runtime and prevents dispatch", async kind => {
    const s = fixture(), prepared = deferred<{ ready: true; installationRef: string }>(), entered = deferred<void>(), stopped = deferred<void>();
    s.clock.prepare.mockImplementationOnce(() => { entered.resolve(); return prepared.promise; });
    s.clock.stop.mockImplementation(async () => { stopped.resolve(); });
    const pending = s.handler(s.request, s.connection.signal);
    const rejected = expect(pending).rejects.toThrow("private_environment_operation_cancelled");
    await entered.promise; (kind === "revoke" ? s.revoked : s.connection).abort(); await stopped.promise;
    prepared.resolve({ ready: true, installationRef: s.request.installationRef }); await rejected;
    expect(s.clock.observe).not.toHaveBeenCalled();
  });
  it("does not let cancellation of a busy MCP request stop the existing Home operation", async () => {
    const s = fixture(), prepared = deferred<{ ready: true; installationRef: string }>();
    s.clock.prepare.mockImplementationOnce(() => prepared.promise);
    const home = s.owner.prepare(s.session);
    await expect(s.handler(s.request, s.connection.signal)).rejects.toThrow("private_environment_busy");
    s.connection.abort(); s.revoked.abort(); expect(s.clock.stop).not.toHaveBeenCalled();
    prepared.resolve({ ready: true, installationRef: s.request.installationRef }); await home; await s.owner.stop(s.session);
  });
  it("suppresses a result when permission changes during observation", async () => {
    const s = fixture(), original = s.clock.observe.getMockImplementation()!;
    s.clock.observe.mockImplementationOnce(async request => {
      const receipt = await original(request); s.authorize.mockResolvedValue({ ...s.permission, grantRef: "grant:replaced" }); return receipt;
    });
    await expect(s.handler(s.request, s.connection.signal)).rejects.toThrow("private_clock_broker_authority_inactive");
    expect(s.clock.stop).toHaveBeenCalledTimes(1);
  });
  it("does not dispatch after grant expiry consumed by preparation", async () => {
    const s = fixture(); s.authorize.mockResolvedValue({ ...s.permission, expiresAt: new Date(Date.parse(s.request.expiresAt) - 14000).toISOString() });
    s.clock.prepare.mockImplementationOnce(async () => { s.advance(1100); return { ready: true, installationRef: s.request.installationRef }; });
    await expect(s.handler(s.request, s.connection.signal)).rejects.toThrow("private_clock_broker_authority_inactive");
    expect(s.clock.observe).not.toHaveBeenCalled(); expect(s.clock.stop).toHaveBeenCalledTimes(1);
  });
  it("does not return a receipt when successful read cleanup cannot be confirmed", async () => {
    const s = fixture(); s.clock.stop.mockRejectedValue(Error("cleanup_failed"));
    await expect(s.handler(s.request, s.connection.signal)).rejects.toThrow("private_environment_cleanup_unconfirmed");
    await expect(s.owner.prepare(s.session)).rejects.toThrow("private_environment_cleanup_unconfirmed");
  });
  it("holds admission until native cleanup completes", async () => {
    const s = fixture(), cleanup = deferred<void>(), entered = deferred<void>();
    s.clock.stop.mockImplementationOnce(() => { entered.resolve(); return cleanup.promise; });
    const pending = s.handler(s.request, s.connection.signal); await entered.promise;
    await expect(s.owner.prepare(s.session)).rejects.toThrow("private_environment_busy");
    cleanup.resolve(); await pending;
    await s.owner.prepare(s.session); await s.owner.stop(s.session);
  });
});
