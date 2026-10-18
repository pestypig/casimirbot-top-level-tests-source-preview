import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { buildSync } from "esbuild";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createCrashHost } from "./fixtures/desktop-clock-host-crash";
import { WindowsClockNativeRunner } from "../apps/desktop/src/environment-clock-native-runner";
import { WindowsPreparedClockSession } from "../apps/desktop/src/environment-clock-prepared-runner";
import { helixEnvironmentConnectorProbeResultSchema } from "../shared/helix-environment-connector";

const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const files = (root: string): string[] => fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(root, entry.name); return entry.isDirectory() ? files(file) : [file];
});
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e: any) {
  if (e.code === "ESRCH") return false; throw e;
} };
let root: string, fixture: string, runtimeDirectory: string, archive: string, report: string;
const candidateBuild = process.env.G16A_HOST_CRASH_CANDIDATE_BUILD;
const diagnosticBuild = process.env.G16A_HOST_CRASH_TRACE_BUILD ?? candidateBuild;
const preparedEvidence = process.env.G16A_HOST_CRASH_PREPARED === "1" ? path.resolve(
  "docs/evidence/eh-g8-codex-first-paid-product-delivery-v1/launch-program/2026-09-26-g16a-prepared-native-transport.json") : undefined;
if (preparedEvidence && diagnosticBuild) throw Error("Select one helper mode");
if (candidateBuild && process.env.G16A_HOST_CRASH_TRACE_BUILD) throw Error("Select one helper mode");
beforeAll(() => {
  root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "g16a-host-crash-"));
  const build = fs.mkdtempSync(path.join(fs.realpathSync(path.resolve(".tmp")), "g16a-host-crash-build-"));
  fixture = path.join(build, "fixture.cjs"); report = path.join(build, "result.json");
  runtimeDirectory = fs.realpathSync(".tmp/g16a-private-clock-runtime-20260926");
  archive = fs.realpathSync(".tmp/g16a-clock-package-20260926/clock.tgz");
  buildSync({ entryPoints: ["tests/fixtures/desktop-clock-host-crash.ts"], outfile: fixture,
    bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  fs.writeFileSync(".tmp/g16a-host-crash-path.txt", report + "\n");
  fs.writeFileSync(report, JSON.stringify({ root, fixture, fixtureSha256: sha(fixture), archiveSha256: sha(archive),
    diagnosticOnly: Boolean(process.env.G16A_HOST_CRASH_TRACE_BUILD), candidateOnly: Boolean(candidateBuild || preparedEvidence),
    diagnosticBuild, preparedEvidence, cases: [] }));
});

