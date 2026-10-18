import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrivateEnvironmentDesktopOwner } from "../apps/desktop/src/environment-private-desktop-owner";
import { PrivateEnvironmentLifecycle } from "../apps/desktop/src/environment-private-lifecycle";
import { NativePrivateClockHost } from "../apps/desktop/src/environment-private-clock-host";
import { loadPrivatePreparedClockRuntimeArtifacts } from "../apps/desktop/src/environment-private-runtime-artifacts";
import { WindowsPreparedClockSession } from "../apps/desktop/src/environment-clock-prepared-runner";
import preparedReview from "../apps/desktop/environment-packages/system-clock/reviewed-prepared-runtime.json";
import { PRIVATE_CLOCK_INSTALL_REVIEW as review, PRIVATE_INSTALL_DIRECTORY_REVISION } from "../shared/environment-private-install";
import { PRIVATE_CLOCK_RUNTIME_PROFILE, PRIVATE_CLOCK_RUNTIME_REVISION } from "../shared/environment-private-runtime";

const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const a = Object.freeze({ id: "a" }), b = Object.freeze({ id: "b" });
type TestSession = typeof a | typeof b;
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error: any) { if (error.code === "ESRCH") return false; throw error; } };
const request = () => { const now = Date.now(); return { schema: "helix.environment_connector.probe_request.v1",
  probe_request_id: `probe:${randomUUID()}`, capability_id: "com.casimirbot.system.clock.read", capability_version: 1,
  catalog_snapshot_id: "catalog:desktop-owner", arguments: { clock: "monotonic" },
  constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
  created_at: new Date(now).toISOString(), deadline_at: new Date(now + 5000).toISOString(), assistant_answer: false, raw_content_included: false }; };
let root: string, output: string, artifacts: ReturnType<typeof loadPrivatePreparedClockRuntimeArtifacts>;
const owners: PrivateEnvironmentDesktopOwner<TestSession>[] = [];
const results: Record<string, unknown>[] = [];
const fixture = async () => {
  const accounts = new Map([a, b].map(session => [session, { profileId: `profile:desktop-clock-${session.id}`,
    sessionId: `account_session:desktop-clock-${session.id}-1234`, accountType: "developer" as const }]));
  const deviceId = `desktop_device_${"d".repeat(22)}`;
  const readers = new Map([a, b].map(session => {
    const identity = () => ({ profile_id: accounts.get(session)!.profileId, device_id: deviceId,
      session_ref: createHash("sha256").update(accounts.get(session)!.sessionId).digest("hex"), artifact_sha256: review.archiveSha256,
      review_revision: review.policyRevision, credential_included: false, public_release: false });
    return [session, { featureEnabled: () => true, readAccount: vi.fn(async () => ({ ...accounts.get(session)! })),
      readPolicy: vi.fn(async () => ({ ...identity(), schema: "casimirbot.private_environment_install_policy.v1",
        policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION, expires_at: review.expiresAt, install_allowed: true, runtime_allowed: false })),
      readRuntimePolicy: vi.fn(async () => { const now = Date.now(); return { ...identity(), schema: "casimirbot.private_clock_runtime_policy.v1",
        policy_revision: PRIVATE_CLOCK_RUNTIME_REVISION, issued_at: new Date(now).toISOString(), expires_at: new Date(now + 30000).toISOString(),
        runtime_profile: PRIVATE_CLOCK_RUNTIME_PROFILE, capability_id: "com.casimirbot.system.clock.read", runtime_allowed: true, hosted_required: false, model_invoked: false }; }),
      selectArchive: async () => path.resolve(".tmp/g16a-clock-package-20260926/clock.tgz") }];
  }));
  let host!: NativePrivateClockHost, constructions = 0;
  const owner = new PrivateEnvironmentDesktopOwner<TestSession>({ accessForSession: session => readers.get(session)!,
    createOwner: access => {
      constructions++; host = new NativePrivateClockHost({ userDataPath: root, deviceId,
        runtime: artifacts.runtime, preparedHelper: artifacts.preparedHelper, runtimeEnabled: () => true, ...access });
      return { installer: host.installer, clock: host };
    } });
  owners.push(owner);
  const installed = await owner.install(a); expect(installed.status).toBe("installed_stopped");
  return { owner, host, installed, readers, accounts, constructions: () => constructions };
};

