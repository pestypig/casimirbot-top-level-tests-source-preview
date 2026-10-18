import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PrivateEnvironmentDesktopOwner, type PrivateDesktopSessionAccess } from "../apps/desktop/src/environment-private-desktop-owner";
import { NativePrivateEnvironmentInstaller } from "../apps/desktop/src/environment-private-install";
import type { NativePrivateClockHost } from "../apps/desktop/src/environment-private-clock-host";
import { PRIVATE_CLOCK_INSTALL_REVIEW, PRIVATE_INSTALL_DIRECTORY_REVISION } from "../shared/environment-private-install";
import type { PrivateEnvironmentState } from "../shared/desktop-environment-home";

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const a = { id: "a" }, b = { id: "b" };
const state = (ref: string): PrivateEnvironmentState => ({ schema: "casimirbot.private_environment_state.v1",
  packageId: "fixture", version: "1", artifactSha256: "a".repeat(64), status: "not_installed",
  installAvailable: true, runtimeAvailable: false, connected: false, granted: false, installationRef: ref });
const account = (id: string) => ({ profileId: `profile:${id}`, sessionId: `session:${id}`, accountType: "developer" as const });
const fixture = (withClock = true) => {
  const reads: string[] = [];
  let access!: PrivateDesktopSessionAccess;
  const sources = new Map([a, b].map(session => [session, {
    featureEnabled: vi.fn(() => true), readAccount: vi.fn(async () => { reads.push(`account:${session.id}`); return account(session.id); }),
    readPolicy: vi.fn(async () => { reads.push(`policy:${session.id}`); return session.id; }),
    readRuntimePolicy: vi.fn(async () => session.id), selectArchive: vi.fn(async (): Promise<string | null> => null),
  }]));
  const clock = {
    prepare: vi.fn(async () => { await access.readAccount(); return { ready: true as const, installationRef: "fixture" }; }),
    observe: vi.fn<Parameters<NativePrivateClockHost["observe"]>, ReturnType<NativePrivateClockHost["observe"]>>(),
    recoverObservation: vi.fn<Parameters<NativePrivateClockHost["recoverObservation"]>, ReturnType<NativePrivateClockHost["recoverObservation"]>>(),
    stop: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  const createOwner = vi.fn((callbacks: PrivateDesktopSessionAccess) => {
    access = callbacks;
    const inspect = async () => { const current = await access.readAccount(); await access.readPolicy(); return state(current.profileId); };
    return { installer: { inspect, install: inspect }, clock: withClock ? clock : undefined };
  });
  const owner = new PrivateEnvironmentDesktopOwner<{ id: string }>({ accessForSession: session => sources.get(session)!, createOwner });
  return { owner, clock, sources, reads, createOwner, access: () => access };
};

describe("private desktop single lifecycle owner", () => {
  it("constructs once and binds successive account/policy callbacks to their requesting sessions", async () => {
    const s = fixture(); expect(s.createOwner).not.toHaveBeenCalled();
    expect((await s.owner.inspect(a)).installationRef).toBe("profile:a");
    expect((await s.owner.install(b)).installationRef).toBe("profile:b");
    expect(s.createOwner).toHaveBeenCalledTimes(1);
    expect(s.reads).toEqual(["account:a", "policy:a", "account:b", "policy:b"]);
  });
  it("denies overlap before another session can read policy or open a picker", async () => {
    const s = fixture(), held = deferred<ReturnType<typeof account>>(), entered = deferred<void>();
    s.sources.get(a)!.readAccount.mockImplementationOnce(() => { entered.resolve(); return held.promise; });
    const first = s.owner.install(a); await entered.promise;
    await expect(s.owner.install(b)).rejects.toThrow("private_environment_busy");
    expect(s.sources.get(b)!.readAccount).not.toHaveBeenCalled();
    held.resolve(account("a")); await first;
  });
  it("Stop rejects a late account result and keeps admission busy until it settles", async () => {
    const s = fixture(), held = deferred<ReturnType<typeof account>>(), entered = deferred<void>();
    s.sources.get(a)!.readAccount.mockImplementationOnce(() => { entered.resolve(); return held.promise; });
    const first = s.owner.inspect(a); const rejected = expect(first).rejects.toThrow("private_environment_operation_cancelled");
    await entered.promise; await s.owner.stop(a);
    await expect(s.owner.inspect(b)).rejects.toThrow("private_environment_busy");
    held.resolve(account("a")); await rejected;
    expect(s.sources.get(a)!.readPolicy).not.toHaveBeenCalled();
    expect((await s.owner.inspect(b)).installationRef).toBe("profile:b");
  });
  it("rejects callbacks detached from a completed operation", async () => {
    const s = fixture(); await s.owner.inspect(a);
    await expect(s.access().readAccount()).rejects.toThrow("private_environment_operation_cancelled");
    expect(s.access().featureEnabled()).toBe(false);
  });
  it("retains prepared session ownership across operations and rejects foreign operations including Stop", async () => {
    const s = fixture(); await s.owner.prepare(a);
    for (const call of [() => s.owner.inspect(b), () => s.owner.install(b), () => s.owner.prepare(b),
      () => s.owner.observe(b, {}), () => s.owner.recoverObservation(b, {}), () => s.owner.stop(b)]) {
      await expect(call()).rejects.toThrow("private_environment_session_mismatch");
    }
    expect(s.sources.get(b)!.readAccount).not.toHaveBeenCalled(); expect(s.clock.stop).not.toHaveBeenCalled();
    await s.owner.stop(a); await s.owner.prepare(b);
    expect(s.clock.prepare).toHaveBeenCalledTimes(2);
  });
  it("stops after account access is lost without requiring fresh account or policy reads", async () => {
    const s = fixture(); await s.owner.prepare(a);
    s.sources.get(a)!.readAccount.mockRejectedValue(new Error("signed_out"));
    const count = s.sources.get(a)!.readAccount.mock.calls.length;
    await s.owner.stop(a); expect(s.sources.get(a)!.readAccount).toHaveBeenCalledTimes(count);
    expect(s.clock.stop).toHaveBeenCalledTimes(1);
    await expect(s.owner.observe(a, {})).rejects.toThrow("private_environment_preparation_required");
    expect(s.clock.observe).not.toHaveBeenCalled();
  });
  it("keeps cleanup failure fenced even if a later Stop resolves", async () => {
    const s = fixture(); await s.owner.prepare(a);
    s.clock.stop.mockRejectedValueOnce(new Error("clock_stop_unconfirmed"));
    await expect(s.owner.stop(a)).rejects.toThrow("private_environment_cleanup_unconfirmed");
    await s.owner.stop(a);
    for (const call of [() => s.owner.install(a), () => s.owner.prepare(a), () => s.owner.inspect(b)])
      await expect(call()).rejects.toThrow("private_environment_cleanup_unconfirmed");
    expect(s.createOwner).toHaveBeenCalledTimes(1);
  });
  it("closes without an account, rejects late publication and cannot reopen after failed cleanup", async () => {
    const s = fixture(), held = deferred<ReturnType<typeof account>>(), entered = deferred<void>();
    s.sources.get(a)!.readAccount.mockImplementationOnce(() => { entered.resolve(); return held.promise; });
    const first = s.owner.inspect(a), rejected = expect(first).rejects.toThrow("private_environment_operation_cancelled");
    await entered.promise; s.clock.close.mockRejectedValueOnce(new Error("cleanup_failed"));
    await expect(s.owner.close()).rejects.toThrow("private_environment_cleanup_unconfirmed");
    held.resolve(account("a")); await rejected;
    await expect(s.owner.inspect(a)).rejects.toThrow("private_environment_closed");
    expect(s.sources.get(a)!.readPolicy).not.toHaveBeenCalled();
  });
  it("keeps install-only owners incapable of preparing or recovering execution", async () => {
    const s = fixture(false); await s.owner.inspect(a);
    await expect(s.owner.prepare(a)).rejects.toThrow("private_runtime_not_qualified");
    await expect(s.owner.recoverObservation(a, {})).rejects.toThrow("private_runtime_not_qualified");
    expect(s.clock.prepare).not.toHaveBeenCalled();
  });
  it("holds one lease through preparation and observation and constructs the request only when ready", async () => {
    const s = fixture(), prepared = deferred<{ ready: true; installationRef: string }>();
    const observing = deferred<Awaited<ReturnType<NativePrivateClockHost["observe"]>>>();
    const entered = deferred<void>(), request = { probe_request_id: "fixture:atomic" };
    s.clock.prepare.mockImplementationOnce(() => prepared.promise);
    s.clock.observe.mockImplementationOnce(async value => {
      expect(value).toBe(request); await s.access().readAccount(); entered.resolve(); return observing.promise;
    });
    const createRequest = vi.fn(() => request);
    const result = s.owner.prepareAndObserve(a, createRequest);
    expect(createRequest).not.toHaveBeenCalled();
    await expect(s.owner.inspect(a)).rejects.toThrow("private_environment_busy");
    await expect(s.owner.prepareAndObserve(b, createRequest)).rejects.toThrow("private_environment_session_mismatch");
    prepared.resolve({ ready: true, installationRef: "fixture" }); await entered.promise;
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(createRequest).toHaveBeenCalledWith({ ready: true, installationRef: "fixture" });
    await expect(s.owner.recoverObservation(a)).rejects.toThrow("private_environment_busy");
    observing.resolve(undefined as never); await result;
    expect(s.clock.observe).toHaveBeenCalledTimes(1);
    await s.owner.stop(a); await s.owner.inspect(b);
  });
  it.each(["stop", "close"] as const)("%s during preparation prevents request construction and dispatch", async action => {
    const s = fixture(), prepared = deferred<{ ready: true; installationRef: string }>();
    s.clock.prepare.mockImplementationOnce(() => prepared.promise);
    const createRequest = vi.fn(() => ({}));
    const result = s.owner.prepareAndObserve(a, createRequest);
    const rejected = expect(result).rejects.toThrow("private_environment_operation_cancelled");
    await (action === "stop" ? s.owner.stop(a) : s.owner.close());
    prepared.resolve({ ready: true, installationRef: "fixture" }); await rejected;
    expect(createRequest).not.toHaveBeenCalled(); expect(s.clock.observe).not.toHaveBeenCalled();
  });
  it("rejects a late observation after Stop without publishing it", async () => {
    const s = fixture(), observing = deferred<Awaited<ReturnType<NativePrivateClockHost["observe"]>>>(), entered = deferred<void>();
    s.clock.observe.mockImplementationOnce(() => { entered.resolve(); return observing.promise; });
    const result = s.owner.prepareAndObserve(a, () => ({}));
    const rejected = expect(result).rejects.toThrow("private_environment_operation_cancelled");
    await entered.promise; await s.owner.stop(a); observing.resolve(undefined as never); await rejected;
  });
  it("releases a prepared helper after request construction fails without reading the clock", async () => {
    const s = fixture();
    await expect(s.owner.prepareAndObserve(a, () => { throw Error("selected_installation_changed"); }))
      .rejects.toThrow("selected_installation_changed");
    expect(s.clock.stop).toHaveBeenCalledTimes(1); expect(s.clock.observe).not.toHaveBeenCalled();
    await s.owner.inspect(b);
  });
  it("does not admit atomic observations when no runtime was configured", async () => {
    const s = fixture(false), createRequest = vi.fn(() => ({}));
    await expect(s.owner.prepareAndObserve(a, createRequest)).rejects.toThrow("private_runtime_not_qualified");
    expect(createRequest).not.toHaveBeenCalled(); expect(s.clock.prepare).not.toHaveBeenCalled();
  });
  it.each(["prepare", "request", "observe"] as const)("cleans up after %s failure and fences uncertain cleanup", async phase => {
    const s = fixture(), createRequest = vi.fn(() => { if (phase === "request") throw Error("request_failed"); return {}; });
    if (phase === "prepare") s.clock.prepare.mockRejectedValueOnce(Error("prepare_failed"));
    if (phase === "observe") s.clock.observe.mockRejectedValueOnce(Error("observe_failed"));
    s.clock.stop.mockRejectedValueOnce(Error("cleanup_uncertain"));
    await expect(s.owner.prepareAndObserve(a, createRequest)).rejects.toThrow("private_environment_cleanup_unconfirmed");
    await expect(s.owner.inspect(a)).rejects.toThrow("private_environment_cleanup_unconfirmed");
    if (phase !== "observe") expect(s.clock.observe).not.toHaveBeenCalled();
    if (phase === "prepare") expect(createRequest).not.toHaveBeenCalled();
  });
  it("uses real installer admission for two sequential developer sessions without sharing their policy", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "casimirbot-owner-admission-"));
    const now = new Date("2026-09-26T12:00:00Z"), deviceId = `desktop_device_${"a".repeat(22)}`;
    let count = 0;
    const owner = new PrivateEnvironmentDesktopOwner<{ id: string }>({
      createOwner: access => { count++; return { installer: new NativePrivateEnvironmentInstaller({
        userDataPath: root, deviceId, executable: process.execPath, now: () => now, ...access }) }; },
      accessForSession: session => ({ featureEnabled: () => true, readAccount: async () => account(session.id),
        readPolicy: async () => ({ schema: "casimirbot.private_environment_install_policy.v1", profile_id: account(session.id).profileId,
          device_id: deviceId, session_ref: createHash("sha256").update(account(session.id).sessionId).digest("hex"),
          policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION, expires_at: "2026-10-01T00:00:00.000Z",
          artifact_sha256: PRIVATE_CLOCK_INSTALL_REVIEW.archiveSha256, review_revision: PRIVATE_CLOCK_INSTALL_REVIEW.policyRevision,
          install_allowed: true, runtime_allowed: false, credential_included: false, public_release: false }),
        readRuntimePolicy: async () => { throw Error("not_admitted"); }, selectArchive: async () => null }),
    });
    try {
      expect(await owner.inspect(a)).toMatchObject({ status: "not_installed", installAvailable: true, runtimeAvailable: false });
      expect(await owner.inspect(b)).toMatchObject({ status: "not_installed", installAvailable: true, runtimeAvailable: false });
      expect(await owner.install(b)).toMatchObject({ cancelled: true, runtimeAvailable: false }); expect(count).toBe(1);
    } finally {
      await owner.close();
      // The actual store creates its directory hierarchy even on inspect.
      // Retain this small test root; inspect/cancel must not create package files.
      expect(fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => !entry.isDirectory())).toEqual([]);
    }
  });
});
