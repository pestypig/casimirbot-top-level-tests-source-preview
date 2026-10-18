import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NativePrivateClockHost } from "../apps/desktop/src/environment-private-clock-host";
import { WindowsPreparedClockSession } from "../apps/desktop/src/environment-clock-prepared-runner";
import { WindowsClockNativeRunner } from "../apps/desktop/src/environment-clock-native-runner";
import { PRIVATE_CLOCK_INSTALL_REVIEW as review, PRIVATE_INSTALL_DIRECTORY_REVISION } from "../shared/environment-private-install";
import { PRIVATE_CLOCK_RUNTIME_PROFILE, PRIVATE_CLOCK_RUNTIME_REVISION } from "../shared/environment-private-runtime";

const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
let root: string, output: string;
let native: ConstructorParameters<typeof NativePrivateClockHost>[0]["runtime"], helper: { path: string; sha256: string };
const hosts: NativePrivateClockHost[] = [];
const request = () => { const now = Date.now(); return { schema: "helix.environment_connector.probe_request.v1",
  probe_request_id: `probe:${randomUUID()}`, capability_id: "com.casimirbot.system.clock.read", capability_version: 1,
  catalog_snapshot_id: "catalog:prepared-host", arguments: { clock: "monotonic" },
  constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
  created_at: new Date(now).toISOString(), deadline_at: new Date(now + 5000).toISOString(), assistant_answer: false, raw_content_included: false }; };
const fixture = async (prepared = true) => {
  const account = { profileId: "profile:prepared-host", sessionId: "account_session:prepared-host-1234", accountType: "developer" as const };
  const deviceId = `desktop_device_${"p".repeat(22)}`;
  const identity = () => ({ profile_id: account.profileId, device_id: deviceId,
    session_ref: createHash("sha256").update(account.sessionId).digest("hex"), artifact_sha256: review.archiveSha256,
    review_revision: review.policyRevision, credential_included: false, public_release: false });
  const policy = () => ({ ...identity(), schema: "casimirbot.private_environment_install_policy.v1",
    policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION, expires_at: review.expiresAt, install_allowed: true, runtime_allowed: false });
  const runtimePolicy = () => { const now = Date.now(); return { ...identity(), schema: "casimirbot.private_clock_runtime_policy.v1",
    policy_revision: PRIVATE_CLOCK_RUNTIME_REVISION, issued_at: new Date(now).toISOString(), expires_at: new Date(now + 30000).toISOString(),
    runtime_profile: PRIVATE_CLOCK_RUNTIME_PROFILE, capability_id: "com.casimirbot.system.clock.read", runtime_allowed: true, hosted_required: false, model_invoked: false }; };
  const input = { userDataPath: root, deviceId, runtime: native, preparedHelper: prepared ? helper : undefined,
    featureEnabled: () => true, runtimeEnabled: () => true, readAccount: vi.fn(async () => ({ ...account })),
    readPolicy: vi.fn(async (): Promise<unknown> => policy()), readRuntimePolicy: vi.fn(async (): Promise<unknown> => runtimePolicy()),
    selectArchive: async () => path.resolve(".tmp/g16a-clock-package-20260926/clock.tgz") };
  const host = new NativePrivateClockHost(input); hosts.push(host);
  const installed = await host.installer.install(); expect(installed.status).toBe("installed_stopped");
  return { host, input, account, runtimePolicy, installed };
};
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error: any) { if (error.code === "ESRCH") return false; throw error; } };

