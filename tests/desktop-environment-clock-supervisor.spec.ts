import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTarGzip } from "../scripts/environment-packages/tar-archive.mjs";
import { packageHash, type ReviewedEnvironmentPackage } from "../apps/desktop/src/environment-package-archive";
import { EnvironmentPackageInstallationStore } from "../apps/desktop/src/environment-package-installation";
import { EnvironmentClockSupervisor } from "../apps/desktop/src/environment-clock-supervisor";
import { EnvironmentClockObservationJournal } from "../apps/desktop/src/environment-clock-observation-journal";
import { HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA, HELIX_SYSTEM_CLOCK_READ_CAPABILITY } from "../shared/helix-environment-connector";

const owner = { profileId: "profile:clock-owner", deviceId: "desktop_device_clock" };
const fixtureNow = new Date("2026-09-26T12:00:00.000Z");
const request = (duration = 5000) => ({ schema: HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA,
  probe_request_id: "probe:supervised-clock", capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY,
  capability_version: 1, catalog_snapshot_id: "catalog:clock", arguments: { clock: "monotonic" },
  constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: duration },
  created_at: fixtureNow.toISOString(), deadline_at: new Date(fixtureNow.getTime() + duration).toISOString(),
  assistant_answer: false, raw_content_included: false });
