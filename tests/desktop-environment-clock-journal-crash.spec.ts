import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { buildSync } from "esbuild";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { EnvironmentClockObservationJournal } from "../apps/desktop/src/environment-clock-observation-journal";
import { EnvironmentClockSupervisor } from "../apps/desktop/src/environment-clock-supervisor";
import type { ReviewedEnvironmentPackage } from "../apps/desktop/src/environment-package-archive";
import { crashContext, crashExecutionRef, crashResult, crashTime } from "./fixtures/desktop-clock-journal-crash";

const hash = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let base: string, fixture: string;
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e: any) {
  if (e.code === "ESRCH") return false; throw e;
} };
const waitForExit = (child: ChildProcess) => new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
  const timer = setTimeout(() => reject(Error("owned_child_exit_unconfirmed")), 5000);
  child.once("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  child.once("error", error => { clearTimeout(timer); reject(error); });
});
const inventory = (root: string): { file: string; sha256: string }[] => fs.readdirSync(root, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? inventory(path.join(root, entry.name)).map(item => ({ ...item, file: `${entry.name}/${item.file}` }))
    : [{ file: entry.name, sha256: hash(path.join(root, entry.name)) }]);

beforeAll(() => {
  base = fs.mkdtempSync(path.join(fs.realpathSync(path.resolve(".tmp")), "g16a-journal-crash-"));
  fixture = path.join(base, "fixture.cjs");
  buildSync({ entryPoints: ["tests/fixtures/desktop-clock-journal-crash.ts"], outfile: fixture,
    bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  fs.writeFileSync(".tmp/g16a-journal-crash-path.txt", base + "\n");
});

describe("durable journal after actual owner-process termination", () => {
  it.each(["reservation", "claim", "pending", "accepted"])("recovers %s without replay or fresh-evidence claims", async boundary => {
    const root = fs.mkdtempSync(path.join(base, "case-"));
    const child = spawn(process.execPath, [fixture, "--crash-fixture", root, boundary], {
      env: process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {},
      cwd: root, windowsHide: true, shell: false, stdio: "ignore",
    });
    const exit = waitForExit(child); void exit.catch(() => {});
    let terminated = false;
    try {
      const marker = path.join(root, "boundary.json"), end = Date.now() + 4000;
      while (!fs.existsSync(marker) && Date.now() < end && child.exitCode === null && child.signalCode === null)
        await new Promise(resolve => setTimeout(resolve, 20));
      expect(fs.existsSync(marker), "child must reach the exact crash boundary").toBe(true);
      expect(JSON.parse(fs.readFileSync(marker, "utf8"))).toEqual({ boundary, pid: child.pid });
      expect(alive(child.pid!)).toBe(true);
      expect(child.kill("SIGKILL")).toBe(true);
      const exitResult = await exit; terminated = true;
      expect(alive(child.pid!)).toBe(false);
      expect(exitResult.code === 0).toBe(false);
      expect(fs.existsSync(path.join(root, "delivered.json"))).toBe(false);
      const journalRoot = path.join(root, "clock-observations"), before = inventory(journalRoot);
      const names = before.map(item => path.basename(item.file));
      expect(names.sort()).toEqual(boundary === "reservation" ? [] : boundary === "claim" ? ["claim.json"] :
        boundary === "pending" ? ["accepted.pending", "claim.json"] : ["accepted.json", "claim.json"]);
      const context = crashContext(), journal = new EnvironmentClockObservationJournal(root);
      const history = journal.lookup(context), accepted = boundary === "accepted";
      expect(history).toEqual(accepted ? { state: "accepted", fresh: false, receipt: {
        executionRef: crashExecutionRef, epoch: 7, installationRef: context.installation.installationRef, result: crashResult(),
      } } : { state: "uncertain", fresh: false });
      const denial = accepted ? "clock_request_already_recorded" : "clock_request_uncertain";
      expect(() => journal.begin(context, `environment_execution:${randomUUID()}`, 8)).toThrow(denial);
      const review = JSON.parse(fs.readFileSync("apps/desktop/environment-packages/system-clock/reviewed-private.json", "utf8")) as ReviewedEnvironmentPackage;
      Object.assign(review, { archiveSha256: context.installation.artifactSha256, policyRevision: context.installation.policyRevision,
        version: context.installation.version });
      const run = vi.fn(async () => { throw Error("duplicate_must_never_execute"); });
      const authorize = vi.fn(async () => {});
      const supervisor = new EnvironmentClockSupervisor({ executable: process.execPath, review,
        resolveEntry: async () => ({ entryPath: path.join(root, "unused-clock.cjs"), installation: context.installation }),
        authorize, processRunner: { run }, observationJournal: journal, now: () => crashTime });
      expect(await supervisor.recoverObservation(context.owner, context.request)).toEqual(history);
      await expect(supervisor.observe(context.owner, context.request)).rejects.toThrow(denial);
      expect(authorize).toHaveBeenCalledTimes(2); expect(run).not.toHaveBeenCalled();
      expect(supervisor.status(context.owner)).toMatchObject({ running: false, fenced: false });
      expect(inventory(journalRoot)).toEqual(before);
      fs.writeFileSync(path.join(root, "verification.json"), JSON.stringify({ boundary, pid: child.pid, exitResult,
        childAbsent: true, delivered: false, historyState: history.state, historyFresh: history.fresh,
        replayDenial: denial, runnerCalls: run.mock.calls.length, filesUnchanged: true, files: before,
        fixtureSha256: hash(fixture), journalSourceSha256: hash("apps/desktop/src/environment-clock-observation-journal.ts"),
        supervisorSourceSha256: hash("apps/desktop/src/environment-clock-supervisor.ts") }, null, 2) + "\n");
    } finally {
      if (!terminated && child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exit; }
    }
  }, 12000);
});