describe.skipIf(process.platform !== "win32" || process.arch !== "x64")("real desktop owner and prepared clock", () => {
  beforeAll(() => {
    const custody = JSON.parse(fs.readFileSync("docs/evidence/eh-g8-codex-first-paid-product-delivery-v1/launch-program/2026-09-26-g16a-prepared-artifact-custody.json", "utf8").replace(/^\uFEFF/, ""));
    artifacts = loadPrivatePreparedClockRuntimeArtifacts(custody.bundle.root);
    for (const [name, expected] of Object.entries(preparedReview.sourceSha256)) expect(sha(path.join("apps/desktop/native", name))).toBe(expected);
    root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "g16a-desktop-clock-"));
    output = fs.mkdtempSync(path.join(fs.realpathSync(".tmp"), "g16a-desktop-clock-"));
    const sources = ["apps/desktop/src/environment-private-desktop-owner.ts", "apps/desktop/src/environment-private-clock-host.ts",
      "apps/desktop/src/environment-clock-prepared-runner.ts", "apps/desktop/src/environment-private-runtime-artifacts.ts",
      "tests/desktop-environment-desktop-clock.spec.ts"];
    fs.writeFileSync(path.join(output, "build.json"), JSON.stringify({ root, artifacts,
      sourceSha256: Object.fromEntries(sources.map(file => [file, sha(file)])) }, null, 2));
    fs.writeFileSync(".tmp/g16a-desktop-clock-build-path.txt", path.join(output, "build.json"));
  });
  afterEach(async () => { vi.restoreAllMocks(); for (const owner of owners.splice(0)) await owner.close(); });
  afterAll(() => { if (output) fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); });

  it("observes through session dispatch and preserves non-fresh history and duplicate denial", async () => {
    const s = await fixture(), run = vi.spyOn(WindowsPreparedClockSession.prototype, "run");
    const at = Date.now(), ready = await s.owner.prepare(a), preparationMs = Date.now() - at, pid = s.host.status().pid!;
    expect(ready.installationRef).toBe(s.installed.installationRef); expect(alive(pid)).toBe(true);
    const value = request(), start = Date.now(), receipt = await s.owner.observe(a, value), observationMs = Date.now() - start;
    expect(receipt.result.probe_request_id).toBe(value.probe_request_id); expect(alive(pid)).toBe(false);
    expect(await s.owner.recoverObservation(a, value)).toEqual({ state: "accepted", fresh: false, receipt });
    await s.owner.prepare(a); await expect(s.owner.observe(a, value)).rejects.toMatchObject({ code: "clock_request_already_recorded" });
    expect(run).toHaveBeenCalledTimes(1); expect(s.constructions()).toBe(1);
    expect(s.readers.get(b)!.readAccount).not.toHaveBeenCalled();
    await s.owner.stop(a);
    results.push({ name: "observation and durable history", preparationMs, observationMs, childAbsent: true,
      runnerCalls: run.mock.calls.length, constructions: s.constructions(), receipt });
  }, 30000);

  it("denies a foreign desktop session and replaced account before execution", async () => {
    const s = await fixture(), run = vi.spyOn(WindowsPreparedClockSession.prototype, "run"); await s.owner.prepare(a);
    const pid = s.host.status().pid!;
    for (const call of [() => s.owner.install(b), () => s.owner.observe(b, request()), () => s.owner.stop(b)])
      await expect(call()).rejects.toMatchObject({ code: "private_environment_session_mismatch" });
    expect(s.readers.get(b)!.readAccount).not.toHaveBeenCalled(); expect(alive(pid)).toBe(true);
    s.accounts.get(a)!.sessionId = "account_session:replacement-in-same-desktop-session";
    await expect(s.owner.observe(a, request())).rejects.toMatchObject({ code: "clock_admission_or_execution_failed" });
    expect(run).not.toHaveBeenCalled(); expect(alive(pid)).toBe(false);
    await s.owner.stop(a); expect((await s.owner.inspect(b)).status).toBe("not_installed");
    results.push({ name: "foreign session and changed sign-in", deniedBeforeRunner: true, childAbsent: true, foreignInstallationAbsent: true });
  }, 20000);

  it("Stop cleans the actual idle child when account reads are unavailable", async () => {
    const s = await fixture(); await s.owner.prepare(a); const pid = s.host.status().pid!;
    const reads = s.readers.get(a)!.readAccount.mock.calls.length;
    s.readers.get(a)!.readAccount.mockRejectedValue(new Error("signed_out"));
    await s.owner.stop(a); expect(alive(pid)).toBe(false);
    expect(s.readers.get(a)!.readAccount).toHaveBeenCalledTimes(reads);
    expect(s.host.status()).toMatchObject({ ready: false, running: false, fenced: false });
    results.push({ name: "Stop without account access", noAdditionalAccountRead: true, childAbsent: true });
  }, 20000);

  it("the same native installer stops prepared execution before reinstalling", async () => {
    const s = await fixture(); await s.owner.prepare(a); const pid = s.host.status().pid!;
    expect((await s.owner.install(a)).status).toBe("installed_stopped");
    expect(alive(pid)).toBe(false); expect(s.host.status()).toMatchObject({ ready: false, fenced: false });
    expect(s.constructions()).toBe(1);
    await expect(s.owner.observe(a, request())).rejects.toMatchObject({ code: "clock_preparation_required" });
    results.push({ name: "shared installation fence", childAbsent: true, constructions: s.constructions(), requiresNewPreparation: true });
  }, 20000);

  it("native Close awaits idle-child cleanup without account access and permanently closes dispatch", async () => {
    const s = await fixture(); await s.owner.prepare(a); const pid = s.host.status().pid!;
    s.readers.get(a)!.readAccount.mockRejectedValue(new Error("signed_out"));
    const reads = s.readers.get(a)!.readAccount.mock.calls.length;
    await s.owner.close(); expect(alive(pid)).toBe(false); expect(s.readers.get(a)!.readAccount).toHaveBeenCalledTimes(reads);
    await expect(s.owner.prepare(a)).rejects.toMatchObject({ code: "private_environment_closed" });
    expect(s.host.status()).toMatchObject({ ready: false, running: false, fenced: false });
    results.push({ name: "native Close", childAbsent: true, noAdditionalAccountRead: true, dispatcherClosed: true });
  }, 20000);

  it("lifecycle events revoke the actual child without account reads", async () => {
    const s = await fixture(); await s.owner.prepare(a); const pid = s.host.status().pid!, reads = s.readers.get(a)!.readAccount.mock.calls.length;
    const recordFailure = vi.fn(), lifecycle = new PrivateEnvironmentLifecycle<TestSession>({ owner: () => s.owner,
      beginQuit: () => {}, resumeQuit: () => {}, recordFailure });
    s.readers.get(a)!.readAccount.mockRejectedValue(new Error("signed_out"));
    expect(await lifecycle.invalidate(a)).toEqual({ stopped: true });
    expect(alive(pid)).toBe(false); expect(s.readers.get(a)!.readAccount).toHaveBeenCalledTimes(reads);
    expect(recordFailure).not.toHaveBeenCalled();
    results.push({ name: "lifecycle event revocation", childAbsent: true, noAdditionalAccountRead: true });
  }, 20000);

  it("lifecycle events resume quit only after actual child cleanup", async () => {
    const s = await fixture(); await s.owner.prepare(a); const pid = s.host.status().pid!;
    let resumed!: () => void; const done = new Promise<void>(resolve => { resumed = resolve; });
    let childAliveAtResume: boolean | undefined;
    const recordFailure = vi.fn(), lifecycle = new PrivateEnvironmentLifecycle<TestSession>({ owner: () => s.owner,
      beginQuit: () => {}, resumeQuit: () => { childAliveAtResume = alive(pid); resumed(); }, recordFailure });
    const preventDefault = vi.fn(); expect(lifecycle.beforeQuit({ preventDefault })).toBe(false);
    expect(lifecycle.beforeQuit({ preventDefault })).toBe(false); await done;
    expect(childAliveAtResume).toBe(false); expect(lifecycle.status().quit).toBe("clean");
    expect(recordFailure).not.toHaveBeenCalled(); expect(lifecycle.beforeQuit({ preventDefault })).toBe(true);
    results.push({ name: "lifecycle quit ordering", childAbsentBeforeResume: true, clean: true });
  }, 20000);
});