const roots: string[] = [], supervisors: EnvironmentClockSupervisor[] = [];
afterEach(async () => {
  for (const supervisor of supervisors.splice(0)) await supervisor.stop(owner);
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("casimirbot-clock-test-")) throw new Error("cleanup_scope_invalid");
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
const body = (mode = "success") => `
let input = ''; process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
 const request = JSON.parse(input), mode = ${JSON.stringify(mode)};
 // Windows supplies basic OS variables even when the explicit child map is
 // minimal. Arbitrary parent/service variables must not cross this boundary.
 if (process.env.G16A_CANARY || process.env.NODE_OPTIONS) throw Error('environment_leaked');
 if (mode === 'hang') { setInterval(() => {}, 1000); return; }
 if (mode === 'stdout') { process.stdout.write('x'.repeat(70000)); return; }
 if (mode === 'stderr') { process.stderr.write('x'.repeat(5000)); return; }
 if (mode === 'invalid') { process.stdout.write('{}'); return; }
 if (mode === 'exit') { process.exit(3); }
 const result = {schema:${JSON.stringify(HELIX_ENVIRONMENT_PROBE_RESULT_V1_SCHEMA)}, probe_request_id: request.probe_request_id,
 capability_id:request.capability_id, capability_version:1, outcome:'succeeded',summary:'clock fixture',
 result:{uptime_ms:Math.floor(process.uptime()*1000)},side_effects_performed:false, commands_executed:[],
 environment_mutation_performed:false, deterministic:true,model_invoked:false,assistant_answer:false,
 raw_content_included:false,created_at:new Date().toISOString()};
 if (mode === 'wrong') result.probe_request_id = 'probe:wrong';
 process.stdout.write(JSON.stringify(result));
});`;
const artifact = (root: string, mode = "success") => {
  const files = { "clock.cjs": Buffer.from(body(mode)), LICENSE: Buffer.from("private test"), "THIRD_PARTY_NOTICES.txt": Buffer.from("fixture") };
  const archive = createTarGzip(Object.entries(files).map(([name, bytes]) => ({name, bytes})));
  const review: ReviewedEnvironmentPackage = { schema: "casimirbot.environment_package_review.v1", packageId: "com.casimirbot.system.clock",
    version: "1.0.0", publisher: "publisher:casimirbot", archiveSha256: packageHash(archive),
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, packageHash(bytes)])), entryPoint: "clock.cjs",
    policyRevision: "private-supervisor-fixture", expiresAt: "2026-10-01T00:00:00.000Z", platforms: [process.platform], minNodeMajor:24, privateOnly:true };
  const archivePath = path.join(root, `${review.archiveSha256}.tgz`); fs.writeFileSync(archivePath, archive);
  return {review, archivePath};
};
const setup = async (mode = "success", realDirectory?: string, durable = false) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "casimirbot-clock-test-")); roots.push(root);
  const f = realDirectory ? {
    review: JSON.parse(fs.readFileSync("apps/desktop/environment-packages/system-clock/reviewed-private.json", "utf8")) as ReviewedEnvironmentPackage,
    archivePath: path.join(realDirectory, "clock.tgz"),
  } : artifact(root, mode);
  const authorize = vi.fn(async () => {}), installAuthorize = vi.fn(async () => {});
  let supervisor!: EnvironmentClockSupervisor;
  const store = new EnvironmentPackageInstallationStore({ userDataPath: root, authorize: installAuthorize,
    stopAndFence: (who, packageId) => supervisor.acquireMutationFence(who, packageId), now: () => fixtureNow });
  const resolveEntry = vi.fn((who, review) => store.resolveNativeEntry(who, review));
  const journal = durable ? new EnvironmentClockObservationJournal(root) : undefined;
  supervisor = new EnvironmentClockSupervisor({ executable: process.execPath, review: f.review, resolveEntry, authorize,
    observationJournal: journal, now: () => fixtureNow });
  supervisors.push(supervisor);
  const installed = await store.install(owner, f.review, f.archivePath);
  return {root, ...f, store, supervisor, authorize, installAuthorize, resolveEntry, installed, journal};
};
const waitForPid = async (supervisor: EnvironmentClockSupervisor) => {
  const end = Date.now() + 2500;
  while (!supervisor.status(owner).pid && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
  const pid = supervisor.status(owner).pid;
  if (!pid) throw Error("clock_child_not_started"); return pid;
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

describe("private native clock supervision", () => {
  it("executes verified installed bytes with no inherited service environment", async () => {
    const s = await setup(); vi.stubEnv("G16A_CANARY", "not-a-secret-test-value");
    const result = await s.supervisor.observe(owner, request());
    expect(result.installationRef).toBe(s.installed.installationRef);
    expect(result.result.result.uptime_ms).toBeGreaterThanOrEqual(0);
    expect(s.authorize.mock.calls.map(call => call[1])).toEqual(["execute", "accept"]);
    expect(s.supervisor.status(owner)).toMatchObject({ running: false, fenced: false });
  });
  it.each([["stdout", "clock_output_limit"], ["stderr", "clock_output_limit"], ["invalid", "clock_result_invalid"],
    ["wrong", "clock_result_mismatch"], ["exit", "clock_process_failed"]])("rejects %s child output", async (mode, code) => {
    const s = await setup(mode);
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow(code);
    expect(s.authorize).toHaveBeenCalledTimes(1);
    expect(s.supervisor.status(owner).running).toBe(false);
  });
  it("times out a real child and confirms it has exited", async () => {
    const s = await setup("hang");
    const result = s.supervisor.observe(owner, request(500)).catch(error => error);
    const pid = await waitForPid(s.supervisor);
    expect((await result).code).toBe("clock_deadline_expired");
    expect(() => process.kill(pid, 0)).toThrow();
  });
  it("stops a real child before returning an update fence, and denies new starts until release", async () => {
    const s = await setup("hang");
    const result = s.supervisor.observe(owner, request()).catch(error => error);
    const pid = await waitForPid(s.supervisor);
    const release = await s.supervisor.acquireMutationFence(owner, s.review.packageId);
    expect((await result).code).toBe("clock_stopped");
    expect(() => process.kill(pid, 0)).toThrow();
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_fenced");
    await s.supervisor.stop(owner); // Stop remains available but cannot release the update's fence.
    expect(s.supervisor.status(owner).fenced).toBe(true);
    release(); release(); expect(s.supervisor.status(owner).fenced).toBe(false);
  });
  it("prevents concurrent same-owner execution without affecting another owner's slot", async () => {
    const s = await setup("hang");
    const result = s.supervisor.observe(owner, request()).catch(error => error);
    await waitForPid(s.supervisor);
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_busy");
    const other = { ...owner, profileId: "profile:other" };
    expect(s.supervisor.status(other).running).toBe(false);
    await expect(s.supervisor.observe(other, request())).rejects.toThrow("clock_admission_or_execution_failed");
    await s.supervisor.stop(owner); expect((await result).code).toBe("clock_stopped");
  });
  it("stops a pending policy lookup without waiting for an unavailable service", async () => {
    const s = await setup(), reached = deferred(), waiting = deferred();
    s.authorize.mockImplementationOnce(async () => { reached.resolve(); await waiting.promise; });
    const result = s.supervisor.observe(owner, request()).catch(error => error); await reached.promise;
    await s.supervisor.stop(owner);
    expect((await result).code).toBe("clock_stopped");
    expect(s.supervisor.status(owner).pid).toBeUndefined(); waiting.resolve();
  });
  it("rejects a result withdrawn after process exit before acceptance", async () => {
    const s = await setup(); s.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("withdrawn"));
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_admission_or_execution_failed");
  });
  it("does not start a process after policy denial, and stop remains available", async () => {
    const s = await setup(); s.authorize.mockRejectedValue(new Error("not_eligible"));
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_admission_or_execution_failed");
    expect(s.supervisor.status(owner)).toMatchObject({ running: false, pid: undefined });
    await expect(s.supervisor.stop(owner)).resolves.toBeUndefined();
  });
  it("requires the exact installed owner/device tuple from the native resolver", async () => {
    const s = await setup(), entry = await s.store.resolveNativeEntry(owner, s.review);
    s.resolveEntry.mockResolvedValueOnce({ ...entry, installation: { ...entry.installation, deviceId: "wrong-device" } });
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_installation_mismatch");
    expect(s.authorize).not.toHaveBeenCalled();
  });
  it("rejects a stale result when stopped during acceptance", async () => {
    const s = await setup(), reached = deferred(), waiting = deferred();
    s.authorize.mockResolvedValueOnce(undefined).mockImplementationOnce(async () => { reached.resolve(); await waiting.promise; });
    const result = s.supervisor.observe(owner, request()).catch(error => error); await reached.promise;
    await s.supervisor.stop(owner); waiting.resolve();
    expect((await result).code).toBe("clock_stopped");
  });
  it("holds the installer fence until selection is committed or rejected", async () => {
    const s = await setup(), reached = deferred(), waiting = deferred();
    // First authorization admits; the second waits while the installer owns the fence.
    s.installAuthorize.mockResolvedValueOnce(undefined).mockImplementationOnce(async () => { reached.resolve(); await waiting.promise; throw Error("withdrawn"); });
    const update = s.store.install(owner, s.review, s.archivePath).catch(error => error); await reached.promise;
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_fenced");
    waiting.resolve(); expect((await update).code).toBe("package_install_failed");
    expect(s.supervisor.status(owner).fenced).toBe(false);
    await expect(s.supervisor.observe(owner, request())).resolves.toMatchObject({ installationRef: s.installed.installationRef });
  });
  it.each(["token", "capability", "extra_argument", "duration", "expired"])("rejects %s requests before resolving a process entry", async kind => {
    const s = await setup(); const value: any = request();
    if (kind === "token") value.token = "never-forward";
    if (kind === "capability") value.capability_id = "environment.mutate";
    if (kind === "extra_argument") value.arguments.credential = "never-forward";
    if (kind === "duration") value.constraints.max_duration_ms = 5001;
    if (kind === "expired") value.deadline_at = value.created_at;
    await expect(s.supervisor.observe(owner, value)).rejects.toThrow();
    expect(s.resolveEntry).not.toHaveBeenCalled();
  });
  it("rejects changed installed bytes before spawning", async () => {
    const s = await setup(), entry = await s.store.resolveNativeEntry(owner, s.review);
    fs.appendFileSync(entry.entryPath, "\nchanged");
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_admission_or_execution_failed");
    expect(s.authorize).not.toHaveBeenCalled();
  });
});

describe.skipIf(!process.env.G16A_CLOCK_PACKAGE)("exact reviewed private clock under supervision", () => {
  it("persists the actual clock observation and returns only history after reconstruction", async () => {
    const s = await setup("success", process.env.G16A_CLOCK_PACKAGE, true);
    const observed = await s.supervisor.observe(owner, request());
    const reconstructed = new EnvironmentClockSupervisor({ executable: process.execPath, review: s.review,
      resolveEntry: s.resolveEntry, authorize: s.authorize, now: () => fixtureNow,
      observationJournal: new EnvironmentClockObservationJournal(s.root) });
    supervisors.push(reconstructed);
    expect(await reconstructed.recoverObservation(owner, request())).toEqual({ state: "accepted", fresh: false, receipt: observed });
    await expect(reconstructed.observe(owner, request())).rejects.toThrow("clock_request_already_recorded");
    expect(reconstructed.status(owner).pid).toBeUndefined();
  });
  it("installs and observes the unchanged C10-based artifact through the native supervisor", async () => {
    const s = await setup("success", process.env.G16A_CLOCK_PACKAGE);
    const observed = await s.supervisor.observe(owner, request());
    expect(observed.result).toMatchObject({ outcome: "succeeded", model_invoked: false, side_effects_performed: false });
    expect(observed.result.result.uptime_ms).toBeGreaterThanOrEqual(0);
    expect(observed.installationRef).toBe(s.installed.installationRef);
    expect(s.installed.runtimeLaunchable).toBe(false);
  });
});
