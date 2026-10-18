import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { buildSync } from "esbuild";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { createTarGzip } from "../scripts/environment-packages/tar-archive.mjs";
import { WindowsClockNativeRunner } from "../apps/desktop/src/environment-clock-native-runner";
import { EnvironmentClockNativeStaging } from "../apps/desktop/src/environment-clock-native-staging";
import { EnvironmentClockObservationJournal } from "../apps/desktop/src/environment-clock-observation-journal";
import { NativePrivateClockHost } from "../apps/desktop/src/environment-private-clock-host";
import { PRIVATE_INSTALL_DIRECTORY_REVISION } from "../shared/environment-private-install";
import { PRIVATE_CLOCK_RUNTIME_REVISION, PRIVATE_CLOCK_RUNTIME_PROFILE } from "../shared/environment-private-runtime";
import { EnvironmentClockSupervisor, EnvironmentClockError, type EnvironmentClockProcessRunner } from "../apps/desktop/src/environment-clock-supervisor";
import { EnvironmentPackageInstallationStore } from "../apps/desktop/src/environment-package-installation";
import { packageHash, type ReviewedEnvironmentPackage } from "../apps/desktop/src/environment-package-archive";
import { HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, HELIX_SYSTEM_CLOCK_READ_CAPABILITY } from "../shared/helix-environment-connector";

const owner = { profileId: "profile:native-bridge-fixture", deviceId: "device:native-bridge-fixture" };
const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const request = () => {
  const now = new Date();
  return { schema: HELIX_ENVIRONMENT_PROBE_REQUEST_V1_SCHEMA, probe_request_id: "probe:native-bridge",
    capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY, capability_version: 1, catalog_snapshot_id: "catalog:private-clock",
    arguments: { clock: "monotonic" }, constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
    created_at: now.toISOString(), deadline_at: new Date(now.getTime() + 5000).toISOString(), assistant_answer: false, raw_content_included: false };
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error: any) { if (error.code === "ESRCH") return false; throw error; } };
const absent = async (pid: number) => {
  const end = Date.now() + 3000;
  while (alive(pid) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20));
  expect(alive(pid)).toBe(false);
};
let base: string, executionRoot: string, helper: string, runtimeHash: string, helperHash: string, review: ReviewedEnvironmentPackage;
const supervisors: EnvironmentClockSupervisor[] = [];
const composedHosts: NativePrivateClockHost[] = [];
let composedBase: string;
const cleanJournal = () => expect(fs.readFileSync(path.join(executionRoot, "clock-isolation.journal"), "utf8").split("\n")[3]).toBe("cleaned");

