import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_CLOCK_INSTALL_REVIEW } from "../shared/environment-private-install";
import { createPrivateEnvironmentAppOwner, readPrivateEnvironmentAccount, readPrivateEnvironmentPolicy } from "../apps/desktop/src/environment-private-app";
import { PrivateRuntimeArtifactError } from "../apps/desktop/src/environment-private-runtime-artifacts";

const fixtures = vi.hoisted(() => {
  const installer = { inspect: vi.fn(async () => ({ status: "installed_stopped" })), install: vi.fn(async () => ({ status: "installed_stopped" })),
    acquireMutationFence: vi.fn(async () => () => {}) };
  const clock = { installer, prepare: vi.fn(async () => ({ ready: true, installationRef: "fixture" })),
    observe: vi.fn(), recoverObservation: vi.fn(), stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  return { installer, clock, constructInstaller: vi.fn(), constructClock: vi.fn(), load: vi.fn() };
});

const cleanupRoots: string[] = [];
afterEach(() => {
  for (const root of cleanupRoots.splice(0)) {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("casimirbot-cleanup-app-")) throw Error("cleanup_scope_invalid");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
const cleanupFixture = () => {
  const s = setup(true), root = fs.mkdtempSync(path.join(os.tmpdir(), "casimirbot-cleanup-app-")); cleanupRoots.push(root);
  const account = { profileId: "profile:a", sessionId: "session:a", accountType: "developer" as const };
  const readRemovalAccount = vi.fn(async () => account), confirmRemoval = vi.fn(async () => true);
  const app = createPrivateEnvironmentAppOwner({ ...s.input, userDataPath: root,
    accessForSession: () => ({ ...s.access, readRemovalAccount, confirmRemoval }) });
  const hash = (text: string) => createHash("sha256").update(text).digest("hex");
  const scope = path.join(root, "environment-packages/v1", hash(JSON.stringify([account.profileId, s.input.deviceId])), hash(PRIVATE_CLOCK_INSTALL_REVIEW.packageId));
  fs.mkdirSync(scope, { recursive: true }); const pointer = path.join(scope, "selected.json");
  fs.writeFileSync(pointer, JSON.stringify({ schema: "casimirbot.environment_package_installation.v1",
    installationRef: "environment_installation:00000000-0000-4000-8000-000000000001", profileId: account.profileId,
    deviceId: s.input.deviceId, packageId: PRIVATE_CLOCK_INSTALL_REVIEW.packageId, version: PRIVATE_CLOCK_INSTALL_REVIEW.version,
    artifactSha256: PRIVATE_CLOCK_INSTALL_REVIEW.archiveSha256, policyRevision: PRIVATE_CLOCK_INSTALL_REVIEW.policyRevision,
    installedAt: "2026-09-26T00:00:00Z", status: "installed_stopped", connected: false, granted: false, runtimeLaunchable: false }));
  return { ...s, ...app, readRemovalAccount, confirmRemoval, pointer };
};
describe("native removal composition", () => {
  it("cleans a selection after flag withdrawal without loading expired execution artifacts", async () => {
    const s = cleanupFixture(); s.flags.home = false; s.flags.runtime = false;
    fixtures.load.mockImplementation(() => { throw new PrivateRuntimeArtifactError("private_clock_runtime_review_expired"); });
    expect(await s.owner.inspectRemoval(session)).toMatchObject({ status: "selected" });
    expect(await s.owner.removePackage(session)).toMatchObject({ status: "removed", receipt: { selected: false, codeFilesRemoved: false } });
    expect(fs.existsSync(s.pointer)).toBe(false); expect(fixtures.load).not.toHaveBeenCalled();
    expect(fixtures.constructClock).not.toHaveBeenCalled(); expect(fixtures.constructInstaller).not.toHaveBeenCalled();
    expect(s.access.readAccount).not.toHaveBeenCalled(); expect(s.access.readPolicy).not.toHaveBeenCalled();
    expect(s.readRemovalAccount).toHaveBeenCalled(); await s.owner.close();
  });
  it("uses the existing prepared host's exact mutation fence without another host", async () => {
    const s = cleanupFixture(); await s.owner.prepare(session); const release = vi.fn();
    fixtures.installer.acquireMutationFence.mockResolvedValueOnce(release);
    s.flags.home = false; s.flags.runtime = false;
    expect(await s.owner.removePackage(session)).toMatchObject({ status: "removed" });
    expect(fixtures.installer.acquireMutationFence).toHaveBeenCalledWith({ profileId: "profile:a", deviceId: s.input.deviceId }, PRIVATE_CLOCK_INSTALL_REVIEW.packageId);
    expect(release).toHaveBeenCalledTimes(1); expect(fixtures.constructClock).toHaveBeenCalledTimes(1); await s.owner.close();
  });
  it.each(["stop", "close"] as const)("rejects a late native confirmation after %s", async action => {
    const s = cleanupFixture(); let answer!: (value: boolean) => void, enter!: () => void;
    const entered = new Promise<void>(r => { enter = r; });
    s.confirmRemoval.mockImplementationOnce(async () => { enter(); return new Promise<boolean>(r => { answer = r; }); });
    const pending = s.owner.removePackage(session); const rejected = expect(pending).rejects.toThrow("private_environment_operation_cancelled");
    await entered;
    await expect(s.owner.prepare(session)).rejects.toThrow("private_environment_busy");
    if (action === "stop") await s.owner.stop(session); else await s.owner.close();
    answer(true); await rejected;
    expect(fs.existsSync(s.pointer)).toBe(true); expect(fixtures.installer.acquireMutationFence).not.toHaveBeenCalled();
    await s.owner.close();
  });
  it("does not reuse install identity when cleanup identity is unavailable", async () => {
    const s = cleanupFixture(); s.readRemovalAccount.mockRejectedValue(Error("signed out"));
    expect(await s.owner.removePackage(session)).toMatchObject({ status: "unavailable" });
    expect(s.confirmRemoval).not.toHaveBeenCalled(); expect(fs.existsSync(s.pointer)).toBe(true); await s.owner.close();
  });
  it("checks the current runtime owner even if cleanup was constructed first", async () => {
    const s = cleanupFixture(); await s.owner.inspectRemoval(session); await s.owner.prepare(session);
    expect(await s.owner.removePackage(session)).toMatchObject({ status: "removed" });
    expect(fixtures.installer.acquireMutationFence).toHaveBeenCalledTimes(1); await s.owner.close();
  });
  it("releases the prepared-session reservation after completed cleanup", async () => {
    const s = cleanupFixture(); await s.owner.prepare(session);
    await expect(s.owner.inspectRemoval({ id: "other" })).rejects.toThrow("private_environment_session_mismatch");
    expect(await s.owner.removePackage(session)).toMatchObject({ status: "removed" });
    expect(await s.owner.inspectRemoval({ id: "other" })).toEqual({ status: "not_installed" }); await s.owner.close();
  });
});
vi.mock("../apps/desktop/src/environment-private-install", () => ({ NativePrivateEnvironmentInstaller: vi.fn(function(input) {
  fixtures.constructInstaller(input); return fixtures.installer;
}) }));
vi.mock("../apps/desktop/src/environment-private-clock-host", () => ({ NativePrivateClockHost: vi.fn(function(input) {
  fixtures.constructClock(input); return fixtures.clock;
}) }));
vi.mock("../apps/desktop/src/environment-private-runtime-artifacts", async importOriginal => ({
  ...await importOriginal<typeof import("../apps/desktop/src/environment-private-runtime-artifacts")>(),
  loadPrivatePreparedClockRuntimeArtifacts: fixtures.load,
}));

const session = { id: "native-a" };
const artifacts = { runtime: { executable: "pinned-node", sha256: "node-hash", helperPath: "legacy-helper", helperSha256: "legacy-hash" },
  preparedHelper: { path: "prepared-helper", sha256: "prepared-hash" } };
const setup = (enabled = false, directory: string | undefined = "native-directory") => {
  const flags = { home: true, runtime: enabled };
  const access = { featureEnabled: () => flags.home,
    readAccount: vi.fn(async () => ({ profileId: "profile:a", sessionId: "session:a", accountType: "developer" as const })),
    readPolicy: vi.fn(async () => ({})), readRuntimePolicy: vi.fn(async () => ({})), selectArchive: vi.fn(async () => null) };
  const input = { userDataPath: "native-user-data", deviceId: "native-device", installExecutable: "electron",
    runtimeDirectory: directory, homeEnabled: () => flags.home, runtimeEnabled: () => flags.runtime,
    accessForSession: vi.fn(() => access) };
  return { flags, access, input, ...createPrivateEnvironmentAppOwner(input) };
};
beforeEach(() => { vi.clearAllMocks(); fixtures.load.mockReset(); fixtures.load.mockReturnValue(artifacts); });

describe("native app composition (controlled constructors)", () => {
  it("keeps default installation usable without inspecting runtime artifacts", async () => {
    const s = setup();
    expect(s.runtimeAdmitted()).toBe(false);
    expect(await s.owner.inspect(session)).toEqual({ status: "installed_stopped" });
    await expect(s.owner.prepare(session)).rejects.toMatchObject({ code: "private_runtime_not_qualified" });
    expect(fixtures.load).not.toHaveBeenCalled(); expect(fixtures.constructClock).not.toHaveBeenCalled();
    expect(fixtures.constructInstaller).toHaveBeenCalledTimes(1);
    expect(fixtures.constructInstaller.mock.calls[0][0]).toMatchObject({ executable: "electron", electronRunAsNode: true });
    await s.owner.close();
  });
  it("does not upgrade an install-only startup after the flag changes", async () => {
    const s = setup(); s.flags.runtime = true;
    expect(s.runtimeAdmitted()).toBe(false);
    await expect(s.owner.prepare(session)).rejects.toMatchObject({ code: "private_runtime_not_qualified" });
    expect(fixtures.load).not.toHaveBeenCalled(); await s.owner.close();
  });
  it("requires Home at startup as well as the runtime flag", async () => {
    const s = setup(true); s.flags.home = false;
    const other = createPrivateEnvironmentAppOwner(s.input); s.flags.home = true;
    expect(other.runtimeAdmitted()).toBe(false); await other.owner.close(); await s.owner.close();
  });
  it("uses one prepared host and its own installer with a frozen native directory", async () => {
    const s = setup(true); s.input.runtimeDirectory = "changed-after-startup";
    expect(s.runtimeAdmitted()).toBe(true);
    await s.owner.inspect(session); await s.owner.prepare(session); await s.owner.install(session);
    expect(fixtures.load).toHaveBeenCalledTimes(1); expect(fixtures.load).toHaveBeenCalledWith("native-directory");
    expect(fixtures.constructClock).toHaveBeenCalledTimes(1); expect(fixtures.constructInstaller).not.toHaveBeenCalled();
    expect(fixtures.constructClock.mock.calls[0][0]).toMatchObject({ userDataPath: "native-user-data", deviceId: "native-device", ...artifacts });
    expect(fixtures.installer.install).toHaveBeenCalledTimes(1);
    await s.owner.close(); expect(fixtures.clock.close).toHaveBeenCalledTimes(1);
  });
  it("rejects a missing directory with no installer or legacy fallback", async () => {
    const s = setup(true, "");
    await expect(s.owner.prepare(session)).rejects.toMatchObject({ code: "private_clock_runtime_directory_required" });
    expect(fixtures.load).not.toHaveBeenCalled(); expect(fixtures.constructClock).not.toHaveBeenCalled();
    expect(fixtures.constructInstaller).not.toHaveBeenCalled(); await s.owner.close();
  });
  it.each(["private_clock_runtime_inventory_invalid", "private_clock_runtime_artifact_changed", "private_clock_runtime_review_expired"])(
    "retains loader rejection %s without fallback", async code => {
      const s = setup(true); fixtures.load.mockImplementation(() => { throw new PrivateRuntimeArtifactError(code); });
      await expect(s.owner.prepare(session)).rejects.toMatchObject({ code });
      expect(fixtures.constructClock).not.toHaveBeenCalled(); expect(fixtures.constructInstaller).not.toHaveBeenCalled();
      await s.owner.close();
    });
  it("denies withdrawn admission before lazy construction", async () => {
    const s = setup(true); s.flags.runtime = false;
    expect(s.runtimeAdmitted()).toBe(false);
    await expect(s.owner.prepare(session)).rejects.toMatchObject({ code: "private_runtime_disabled" });
    expect(fixtures.load).not.toHaveBeenCalled(); await s.owner.stop(session); await s.owner.close();
  });
  it("passes current withdrawal into the host and preserves Stop/Close without account reads", async () => {
    const s = setup(true); await s.owner.prepare(session);
    const hostInput = fixtures.constructClock.mock.calls[0][0];
    expect(hostInput.runtimeEnabled()).toBe(true);
    s.flags.runtime = false; s.access.readAccount.mockRejectedValue(new Error("signed_out"));
    expect(s.runtimeAdmitted()).toBe(false); expect(hostInput.runtimeEnabled()).toBe(false);
    await s.owner.stop(session); await s.owner.close();
    expect(fixtures.clock.stop).toHaveBeenCalledTimes(1); expect(fixtures.clock.close).toHaveBeenCalledTimes(1);
    expect(s.access.readAccount).not.toHaveBeenCalled();
  });
});

describe("current-session private policy transport", () => {
  it("reads current minimal identity without requesting dashboard status", async () => {
    const payload = { session: { session_id: "account_session:fixture-12345678", status: "active",
      profile: { profile_id: "profile:fixture" }, account_policy: { account_type: "developer" } } };
    const fetch = vi.fn(async (_url: string, _options: RequestInit) => ({ ok: true, json: async () => payload }));
    const input = { origin: "http://127.0.0.1:43121", fetch };
    expect(await readPrivateEnvironmentAccount(input)).toEqual({ sessionId: payload.session.session_id, profileId: "profile:fixture", accountType: "developer" });
    expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:43121/api/account/session/private-environment-identity");
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include", cache: "no-store", redirect: "error" });
    fetch.mockResolvedValueOnce({ ok: false, json: async () => payload });
    await expect(readPrivateEnvironmentAccount(input)).rejects.toMatchObject({ code: "private_environment_account_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([null, { session: { status: "revoked" } }, { session: { session_id: "account_session:fixture-12345678", status: "active",
    profile: { profile_id: "profile:fixture" }, account_policy: { account_type: "user" } } }])("denies invalid/non-developer identity %s", async payload => {
    await expect(readPrivateEnvironmentAccount({ origin: "http://127.0.0.1:43121", fetch: async () => ({ ok: true, json: async () => payload }) }))
      .rejects.toMatchObject({ code: "private_environment_account_unavailable" });
  });
  it.each(["install", "runtime"] as const)("uses the fixed %s path and bounded session fetch", async kind => {
    const json = vi.fn(async () => ({ current: kind })), fetch = vi.fn(async () => ({ ok: true, json }));
    expect(await readPrivateEnvironmentPolicy({ origin: "http://127.0.0.1:43121", kind, fetch })).toEqual({ current: kind });
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:43121/api/agi/environment-connectors/private/${kind === "install" ? "install-policy" : "clock-runtime-policy"}`);
    expect(options).toMatchObject({ method: "GET", cache: "no-store", credentials: "include", redirect: "error", headers: { Accept: "application/json" } });
    expect(options.signal).toBeInstanceOf(AbortSignal); expect(options.signal!.aborted).toBe(false);
  });
  it.each(["https://remote.example", "http://localhost:43121", "http://127.0.0.1:43121/other", "http://user:secret@127.0.0.1:43121", "http://127.0.0.1:43121?redirect=external"])(
    "rejects non-canonical origin %s before transport", async origin => {
      const fetch = vi.fn(); await expect(readPrivateEnvironmentPolicy({ origin, kind: "runtime", fetch }))
        .rejects.toMatchObject({ code: "private_clock_runtime_policy_unavailable" });
      expect(fetch).not.toHaveBeenCalled();
    });
  it.each(["http", "transport", "json"])("sanitizes %s failure", async failure => {
    const json = vi.fn(async () => { throw new Error("private response body"); });
    const fetch = vi.fn(async () => { if (failure === "transport") throw new Error("private URL"); return { ok: failure !== "http", json }; });
    await expect(readPrivateEnvironmentPolicy({ origin: "http://127.0.0.1:43121", kind: "install", fetch }))
      .rejects.toMatchObject({ message: "private_environment_install_policy_unavailable" });
    if (failure === "http") expect(json).not.toHaveBeenCalled();
  });
  it("does not reuse another session's response", async () => {
    const a = vi.fn(async () => ({ ok: true, json: async () => ({ session: "a" }) }));
    const b = vi.fn(async () => ({ ok: true, json: async () => ({ session: "b" }) }));
    const input = { origin: "http://127.0.0.1:43121", kind: "runtime" as const };
    expect(await readPrivateEnvironmentPolicy({ ...input, fetch: a })).toEqual({ session: "a" });
    expect(await readPrivateEnvironmentPolicy({ ...input, fetch: b })).toEqual({ session: "b" });
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
  });
});
