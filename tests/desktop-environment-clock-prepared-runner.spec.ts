import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WindowsPreparedClockSession } from "../apps/desktop/src/environment-clock-prepared-runner";
import { EnvironmentClockSupervisor, EnvironmentClockError } from "../apps/desktop/src/environment-clock-supervisor";
import { EnvironmentClockObservationJournal } from "../apps/desktop/src/environment-clock-observation-journal";
import type { EnvironmentPackageInstallation } from "../apps/desktop/src/environment-package-installation";
import type { ReviewedEnvironmentPackage } from "../apps/desktop/src/environment-package-archive";

const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const sessions: WindowsPreparedClockSession[] = [];
let root: string, output: string, config: Parameters<typeof WindowsPreparedClockSession.prepare>[0], review: ReviewedEnvironmentPackage;
const request = () => { const now = Date.now(); return { schema: "helix.environment_connector.probe_request.v1",
  probe_request_id: `probe:${randomUUID()}`, capability_id: "com.casimirbot.system.clock.read", capability_version: 1,
  catalog_snapshot_id: "catalog:prepared-runner", arguments: { clock: "monotonic" },
  constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 },
  created_at: new Date(now).toISOString(), deadline_at: new Date(now + 5000).toISOString(), assistant_answer: false, raw_content_included: false }; };
const prepare = async () => { const s = await WindowsPreparedClockSession.prepare(config, new AbortController().signal); sessions.push(s); return s; };
const clean = () => expect(fs.readFileSync(path.join(root, "clock-isolation.journal"), "utf8").split("\n")[3]).toBe("cleaned");
const input = (value = request()) => ({ entryPath: config.entryPath, input: Buffer.from(JSON.stringify(value)),
  signal: new AbortController().signal, onSpawn: vi.fn(), beforeExecute: vi.fn(async () => {}) });