describe.skipIf(process.platform !== "win32")("actual Windows supervisor/native bridge", () => {
  beforeAll(() => {
    if (!process.env.G16A_CLOCK_PACKAGE) throw Error("G16A_CLOCK_PACKAGE required; exact reviewed artifact must not be skipped");
    const temp = fs.realpathSync(path.resolve(".tmp")); base = fs.mkdtempSync(path.join(temp, "g16a-native-bridge-"));
    composedBase = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "casimirbot-clock-composed-"));
    expect(path.dirname(fs.realpathSync(base))).toBe(temp);
    executionRoot = path.join(base, "lease"); fs.mkdirSync(executionRoot);
    fs.copyFileSync(process.execPath, path.join(executionRoot, "node.exe")); runtimeHash = sha(process.execPath);
    helper = path.join(base, "clock-bridge.exe");
    const sources = ["EnvironmentClockJob.cs", "EnvironmentClockIsolationLease.cs", "EnvironmentClockBridge.cs"]
      .map(name => path.resolve("apps/desktop/native", name));
    const compiler = path.join(process.env.SystemRoot!, "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
    const compiled = spawnSync(compiler, ["/nologo", "/platform:x64", "/optimize+", "/target:exe", `/out:${helper}`, ...sources],
      { windowsHide: true, shell: false, encoding: "utf8", timeout: 30000 });
    expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0); helperHash = sha(helper);
    review = JSON.parse(fs.readFileSync("apps/desktop/environment-packages/system-clock/reviewed-private.json", "utf8"));
    fs.writeFileSync(path.join(base, "build.json"), JSON.stringify({ helper, helperHash, runtimeHash,
      sources: Object.fromEntries(sources.map(file => [path.relative(process.cwd(), file), sha(file)])),
      supervisorSha256: sha("apps/desktop/src/environment-clock-supervisor.ts"),
      runnerSha256: sha("apps/desktop/src/environment-clock-native-runner.ts"),
      testsSha256: sha("tests/desktop-environment-clock-native-runner.spec.ts") }, null, 2) + "\n");
    fs.writeFileSync(".tmp/g16a-native-bridge-build-path.txt", path.join(base, "build.json") + "\n");
  }, 30000);
  afterEach(async () => {
    for (const host of composedHosts.splice(0)) await host.close();
    for (const supervisor of supervisors.splice(0)) {
      try { await supervisor.stop(owner); }
      catch (error) { if (!(error instanceof EnvironmentClockError) || error.code !== "clock_stop_unconfirmed") throw error; }
    }
    vi.unstubAllEnvs();
    // Retain the private helper/runtime and evidence; no packaged EXE cleanup.
  });
  const setup = async (mode: "reviewed" | "hang" | "invalid" = "reviewed", runnerOverride?: EnvironmentClockProcessRunner) => {
    let selected = structuredClone(review), archive = path.join(process.env.G16A_CLOCK_PACKAGE!, "clock.tgz");
    if (mode !== "reviewed") {
      const body = mode === "hang" ? "process.stdin.resume();setInterval(()=>{},1000);" : "process.stdout.write('{}');";
      const files = { "clock.cjs": Buffer.from(body), LICENSE: Buffer.from("private fixture"), "THIRD_PARTY_NOTICES.txt": Buffer.from("fixture") };
      const bytes = createTarGzip(Object.entries(files).map(([name, content]) => ({ name, bytes: content })));
      selected = { ...selected, archiveSha256: packageHash(bytes), files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, packageHash(content)])) };
      archive = path.join(base, selected.archiveSha256 + ".tgz"); fs.writeFileSync(archive, bytes);
    }
    const config = { helperPath: helper, helperSha256: helperHash, runtimeSha256: runtimeHash,
      entrySha256: selected.files["clock.cjs"], resolveLeaseRoot: async (entryPath: string) => {
        fs.copyFileSync(entryPath, path.join(executionRoot, "clock.cjs")); return executionRoot;
      } };
    const runner = new WindowsClockNativeRunner(config);
    const authorize = vi.fn(async () => {});
    let supervisor!: EnvironmentClockSupervisor;
    const store = new EnvironmentPackageInstallationStore({ userDataPath: base, authorize: async () => {},
      stopAndFence: (who, packageId) => supervisor.acquireMutationFence(who, packageId) });
    supervisor = new EnvironmentClockSupervisor({ executable: process.execPath, review: selected,
      resolveEntry: (who, approved) => store.resolveNativeEntry(who, approved), authorize,
      processRunner: runnerOverride ?? runner });
    supervisors.push(supervisor);
    const installation = await store.install(owner, selected, archive);
    return { supervisor, store, selected, installation, authorize, runner, config };
  };
  const composed = async () => {
    const account = { profileId: "profile:native-composed", sessionId: "account_session:native-composed-1234", accountType: "developer" as const };
    const deviceId = `desktop_device_${"c".repeat(22)}`;
    const identity = () => ({ profile_id: account.profileId, device_id: deviceId,
      session_ref: createHash("sha256").update(account.sessionId).digest("hex"), artifact_sha256: review.archiveSha256,
      review_revision: review.policyRevision, credential_included: false, public_release: false });
    const installPolicy = () => ({ ...identity(), schema: "casimirbot.private_environment_install_policy.v1",
      policy_revision: PRIVATE_INSTALL_DIRECTORY_REVISION, expires_at: review.expiresAt, install_allowed: true, runtime_allowed: false });
    const runtimePolicy = () => {
      const now = new Date();
      return { ...identity(), schema: "casimirbot.private_clock_runtime_policy.v1", policy_revision: PRIVATE_CLOCK_RUNTIME_REVISION,
        issued_at: now.toISOString(), expires_at: new Date(now.getTime() + 30000).toISOString(),
        runtime_profile: PRIVATE_CLOCK_RUNTIME_PROFILE, capability_id: HELIX_SYSTEM_CLOCK_READ_CAPABILITY,
        runtime_allowed: true, hosted_required: false, model_invoked: false };
    };
    const input = { userDataPath: composedBase, deviceId, runtime: { executable: process.execPath,
      sha256: runtimeHash, helperPath: helper, helperSha256: helperHash },
      featureEnabled: vi.fn(() => true), runtimeEnabled: vi.fn(() => true),
      readAccount: vi.fn(async () => ({ ...account })), readPolicy: vi.fn(async (): Promise<unknown> => installPolicy()),
      readRuntimePolicy: vi.fn(async (): Promise<unknown> => runtimePolicy()),
      selectArchive: vi.fn(async () => path.join(process.env.G16A_CLOCK_PACKAGE!, "clock.tgz")) };
    const host = new NativePrivateClockHost(input); composedHosts.push(host);
    const installed = await host.installer.install(); expect(installed.status).toBe("installed_stopped");
    return { host, input, account, installed, runtimePolicy };
  };
  const composedRequest = () => ({ ...request(), probe_request_id: `probe:composed-${randomUUID()}` });

  it("composes current account admission, actual isolated execution and durable history", async () => {
    const s = await composed(), value = composedRequest();
    const observation = await s.host.observe(value);
    expect(observation.result.outcome).toBe("succeeded"); expect(observation.installationRef).toBe(s.installed.installationRef);
    expect(s.input.readRuntimePolicy).toHaveBeenCalledTimes(4);
    expect(() => new NativePrivateClockHost(s.input)).toThrow("clock_host_already_owned");
    await Promise.all([s.host.close(), s.host.close()]);
    const replacement = new NativePrivateClockHost(s.input); composedHosts.push(replacement);
    await expect(s.host.observe(composedRequest())).rejects.toThrow("clock_host_closed");
    expect(await s.host.installer.install()).toMatchObject({ status: "unavailable", runtimeAvailable: false });
    expect(await replacement.recoverObservation(value)).toEqual({ state: "accepted", fresh: false, receipt: observation });
    await expect(replacement.observe(value)).rejects.toThrow("clock_request_already_recorded");
    expect(replacement.status()).toMatchObject({ running: false, fenced: false });
    fs.writeFileSync(path.join(base, "composed-host-run.json"), JSON.stringify({ userDataPath: composedBase,
      helperHash, runtimeHash, artifactSha256: review.archiveSha256, installationRef: observation.installationRef,
      executionRef: observation.executionRef, actualClockOutcome: observation.result.outcome,
      initialRuntimePolicyReads: 4, recoveredHistoryFresh: false, duplicateDenied: true,
      hostSourceSha256: sha("apps/desktop/src/environment-private-clock-host.ts") }, null, 2) + "\n");
  }, 20000);
  it.each([3, 4])("rejects runtime withdrawal at composed policy checkpoint %s", async checkpoint => {
    const s = await composed(), value = composedRequest(); let pid = 0;
    s.input.readRuntimePolicy.mockImplementation(async () => {
      if (s.input.readRuntimePolicy.mock.calls.length === checkpoint) { pid = s.host.status().pid!; throw Error("fixture withdrawal"); }
      return s.runtimePolicy();
    });
    await expect(s.host.observe(value)).rejects.toThrow("clock_admission_or_execution_failed");
    expect(pid).toBeGreaterThan(0); await absent(pid);
    s.input.readRuntimePolicy.mockImplementation(async () => s.runtimePolicy());
    expect(await s.host.recoverObservation(value)).toEqual({ state: "uncertain", fresh: false });
  }, 20000);
  it("uses the SAME supervisor fence when installing during composed pre-resume admission", async () => {
    const s = await composed(), entered = deferred(), waiting = deferred();
    s.input.readRuntimePolicy.mockImplementation(async () => {
      if (s.input.readRuntimePolicy.mock.calls.length === 3) { entered.resolve(); await waiting.promise; }
      return s.runtimePolicy();
    });
    const observed = s.host.observe(composedRequest()).catch(error => error);
    try {
      await entered.promise; const pid = s.host.status().pid!; expect(pid).toBeGreaterThan(0);
      expect(await s.host.installer.install()).toMatchObject({ status: "installed_stopped", installationRef: s.installed.installationRef });
      expect((await observed).code).toBe("clock_stopped"); await absent(pid);
      expect(s.host.status()).toMatchObject({ running: false, fenced: false });
    } finally { waiting.resolve(); }
  }, 20000);
  it("stops the composed native child after sign-out without requiring a new policy", async () => {
    const s = await composed(), entered = deferred(), waiting = deferred();
    s.input.readRuntimePolicy.mockImplementation(async () => {
      if (s.input.readRuntimePolicy.mock.calls.length === 3) { entered.resolve(); await waiting.promise; }
      return s.runtimePolicy();
    });
    const observed = s.host.observe(composedRequest()).catch(error => error);
    try {
      await entered.promise; const pid = s.host.status().pid!;
      s.input.readAccount.mockRejectedValue(Error("fixture sign-out")); s.input.runtimeEnabled.mockReturnValue(false);
      const reads = s.input.readRuntimePolicy.mock.calls.length;
      await s.host.stop(); expect((await observed).code).toBe("clock_stopped"); await absent(pid);
      expect(s.input.readRuntimePolicy).toHaveBeenCalledTimes(reads);
      await expect(s.host.observe(composedRequest())).rejects.toThrow("clock_admission_or_execution_failed");
    } finally { waiting.resolve(); }
  }, 20000);
  it("invalidates pending initial admission and rejects concurrent host requests", async () => {
    const s = await composed(), entered = deferred(), waiting = deferred();
    s.input.readRuntimePolicy.mockImplementationOnce(async () => { entered.resolve(); await waiting.promise; return s.runtimePolicy(); });
    const observed = s.host.observe(composedRequest()).catch(error => error);
    try {
      await entered.promise; expect(s.host.status().admissionPending).toBe(true);
      await expect(s.host.observe(composedRequest())).rejects.toThrow("clock_busy");
      await s.host.stop(); expect((await observed).code).toBe("clock_stopped");
      waiting.resolve(); await new Promise(resolve => setTimeout(resolve, 20));
      expect(s.host.status()).toMatchObject({ admissionPending: false, running: false, pid: undefined });
      expect(s.input.readRuntimePolicy).toHaveBeenCalledTimes(1);
    } finally { waiting.resolve(); }
  }, 20000);
  it("rejects a matching replacement session during composed pre-resume admission", async () => {
    const s = await composed(); let pid = 0;
    s.input.readRuntimePolicy.mockImplementation(async () => {
      if (s.input.readRuntimePolicy.mock.calls.length === 3) {
        pid = s.host.status().pid!; s.account.sessionId = "account_session:matching-replacement-1234";
      }
      return s.runtimePolicy(); // Both readers now agree; the original operation still owns the old identity.
    });
    await expect(s.host.observe(composedRequest())).rejects.toThrow("clock_admission_or_execution_failed");
    expect(pid).toBeGreaterThan(0); await absent(pid);
  }, 20000);
  it("runs the reviewed installed clock through fresh admission and isolated native cleanup", async () => {
    const s = await setup(); vi.stubEnv("NODE_OPTIONS", "--no-warnings"); vi.stubEnv("G16A_CANARY", "harmless-test-value");
    const result = await s.supervisor.observe(owner, request());
    expect(result.installationRef).toBe(s.installation.installationRef);
    expect(result.result).toMatchObject({ outcome: "succeeded", model_invoked: false, side_effects_performed: false });
    expect(s.authorize.mock.calls.map(call => call[1])).toEqual(["execute", "execute", "accept"]);
    expect(s.supervisor.status(owner)).toMatchObject({ running: false, fenced: false }); cleanJournal();
  }, 20000);
  it("runs native-owned staged bytes and reuses the same lease after host reconstruction", async () => {
    const s = await setup();
    const temp = fs.realpathSync(os.tmpdir());
    const stagingBase = fs.mkdtempSync(path.join(temp, "casimirbot-clock-staging-bridge-"));
    expect(path.dirname(fs.realpathSync(stagingBase))).toBe(temp);
    const options = { userDataPath: stagingBase, owner, review: s.selected,
      runtimePath: process.execPath, runtimeSha256: runtimeHash };
    let leaseRoot = "";
    const createHost = () => {
      const staging = new EnvironmentClockNativeStaging(options);
      const runner = new WindowsClockNativeRunner({ ...s.config, resolveLeaseRoot: async entryPath => {
        leaseRoot = staging.prepare(entryPath); return leaseRoot;
      } });
      const supervisor = new EnvironmentClockSupervisor({ executable: process.execPath, review: s.selected,
        resolveEntry: (who, approved) => s.store.resolveNativeEntry(who, approved),
        authorize: s.authorize, processRunner: runner, observationJournal: new EnvironmentClockObservationJournal(stagingBase) });
      supervisors.push(supervisor); return supervisor;
    };
    const installed = await s.store.resolveNativeEntry(owner, s.selected);
    s.authorize.mockResolvedValueOnce(undefined).mockImplementationOnce(async () => {
      // The actual native helper owns its lock and pinned files at this point.
      expect(new EnvironmentClockNativeStaging(options).prepare(installed.entryPath)).toBe(leaseRoot);
    });
    const firstRequest = request(), first = await createHost().observe(owner, firstRequest);
    expect(first.result.outcome).toBe("succeeded");
    const initialRoot = leaseRoot, record = fs.readFileSync(path.join(leaseRoot, "staging.json"), "utf8");
    const hashes = { runtime: sha(path.join(leaseRoot, "node.exe")), entry: sha(path.join(leaseRoot, "clock.cjs")) };
    const reconstructed = createHost();
    expect(await reconstructed.recoverObservation(owner, firstRequest)).toEqual({ state: "accepted", fresh: false, receipt: first });
    await expect(reconstructed.observe(owner, firstRequest)).rejects.toThrow("clock_request_already_recorded");
    expect(reconstructed.status(owner).pid).toBeUndefined();
    const second = await reconstructed.observe(owner, { ...request(), probe_request_id: "probe:native-bridge-second" });
    expect(second.result.outcome).toBe("succeeded"); expect(leaseRoot).toBe(initialRoot);
    expect(fs.readFileSync(path.join(leaseRoot, "staging.json"), "utf8")).toBe(record);
    expect(sha(path.join(leaseRoot, "node.exe"))).toBe(hashes.runtime);
    expect(sha(path.join(leaseRoot, "clock.cjs"))).toBe(hashes.entry);
    expect(fs.readFileSync(path.join(leaseRoot, "clock-isolation.journal"), "utf8").split("\n")[3]).toBe("cleaned");
    expect(s.authorize.mock.calls.map(call => call[1])).toEqual(["execute", "execute", "accept", "accept", "execute", "execute", "execute", "accept"]);
    fs.writeFileSync(path.join(base, "staging-run.json"), JSON.stringify({ stagingBase, leaseRoot, hashes,
      runtimeHash, helperHash, review: s.selected.archiveSha256,
      stagingSourceSha256: sha("apps/desktop/src/environment-clock-native-staging.ts"),
      stagingReceiptSha256: sha(path.join(leaseRoot, "staging.json")),
      journalSha256: sha(path.join(leaseRoot, "clock-isolation.journal")), reconstructedHostObservations: 2,
      durableJournalSourceSha256: sha("apps/desktop/src/environment-clock-observation-journal.ts"),
      recoveredHistoryFresh: false, duplicateExecutionDenied: true }, null, 2) + "\n");
  }, 20000);
  it("rejects permission withdrawn after child preparation before GO", async () => {
    const s = await setup(); let pid = 0;
    s.authorize.mockImplementationOnce(async () => {}).mockImplementationOnce(async () => {
      pid = s.supervisor.status(owner).pid!; throw Error("fixture permission withdrawn");
    });
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_admission_or_execution_failed");
    expect(pid).toBeGreaterThan(0); await absent(pid); cleanJournal();
    expect(s.authorize).toHaveBeenCalledTimes(2);
  }, 20000);
  it("stops pending final admission and recovers before releasing an update fence", async () => {
    const s = await setup(), reached = deferred(), waiting = deferred();
    s.authorize.mockResolvedValueOnce(undefined).mockImplementationOnce(async () => { reached.resolve(); await waiting.promise; });
    const observed = s.supervisor.observe(owner, request()).catch(error => error); await reached.promise;
    const pid = s.supervisor.status(owner).pid!;
    const release = await s.supervisor.acquireMutationFence(owner, s.selected.packageId);
    expect((await observed).code).toBe("clock_stopped"); await absent(pid); cleanJournal();
    expect(s.supervisor.status(owner).fenced).toBe(true); release(); waiting.resolve();
    expect(s.supervisor.status(owner).fenced).toBe(false);
  }, 20000);
  it("stops a running isolated child and confirms native recovery", async () => {
    const s = await setup("hang"), admitted = deferred();
    s.authorize.mockResolvedValueOnce(undefined).mockImplementationOnce(async () => { admitted.resolve(); });
    const observed = s.supervisor.observe(owner, request()).catch(error => error); await admitted.promise;
    await new Promise(resolve => setTimeout(resolve, 250)); const pid = s.supervisor.status(owner).pid!;
    expect(alive(pid)).toBe(true); await s.supervisor.stop(owner);
    expect((await observed).code).toBe("clock_stopped"); await absent(pid); cleanJournal();
  }, 20000);
  it("rejects invalid child results after confirmed cleanup", async () => {
    const s = await setup("invalid");
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_result_invalid");
    cleanJournal(); expect(s.authorize).toHaveBeenCalledTimes(2);
  }, 20000);
  it("rejects a changed helper pin without an unconfined fallback", async () => {
    const s = await setup(), entry = await s.store.resolveNativeEntry(owner, s.selected);
    const runner = new WindowsClockNativeRunner({ ...s.config, helperSha256: "0".repeat(64) });
    const onSpawn = vi.fn(), beforeExecute = vi.fn(async () => {});
    const journal = path.join(executionRoot, "clock-isolation.journal"), before = fs.existsSync(journal) ? sha(journal) : null;
    await expect(runner.run({ entryPath: entry.entryPath, input: Buffer.from(JSON.stringify(request())),
      signal: new AbortController().signal, onSpawn, beforeExecute })).rejects.toThrow("clock_stop_unconfirmed");
    expect(onSpawn).not.toHaveBeenCalled(); expect(beforeExecute).not.toHaveBeenCalled();
    expect(fs.existsSync(journal) ? sha(journal) : null).toBe(before);
  });
  it("rejects an entry that does not match the native execution pin", async () => {
    const s = await setup(), entry = await s.store.resolveNativeEntry(owner, s.selected);
    const runner = new WindowsClockNativeRunner({ ...s.config, entrySha256: "0".repeat(64) });
    const onSpawn = vi.fn(), beforeExecute = vi.fn(async () => {});
    await expect(runner.run({ entryPath: entry.entryPath, input: Buffer.from(JSON.stringify(request())),
      signal: new AbortController().signal, onSpawn, beforeExecute })).rejects.toThrow("clock_native_entry_changed");
    expect(onSpawn).not.toHaveBeenCalled(); expect(beforeExecute).not.toHaveBeenCalled();
  });
  it("keeps execution and update fenced when recovery cannot be confirmed", async () => {
    const reached = deferred();
    const runner: EnvironmentClockProcessRunner = { run: input => new Promise((_, reject) => {
      input.signal.addEventListener("abort", () => reject(new EnvironmentClockError("clock_stop_unconfirmed")), { once: true }); reached.resolve();
    }) };
    const s = await setup("reviewed", runner), observed = s.supervisor.observe(owner, request()).catch(error => error);
    await reached.promise;
    await expect(s.supervisor.acquireMutationFence(owner, s.selected.packageId)).rejects.toThrow("clock_stop_unconfirmed");
    expect((await observed).code).toBe("clock_stop_unconfirmed");
    expect(s.supervisor.status(owner)).toMatchObject({ running: false, fenced: true });
    await expect(s.supervisor.stop(owner)).rejects.toThrow("clock_stop_unconfirmed");
    await expect(s.supervisor.observe(owner, request())).rejects.toThrow("clock_fenced");
  });
  it("ends the native helper/child when its owning Node host dies, then recovers on restart", async () => {
    const s = await setup("hang"), entry = await s.store.resolveNativeEntry(owner, s.selected);
    await s.config.resolveLeaseRoot(entry.entryPath);
    const script = path.join(base, "owner-crash.cjs");
    buildSync({ stdin: { contents: `import {WindowsClockNativeRunner} from ${JSON.stringify(path.resolve("apps/desktop/src/environment-clock-native-runner.ts"))};
const c=JSON.parse(process.argv[2]);const runner=new WindowsClockNativeRunner({...c,resolveLeaseRoot:async()=>c.root});
runner.run({entryPath:c.entry,input:Buffer.from(JSON.stringify(c.request)),signal:new AbortController().signal,
onSpawn:pid=>process.stdout.write(JSON.stringify({pid})+'\\n'),beforeExecute:async()=>{process.stdout.write(JSON.stringify({admitted:true})+'\\n');}})
.then(()=>process.exit(0),()=>process.exit(1));`, resolveDir: process.cwd(), loader: "ts" },
      outfile: script, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
    const victim = spawn(process.execPath, [script, JSON.stringify({ ...s.config, root: executionRoot, entry: entry.entryPath, request: request() })],
      { windowsHide: true, shell: false, env: { SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE,
        LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA }, stdio: ["ignore", "pipe", "pipe"] });
    let pid = 0, text = ""; const ready = deferred();
    victim.stdout.on("data", chunk => { text += chunk; while (text.includes("\n")) {
      const end = text.indexOf("\n"), frame = JSON.parse(text.slice(0, end)); text = text.slice(end + 1);
      if (frame.pid) pid = frame.pid; if (frame.admitted) ready.resolve();
    } });
    const done = new Promise(resolve => victim.once("close", resolve));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([ready.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("owner admission missing")), 5000); })]);
      if (timer) clearTimeout(timer);
      await new Promise(resolve => setTimeout(resolve, 250)); expect(alive(pid)).toBe(true);
      victim.kill("SIGKILL"); await done; await absent(pid);
      const fresh = await setup(); const result = await fresh.supervisor.observe(owner, request());
      expect(result.result.outcome).toBe("succeeded"); cleanJournal();
    } finally { if (timer) clearTimeout(timer); victim.kill("SIGKILL"); await done; }
  }, 25000);
});
