import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { latestPrivateLaunch, privateLaunchPaths, requirePrivateProcessAbsent } from "../scripts/environment-packages/private-clock-launch-records.mjs";

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "private-launch-records-"));
  roots.push(root); return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("private-launch-records-")) throw Error("cleanup_scope_invalid");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
describe("private candidate restart records", () => {
  it("preserves initial launch paths without creating any files", () => {
    const root = fixture();
    expect(privateLaunchPaths(root, null)).toEqual({launchPath:path.join(root,"launch.json"),logPath:path.join(root,"private-app.log")});
    expect(fs.readdirSync(root)).toEqual([]);
  });
  it("requires explicit resume and preserves old receipt/log bytes", () => {
    const root = fixture(), prior = path.join(root, "launch.json"), log = path.join(root, "private-app.log");
    fs.writeFileSync(prior, "original receipt"); fs.writeFileSync(log, "original log");
    expect(() => privateLaunchPaths(root, null)).toThrow("candidate_already_launched_use_recorded_profile");
    expect(privateLaunchPaths(root, prior)).toEqual({launchPath:path.join(root,"launch-0002.json"),logPath:path.join(root,"private-app-0002.log")});
    expect(fs.readFileSync(prior,"utf8")).toBe("original receipt"); expect(fs.readFileSync(log,"utf8")).toBe("original log");
  });
  it("requires newest receipt rather than an older exited host or another candidate", () => {
    const root = fixture(), first = path.join(root,"launch.json"), second = path.join(root,"launch-0002.json");
    fs.writeFileSync(first,"{}"); fs.writeFileSync(second,"{}");
    expect(() => privateLaunchPaths(root,first)).toThrow("resume_latest_launch_required");
    expect(() => privateLaunchPaths(root,path.join(fixture(),"launch.json"))).toThrow("resume_latest_launch_required");
    expect(privateLaunchPaths(root,second).launchPath).toBe(path.join(root,"launch-0003.json"));
    expect(latestPrivateLaunch(root)).toEqual({path:second,sequence:2});
  });
  it("exclusive next log reservation prevents two spawns from sharing one receipt", () => {
    const root = fixture(), first = path.join(root,"launch.json"); fs.writeFileSync(first,"{}");
    const a = privateLaunchPaths(root,first), b = privateLaunchPaths(root,first);
    fs.closeSync(fs.openSync(a.logPath,"wx"));
    expect(() => fs.openSync(b.logPath,"wx")).toThrow();
    expect(fs.existsSync(a.launchPath)).toBe(false);
  });
  it.each(["launch-0001.json","launch-00002.json","launch-9007199254740992.json"])("rejects ambiguous sequence %s", name => {
    const root=fixture();fs.writeFileSync(path.join(root,name),"{}");
    expect(()=>latestPrivateLaunch(root)).toThrow("launch_record_sequence_invalid");
  });
  it("treats only ESRCH as process absence", () => {
    expect(()=>requirePrivateProcessAbsent(123,()=>{})).toThrow("resume_process_still_present");
    expect(()=>requirePrivateProcessAbsent(123,()=>{throw Object.assign(Error("denied"),{code:"EPERM"});})).toThrow("denied");
    expect(()=>requirePrivateProcessAbsent(123,()=>{throw Object.assign(Error("gone"),{code:"ESRCH"});})).not.toThrow();
  });
  it.each([0,-1,NaN,1.5])("rejects invalid PID %s before probing", pid=> {
    expect(()=>requirePrivateProcessAbsent(pid,()=>{throw Error("must_not_probe");})).toThrow("resume_process_identity_invalid");
  });
});