describe.skipIf(process.platform !== "win32")("prepared native runner ownership", () => {
  beforeAll(() => {
    const evidence = JSON.parse(fs.readFileSync("docs/evidence/eh-g8-codex-first-paid-product-delivery-v1/launch-program/2026-09-26-g16a-prepared-native-transport.json", "utf8"));
    for (const [source, expected] of Object.entries(evidence.sourceHashes)) expect(sha(source)).toBe(expected);
    expect(sha(evidence.helper)).toBe(evidence.helperSha256);
    review = JSON.parse(fs.readFileSync("apps/desktop/environment-packages/system-clock/reviewed-private.json", "utf8"));
    const runtimeReview = JSON.parse(fs.readFileSync("apps/desktop/environment-packages/system-clock/reviewed-native-runtime.json", "utf8"));
    expect(Date.now()).toBeLessThan(Date.parse(review.expiresAt));
    const node = path.resolve(".tmp/g16a-private-clock-runtime-20260926/node.exe"), entry = path.join(evidence.root, "clock.cjs");
    expect(sha(node)).toBe(runtimeReview.files["node.exe"].sha256); expect(sha(entry)).toBe(review.files[review.entryPoint]);
    root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "g16a-prepared-runner-"));
    output = fs.mkdtempSync(path.join(fs.realpathSync(".tmp"), "g16a-prepared-runner-"));
    fs.copyFileSync(node, path.join(root, "node.exe")); fs.copyFileSync(entry, path.join(root, "clock.cjs"));
    fs.copyFileSync(evidence.helper, path.join(output, "prepared.exe"));
    config = { helperPath: path.join(output, "prepared.exe"), helperSha256: evidence.helperSha256,
      runtimeSha256: sha(node), entrySha256: sha(entry), entryPath: path.join(root, "clock.cjs"), leaseRoot: root };
    fs.writeFileSync(path.join(output, "build.json"), JSON.stringify({ config, sourceHashes: evidence.sourceHashes,
      runnerSha256: sha("apps/desktop/src/environment-clock-prepared-runner.ts"), testsSha256: sha("tests/desktop-environment-clock-prepared-runner.spec.ts") }, null, 2));
    fs.writeFileSync(".tmp/g16a-prepared-runner-build-path.txt", path.join(output, "build.json"));
  }, 20000);
  afterEach(async () => { for (const s of sessions.splice(0)) await s.stop(); });

  it("composes with the unchanged supervisor and real journal; never replays a duplicate", async () => {
    const s = await prepare(), owner = { profileId: "profile:prepared-fixture", deviceId: "device:prepared-fixture" };
    const installation: EnvironmentPackageInstallation = { schema: "casimirbot.environment_package_installation.v1",
      installationRef: `environment_installation:${randomUUID()}`, ...owner, packageId: review.packageId, version: review.version,
      artifactSha256: review.archiveSha256, policyRevision: review.policyRevision, installedAt: new Date().toISOString(),
      status: "installed_stopped", connected: false, granted: false, runtimeLaunchable: false };
    const authorize = vi.fn(async () => {}), run = vi.spyOn(s, "run");
    const supervisor = new EnvironmentClockSupervisor({ executable: path.join(root, "node.exe"), review, processRunner: s,
      resolveEntry: async () => ({ entryPath: config.entryPath, installation }), authorize,
      observationJournal: new EnvironmentClockObservationJournal(root) });
    const value = request(), started = Date.now(), receipt = await supervisor.observe(owner, value);
    expect(receipt.result.probe_request_id).toBe(value.probe_request_id); expect(Date.now() - started).toBeLessThan(5000);
    expect(authorize.mock.calls).toHaveLength(3);
    expect(await supervisor.recoverObservation(owner, value)).toEqual({ state: "accepted", fresh: false, receipt });
    await expect(supervisor.observe(owner, value)).rejects.toMatchObject({ code: "clock_request_already_recorded" });
    expect(run).toHaveBeenCalledTimes(1); expect(s.status()).toMatchObject({ phase: "closed", consumed: true }); clean();
    fs.writeFileSync(path.join(output, "supervisor-result.json"), JSON.stringify({ receipt, observationMs: Date.now() - started, runnerCalls: run.mock.calls.length }));
  }, 20000);

  it("freezes caller bytes before admission and rejects a second execution", async () => {
    const s = await prepare(), gate = deferred(), entered = deferred(), value = request(), call = input(value);
    call.beforeExecute = vi.fn(async () => { entered.resolve(); await gate.promise; });
    const result = s.run(call); await entered.promise; call.input.fill(32); gate.resolve();
    expect(JSON.parse((await result).toString()).probe_request_id).toBe(value.probe_request_id);
    await expect(s.run(input())).rejects.toMatchObject({ code: "clock_prepared_already_used" }); clean();
  }, 20000);

  it("denies admission without executing and confirms recovery", async () => {
    const s = await prepare(), call = input(); call.beforeExecute = vi.fn(async (): Promise<void> => { throw new EnvironmentClockError("clock_permission_denied"); });
    await expect(s.run(call)).rejects.toMatchObject({ code: "clock_permission_denied" }); expect(s.status().phase).toBe("closed"); clean();
  }, 20000);

  it("settles cancellation while admission hangs; a later callback cannot execute", async () => {
    const s = await prepare(), gate = deferred(), entered = deferred(), abort = new AbortController(), call = input();
    call.signal = abort.signal; call.beforeExecute = vi.fn(async () => { entered.resolve(); await gate.promise; });
    const result = s.run(call), rejection = expect(result).rejects.toMatchObject({ code: "clock_stopped" });
    await entered.promise; abort.abort(); await rejection; expect(s.status().phase).toBe("closed"); clean();
    gate.resolve(); await Promise.resolve(); expect(s.status().phase).toBe("closed");
  }, 20000);

  it("expires even when admission never resolves", async () => {
    const s = await prepare(), call = input(); call.beforeExecute = vi.fn(() => new Promise<void>(() => {}));
    await expect(s.run(call)).rejects.toMatchObject({ code: expect.stringMatching(/^clock_(prepared_idle_timeout|native_execution_failed)$/) });
    expect(s.status().phase).toBe("closed"); clean();
  }, 20000);

  it("rejects a different entry and closes the prepared child", async () => {
    const s = await prepare(), call = input(); call.entryPath = path.join(root, "other.cjs");
    await expect(s.run(call)).rejects.toMatchObject({ code: "clock_request_invalid" }); expect(call.beforeExecute).not.toHaveBeenCalled(); clean();
  }, 20000);

  it("preserves unconfirmed cleanup when the helper changes", async () => {
    const s = await prepare(), original = fs.readFileSync(config.helperPath);
    try {
      // Rename the running image, then replace only this test-owned helper path.
      fs.renameSync(config.helperPath, config.helperPath + ".running"); fs.writeFileSync(config.helperPath, Buffer.from("changed"));
      await expect(s.stop()).rejects.toMatchObject({ code: "clock_stop_unconfirmed" });
      await expect(s.stop()).rejects.toMatchObject({ code: "clock_stop_unconfirmed" });
    } finally {
      fs.writeFileSync(config.helperPath, original); sessions.splice(sessions.indexOf(s), 1);
      const repaired = spawnSync(config.helperPath, ["recover", root, config.runtimeSha256, config.entrySha256, String(process.pid)],
        { shell: false, windowsHide: true, timeout: 12000, encoding: "utf8", env: { SystemRoot: process.env.SystemRoot,
          USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA, TEMP: root, TMP: root } });
      expect(repaired.status, repaired.stderr).toBe(0); clean();
    }
  }, 20000);

  it("rejects pre-cancelled preparation before starting a process", async () => {
    const abort = new AbortController(); abort.abort();
    const before = sha(path.join(root, "clock-isolation.journal"));
    await expect(WindowsPreparedClockSession.prepare(config, abort.signal)).rejects.toMatchObject({ code: "clock_stopped" });
    expect(sha(path.join(root, "clock-isolation.journal"))).toBe(before);
  });
});