describe.skipIf(process.platform !== "win32")("composed native host death after real clock execution", () => {
  it.each(preparedEvidence ? ["prepared", "before-commit", "after-commit"] : ["before-commit", "after-commit"])("recovers %s without redelivery or execution replay", async boundary => {
    const child = spawn(process.execPath, [fixture, "--host-crash-fixture", root, boundary, runtimeDirectory, archive,
      ...(preparedEvidence ? ["", preparedEvidence] : diagnosticBuild ? [diagnosticBuild] : [])], {
      cwd: process.cwd(), windowsHide: true, shell: false, stdio: "ignore",
      env: { SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE,
        LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA },
    });
    const exit = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
    const spawned = new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    let ended = false;
    try {
      await spawned;
      const marker = path.join(root, `${boundary}.json`), failure = path.join(root, `${boundary}-failure.json`);
      const until = Date.now() + (preparedEvidence ? 18000 : 10000);
      while (!fs.existsSync(marker) && !fs.existsSync(failure) && child.exitCode === null && child.signalCode === null && Date.now() < until)
        await new Promise(resolve => setTimeout(resolve, 20));
      expect(fs.existsSync(marker), fs.existsSync(failure) ? fs.readFileSync(failure, "utf8") : "native crash boundary missing").toBe(true);
      const observed = JSON.parse(fs.readFileSync(marker, "utf8"));
      expect(observed.pid).toBe(child.pid); expect(alive(child.pid!)).toBe(true);
      if (boundary === "prepared") {
        expect(observed.requestCreated).toBe(false); expect(observed.runtimePolicyReads).toBe(2); expect(alive(observed.clockPid)).toBe(true);
        expect(fs.existsSync(path.join(root, "clock-observations"))).toBe(false);
        expect(child.kill("SIGKILL")).toBe(true); const exitResult = await exit; ended = true;
        const deadline = Date.now() + 3000;
        while (alive(observed.clockPid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
        expect(alive(child.pid!)).toBe(false); expect(alive(observed.clockPid)).toBe(false);
        const { host } = createCrashHost(root, runtimeDirectory, archive, undefined, undefined, preparedEvidence);
        try {
          expect(host.status()).toMatchObject({ ready: false, preparing: false, running: false, pid: undefined });
          const ready = await host.prepare(); expect(ready.installationRef).toBe(observed.installationRef);
          await host.stop(); expect(fs.existsSync(path.join(root, "clock-observations"))).toBe(false);
        } finally { await host.close(); }
        const leases = files(path.join(root, "clock-runtime")).filter(file => path.basename(file) === "clock-isolation.journal");
        expect(leases).toHaveLength(1); expect(fs.readFileSync(leases[0], "utf8").split("\n")[3]).toBe("cleaned");
        const evidence = JSON.parse(fs.readFileSync(report, "utf8"));
        evidence.cases.push({ ...observed, exitResult, ownerAbsent: true, childAbsent: true, explicitPreparationRecoveredLease: true,
          automaticRestart: false, observationCreated: false, leaseCleaned: true });
        fs.writeFileSync(report, JSON.stringify(evidence, null, 2) + "\n"); return;
      }
      expect(observed.runnerCalls).toBe(1); expect(observed.runtimePolicyReads).toBe(4);
      expect(observed.elapsedMs).toBeLessThan(5000);
      expect(helixEnvironmentConnectorProbeResultSchema.parse(observed.result)).toMatchObject({ outcome: "succeeded",
        model_invoked: false, side_effects_performed: false, assistant_answer: false });
      expect(observed.result.probe_request_id).toBe(observed.request.probe_request_id);
      expect(Number.isSafeInteger(observed.result.result.uptime_ms)).toBe(true);
      expect(alive(observed.clockPid)).toBe(false);
      expect(child.kill("SIGKILL")).toBe(true); const exitResult = await exit; ended = true;
      expect(alive(child.pid!)).toBe(false);
      expect(fs.existsSync(path.join(root, `${boundary}-delivered.json`))).toBe(false);
      const leaseFiles = files(path.join(root, "clock-runtime")).filter(file => path.basename(file) === "clock-isolation.journal");
      expect(leaseFiles).toHaveLength(1);
      expect(fs.readFileSync(leaseFiles[0], "utf8").split("\n")[3]).toBe("cleaned");
      const retained = [...files(path.join(root, "clock-observations")), ...(!preparedEvidence ? leaseFiles : [])];
      const before = retained.map(file => ({ file: path.relative(root, file), sha256: sha(file) }));
      // Freeze only the recovery fixture's clock so duplicate testing reaches the
      // replay boundary rather than being rejected first as an expired request.
      const { host } = createCrashHost(root, runtimeDirectory, archive, () => new Date(observed.request.created_at), diagnosticBuild, preparedEvidence);
      const runner = vi.spyOn(preparedEvidence ? WindowsPreparedClockSession.prototype : WindowsClockNativeRunner.prototype, "run");
      let history;
      try {
        history = await host.recoverObservation(observed.request);
        expect(history).toEqual(boundary === "before-commit" ? { state: "uncertain", fresh: false } :
          { state: "accepted", fresh: false, receipt: observed.receipt });
        if (preparedEvidence) await host.prepare();
        await expect(host.observe(observed.request)).rejects.toThrow(boundary === "before-commit" ?
          "clock_request_uncertain" : "clock_request_already_recorded");
        expect(runner).not.toHaveBeenCalled();
        expect(host.status()).toMatchObject({ admissionPending: false, running: false, fenced: false });
      } finally { runner.mockRestore(); await host.close(); }
      expect(fs.readFileSync(leaseFiles[0], "utf8").split("\n")[3]).toBe("cleaned");
      expect(retained.map(file => ({ file: path.relative(root, file), sha256: sha(file) }))).toEqual(before);
      const evidence = JSON.parse(fs.readFileSync(report, "utf8"));
      evidence.cases.push({ ...observed, exitResult, nativeClockAbsentBeforeOwnerDeath: true, ownerAbsent: true,
        leaseCleaned: true, delivered: false, recovered: history, replayRunnerCalls: 0, retainedFiles: before });
      fs.writeFileSync(report, JSON.stringify(evidence, null, 2) + "\n");
    } finally {
      if (!ended && child.pid && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL"); await exit;
      }
    }
  }, 25000);
});