describe.skipIf(process.platform !== "win32")("prepared account host", () => {
  beforeAll(() => {
    const evidence = JSON.parse(fs.readFileSync("docs/evidence/eh-g8-codex-first-paid-product-delivery-v1/launch-program/2026-09-26-g16a-prepared-native-transport.json", "utf8"));
    for (const [source, expected] of Object.entries(evidence.sourceHashes)) expect(sha(source)).toBe(expected);
    expect(sha(evidence.helper)).toBe(evidence.helperSha256);
    const nativeReview = JSON.parse(fs.readFileSync("apps/desktop/environment-packages/system-clock/reviewed-native-runtime.json", "utf8"));
    native = { executable: path.resolve(".tmp/g16a-private-clock-runtime-20260926/node.exe"), sha256: nativeReview.files["node.exe"].sha256,
      helperPath: path.resolve(".tmp/g16a-private-clock-runtime-20260926/clock-bridge.exe"), helperSha256: nativeReview.files["clock-bridge.exe"].sha256 };
    expect(sha(native.executable)).toBe(native.sha256); expect(sha(native.helperPath)).toBe(native.helperSha256);
    root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "g16a-prepared-host-"));
    output = fs.mkdtempSync(path.join(fs.realpathSync(".tmp"), "g16a-prepared-host-"));
    fs.copyFileSync(evidence.helper, path.join(output, "prepared-helper.exe"));
    helper = { path: path.join(output, "prepared-helper.exe"), sha256: evidence.helperSha256 };
    fs.writeFileSync(path.join(output, "build.json"), JSON.stringify({ root, native, helper,
      hostSha256: sha("apps/desktop/src/environment-private-clock-host.ts"), runnerSha256: sha("apps/desktop/src/environment-clock-prepared-runner.ts"),
      testsSha256: sha("tests/desktop-environment-clock-prepared-host.spec.ts") }, null, 2));
    fs.writeFileSync(".tmp/g16a-prepared-host-build-path.txt", path.join(output, "build.json"));
  });
  afterEach(async () => { vi.restoreAllMocks(); for (const host of hosts.splice(0)) await host.close(); });

  it("requires preparation, binds the installed record, observes and recovers without replay", async () => {
    const s = await fixture(), run = vi.spyOn(WindowsPreparedClockSession.prototype, "run");
    await expect(s.host.observe(request())).rejects.toMatchObject({ code: "clock_preparation_required" });
    const started = Date.now(), ready = await s.host.prepare(), preparationMs = Date.now() - started;
    expect(ready.installationRef).toBe(s.installed.installationRef); expect(s.host.status()).toMatchObject({ ready: true, preparing: false });
    s.input.readRuntimePolicy.mockClear(); const value = request(), at = Date.now(), receipt = await s.host.observe(value), observationMs = Date.now() - at;
    expect(receipt.result.probe_request_id).toBe(value.probe_request_id); expect(s.input.readRuntimePolicy).toHaveBeenCalledTimes(4);
    expect(await s.host.recoverObservation(value)).toEqual({ state: "accepted", fresh: false, receipt });
    await s.host.prepare(); await expect(s.host.observe(value)).rejects.toMatchObject({ code: "clock_request_already_recorded" });
    expect(run).toHaveBeenCalledTimes(1); expect(s.host.status()).toMatchObject({ ready: false, running: false, fenced: false });
    fs.writeFileSync(path.join(output, "observation.json"), JSON.stringify({ preparationMs, observationMs, receipt, runnerCalls: run.mock.calls.length }));
  }, 25000);

  it("rejects replacement sign-in even for the same profile and cleans idle readiness", async () => {
    const s = await fixture(), run = vi.spyOn(WindowsPreparedClockSession.prototype, "run"); await s.host.prepare(); const pid = s.host.status().pid!;
    s.account.sessionId = "account_session:replacement-1234";
    await expect(s.host.observe(request())).rejects.toMatchObject({ code: "clock_admission_or_execution_failed" });
    expect(run).not.toHaveBeenCalled(); expect(alive(pid)).toBe(false); expect(s.host.status().ready).toBe(false);
  }, 20000);

  it("stops an idle prepared process after account reads become unavailable", async () => {
    const s = await fixture(); await s.host.prepare(); const pid = s.host.status().pid!, reads = s.input.readAccount.mock.calls.length;
    s.input.readAccount.mockImplementation(async () => { throw Error("signed out"); });
    await s.host.stop(); expect(s.input.readAccount).toHaveBeenCalledTimes(reads); expect(alive(pid)).toBe(false);
    expect(s.host.status()).toMatchObject({ ready: false, preparing: false, fenced: false });
  }, 20000);

  it("stops preparation while admission is pending and rejects its later callback", async () => {
    const s = await fixture(), gate = deferred(), entered = deferred(), nativePrepare = vi.spyOn(WindowsPreparedClockSession, "prepare");
    s.input.readRuntimePolicy.mockImplementationOnce(async () => { entered.resolve(); await gate.promise; return s.runtimePolicy(); });
    const preparing = s.host.prepare(), rejection = expect(preparing).rejects.toMatchObject({ code: "clock_stopped" });
    await entered.promise; await s.host.stop(); await rejection; gate.resolve(); await Promise.resolve();
    expect(nativePrepare).not.toHaveBeenCalled(); expect(s.host.status()).toMatchObject({ ready: false, preparing: false, pid: undefined });
  }, 20000);

  it("fences new preparation until an installer has stopped idle readiness", async () => {
    const s = await fixture(); await s.host.prepare(); const pid = s.host.status().pid!, gate = deferred(), entered = deferred();
    const original = WindowsPreparedClockSession.prototype.stop;
    vi.spyOn(WindowsPreparedClockSession.prototype, "stop").mockImplementation(async function (this: WindowsPreparedClockSession) {
      await original.call(this); entered.resolve(); await gate.promise;
    });
    const installing = s.host.installer.install();
    try { await entered.promise; expect(alive(pid)).toBe(false); expect(s.host.status().fenced).toBe(true);
      await expect(s.host.prepare()).rejects.toMatchObject({ code: "clock_fenced" });
    } finally { gate.resolve(); }
    expect((await installing).status).toBe("installed_stopped"); expect(s.host.status()).toMatchObject({ fenced: false, ready: false });
    await expect(s.host.observe(request())).rejects.toMatchObject({ code: "clock_preparation_required" });
  }, 20000);

  it("does not refresh an expired observation deadline after preparing", async () => {
    const s = await fixture(), run = vi.spyOn(WindowsPreparedClockSession.prototype, "run"); await s.host.prepare(); const pid = s.host.status().pid!;
    const value = request(); value.created_at = new Date(Date.now() - 2000).toISOString(); value.deadline_at = new Date(Date.now() - 1000).toISOString();
    await expect(s.host.observe(value)).rejects.toMatchObject({ code: "clock_deadline_expired" });
    expect(run).not.toHaveBeenCalled(); expect(alive(pid)).toBe(false);
  }, 20000);

  it("rechecks runtime policy before GO and rejects withdrawal", async () => {
    const s = await fixture(); await s.host.prepare(); const pid = s.host.status().pid!; s.input.readRuntimePolicy.mockClear();
    s.input.readRuntimePolicy.mockImplementation(async () => { if (s.input.readRuntimePolicy.mock.calls.length === 3) throw Error("withdrawn"); return s.runtimePolicy(); });
    await expect(s.host.observe(request())).rejects.toMatchObject({ code: "clock_admission_or_execution_failed" });
    expect(s.input.readRuntimePolicy).toHaveBeenCalledTimes(3); expect(alive(pid)).toBe(false); expect(s.host.status().fenced).toBe(false);
  }, 20000);

  it("does not publish readiness when identity changes during preparation", async () => {
    const s = await fixture();
    s.input.readRuntimePolicy.mockImplementation(async () => {
      if (s.input.readRuntimePolicy.mock.calls.length === 2) s.account.sessionId = "account_session:changed-during-preparation";
      return s.runtimePolicy();
    });
    await expect(s.host.prepare()).rejects.toMatchObject({ code: "clock_admission_or_execution_failed" });
    expect(s.host.status()).toMatchObject({ ready: false, preparing: false, running: false, fenced: false, pid: undefined });
  }, 20000);

  it("retains request-first admission cancellation when no prepared helper is configured", async () => {
    const s = await fixture(false), gate = deferred(), entered = deferred(), run = vi.spyOn(WindowsClockNativeRunner.prototype, "run");
    await expect(s.host.prepare()).rejects.toMatchObject({ code: "clock_preparation_unavailable" });
    s.input.readRuntimePolicy.mockImplementationOnce(async () => { entered.resolve(); await gate.promise; return s.runtimePolicy(); });
    const observing = s.host.observe(request()), rejected = expect(observing).rejects.toMatchObject({ code: "clock_stopped" });
    await entered.promise; await s.host.stop(); await rejected; gate.resolve(); await Promise.resolve();
    expect(run).not.toHaveBeenCalled(); expect(s.host.status()).toMatchObject({ admissionPending: false, running: false, fenced: false });
  }, 20000);

  it("retains the host and installation fence after actual recovery-pin failure", async () => {
    const s = await fixture(); await s.host.prepare(); const pid = s.host.status().pid!;
    const bytes = fs.readFileSync(helper.path);
    const files = (folder: string): string[] => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(folder, entry.name); return entry.isDirectory() ? files(file) : [file];
    });
    const before = await s.host.installer.inspect();
    try {
      fs.renameSync(helper.path, helper.path + ".running"); fs.writeFileSync(helper.path, Buffer.from("invalid recovery helper"));
      await expect(s.host.stop()).rejects.toMatchObject({ code: "clock_stop_unconfirmed" });
      expect(alive(pid)).toBe(false); expect(s.host.status().fenced).toBe(true);
      await expect(s.host.prepare()).rejects.toMatchObject({ code: "clock_fenced" });
      await expect(s.host.observe(request())).rejects.toMatchObject({ code: "clock_fenced" });
      expect((await s.host.installer.install()).status).toBe("unavailable");
      expect(await s.host.installer.inspect()).toEqual(before);
      await expect(s.host.close()).rejects.toMatchObject({ code: "clock_stop_unconfirmed" });
      await expect(s.host.stop()).rejects.toMatchObject({ code: "clock_stop_unconfirmed" });
      fs.writeFileSync(path.join(output, "cleanup-failure.json"), JSON.stringify({ childAbsent: true, hostFenced: true,
        preparationDenied: true, observationDenied: true, installationDenied: true, installedRecordUnchanged: true, closeDenied: true }));
    } finally {
      fs.writeFileSync(helper.path, bytes);
      // The production host remains fenced. Reconcile only this test-owned
      // lease explicitly; do not reset private fields or claim host recovery.
      const leases = files(path.join(root, "clock-runtime")).filter(file => path.basename(file) === "clock-isolation.journal");
      expect(leases).toHaveLength(1);
      const recovered = spawnSync(helper.path, ["recover", path.dirname(leases[0]), native.sha256, review.files["clock.cjs"], String(process.pid)],
        { shell: false, windowsHide: true, encoding: "utf8", timeout: 12000, env: { SystemRoot: process.env.SystemRoot,
          USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA,
          TEMP: path.dirname(leases[0]), TMP: path.dirname(leases[0]) } });
      expect(recovered.status, recovered.stderr).toBe(0);
      expect(fs.readFileSync(leases[0], "utf8").split("\n")[3]).toBe("cleaned");
      hosts.splice(hosts.indexOf(s.host), 1); // Deliberately fenced registry dies with this isolated test worker.
    }
  }, 25000);
});
