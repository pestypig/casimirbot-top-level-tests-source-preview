import { describe, expect, it, vi } from "vitest";
import { createPrivateClockIpcHandlers } from "../apps/desktop/src/environment-private-clock-ipc";
import type { PrivateEnvironmentDesktopOwner } from "../apps/desktop/src/environment-private-desktop-owner";
import { EnvironmentClockError } from "../apps/desktop/src/environment-clock-supervisor";

type Owner = PrivateEnvironmentDesktopOwner<object>;
const request = () => ({ schema: "helix.environment_connector.probe_request.v1", probe_request_id: "probe:ipc-test",
  capability_id: "com.casimirbot.system.clock.read", capability_version: 1, catalog_snapshot_id: "catalog:ipc-test",
  arguments: { clock: "monotonic" }, constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
  created_at: "2026-09-26T12:00:00.000Z", deadline_at: "2026-09-26T12:00:05.000Z", assistant_answer: false, raw_content_included: false });
const fixture = () => {
  const session = {}, frame = { url: "http://127.0.0.1:12345/desktop" };
  const sender = { session, mainFrame: frame, isDestroyed: vi.fn(() => false) }, event = { sender, senderFrame: frame };
  const owner = {
    prepare: vi.fn<Parameters<Owner["prepare"]>, ReturnType<Owner["prepare"]>>(),
    observe: vi.fn<Parameters<Owner["observe"]>, ReturnType<Owner["observe"]>>(),
    recoverObservation: vi.fn<Parameters<Owner["recoverObservation"]>, ReturnType<Owner["recoverObservation"]>>(),
    stop: vi.fn<Parameters<Owner["stop"]>, ReturnType<Owner["stop"]>>(),
  };
  const access = vi.fn(() => owner), admitted = vi.fn(() => true);
  const permission = { inspect: vi.fn(async (_session: object) => ({})),
    grant: vi.fn(async (_session: object, _ref: string) => ({})), revoke: vi.fn(() => {}) };
  const handlers = createPrivateClockIpcHandlers({ mainSender: () => sender,
    isTrustedUrl: url => new URL(url).origin === "http://127.0.0.1:12345", runtimeAdmitted: admitted, owner: access, permission });
  return { session, frame, sender, event, owner, access, admitted, handlers, permission };
};
describe("private clock native IPC boundary", () => {
  it.each(["foreign-window", "subframe", "missing-frame", "wrong-origin", "destroyed"])("rejects %s before owner or admission access", async kind => {
    const s = fixture();
    if (kind === "foreign-window") s.event.sender = { ...s.sender };
    if (kind === "subframe") s.event.senderFrame = { ...s.frame };
    if (kind === "missing-frame") s.event.senderFrame = undefined as never;
    if (kind === "wrong-origin") s.frame.url = "https://untrusted.example/desktop";
    if (kind === "destroyed") s.sender.isDestroyed.mockReturnValue(true);
    for (const call of [() => s.handlers.prepare(s.event), () => s.handlers.observe(s.event, request()),
      () => s.handlers.history(s.event, request()), () => s.handlers.history(s.event), () => s.handlers.stop(s.event),
      () => s.handlers.permissionState(s.event), () => s.handlers.grantPermission(s.event, "environment_installation:11111111-1111-4111-8111-111111111111"),
      () => s.handlers.revokePermission(s.event)])
      await expect(call()).rejects.toThrow("private_clock_ipc_sender_rejected");
    expect(s.access).not.toHaveBeenCalled(); expect(s.admitted).not.toHaveBeenCalled();
  });
  it("binds permission controls to the native Session and only an expected installation ref", async () => {
    const s = fixture(), ref = "environment_installation:11111111-1111-4111-8111-111111111111";
    await s.handlers.permissionState(s.event); await s.handlers.grantPermission(s.event, ref);
    expect(s.permission.inspect).toHaveBeenCalledWith(s.session); expect(s.permission.grant).toHaveBeenCalledWith(s.session, ref);
    await expect(s.handlers.grantPermission(s.event, ref, { accountSessionId: "other" })).rejects.toThrow("private_clock_ipc_arguments_invalid");
    await expect(s.handlers.grantPermission(s.event, { ref })).rejects.toThrow("private_clock_ipc_arguments_invalid");
    expect(s.permission.grant).toHaveBeenCalledTimes(1);
  });
  it("withdraws permission and stops even with runtime disabled or persistence failure", async () => {
    const s = fixture(); s.admitted.mockReturnValue(false);
    await expect(s.handlers.revokePermission(s.event)).resolves.toEqual({ revoked: true });
    expect(s.owner.stop).toHaveBeenCalledWith(s.session);
    s.permission.revoke.mockImplementationOnce(() => { throw Error("persistence_failure_with_private_path"); });
    await expect(s.handlers.revokePermission(s.event)).rejects.toThrow("private_clock_ipc_failed");
    expect(s.owner.stop).toHaveBeenCalledTimes(2);
  });
  it("requires native execution admission but preserves Stop", async () => {
    const s = fixture(); s.admitted.mockReturnValue(false);
    for (const call of [() => s.handlers.prepare(s.event), () => s.handlers.observe(s.event, request()), () => s.handlers.history(s.event, request()), () => s.handlers.history(s.event)])
      await expect(call()).rejects.toThrow("private_runtime_not_qualified");
    expect(s.access).not.toHaveBeenCalled(); await s.handlers.stop(s.event);
    expect(s.owner.stop).toHaveBeenCalledWith(s.session); expect(s.admitted).toHaveBeenCalledTimes(4);
  });
  it("rejects extra or missing arguments including identity and launcher configuration", async () => {
    const s = fixture();
    for (const call of [() => s.handlers.prepare(s.event, { accountType: "developer" }),
      () => s.handlers.stop(s.event, undefined), () => s.handlers.observe(s.event),
      () => s.handlers.history(s.event, request(), { executable: "custom.exe" })])
      await expect(call()).rejects.toThrow("private_clock_ipc_arguments_invalid");
    expect(s.access).not.toHaveBeenCalled();
  });
  it.each(["extra-field", "extra-argument", "capability", "version", "clock", "duration", "mutation", "deadline", "oversized"])("rejects invalid %s without dispatch", async kind => {
    const s = fixture(), value: any = request();
    if (kind === "extra-field") value.profile_id = "owner-supplied";
    if (kind === "extra-argument") value.arguments.apiKey = "fixture-not-a-key";
    if (kind === "capability") value.capability_id = "com.other.action";
    if (kind === "version") value.capability_version = 2;
    if (kind === "clock") value.arguments.clock = "wall";
    if (kind === "duration") value.constraints.max_duration_ms = 5001;
    if (kind === "mutation") value.constraints.side_effects_allowed = true;
    if (kind === "deadline") value.deadline_at = "2026-09-26T11:59:59.000Z";
    if (kind === "oversized") value.probe_request_id = "x".repeat(70000);
    await expect(s.handlers.observe(s.event, value)).rejects.toThrow("private_clock_ipc_request_invalid");
    await expect(s.handlers.history(s.event, value)).rejects.toThrow("private_clock_ipc_request_invalid");
    expect(s.access).not.toHaveBeenCalled();
  });
  it("owns a copy of the request and preserves dates and native session provenance", async () => {
    const s = fixture(), value = request(), original = structuredClone(value);
    const pending = s.handlers.observe(s.event, value); value.arguments.clock = "changed";
    await pending;
    expect(s.owner.observe).toHaveBeenCalledWith(s.session, original);
    expect(s.owner.observe.mock.calls[0][1]).not.toBe(value);
    await s.handlers.history(s.event, original);
    expect(s.owner.recoverObservation).toHaveBeenCalledWith(s.session, original);
    expect(s.owner.prepare).not.toHaveBeenCalled();
  });
  it("permits no-argument native discovery but rejects explicit undefined or null", async () => {
    const s = fixture(); await s.handlers.history(s.event);
    expect(s.owner.recoverObservation).toHaveBeenCalledWith(s.session);
    s.owner.recoverObservation.mockClear();
    await expect(s.handlers.history(s.event, undefined)).rejects.toThrow("private_clock_ipc_request_invalid");
    await expect(s.handlers.history(s.event, null)).rejects.toThrow("private_clock_ipc_request_invalid");
    expect(s.owner.recoverObservation).not.toHaveBeenCalled(); expect(s.owner.prepare).not.toHaveBeenCalled();
  });
  it("sanitizes unknown failures while preserving typed native reason codes", async () => {
    const s = fixture();
    s.owner.prepare.mockRejectedValueOnce(new Error("private path or secret detail"));
    await expect(s.handlers.prepare(s.event)).rejects.toThrow(/^private_clock_ipc_failed$/);
    s.owner.prepare.mockRejectedValueOnce(new EnvironmentClockError("clock_stop_unconfirmed"));
    await expect(s.handlers.prepare(s.event)).rejects.toThrow(/^clock_stop_unconfirmed$/);
  });
});
