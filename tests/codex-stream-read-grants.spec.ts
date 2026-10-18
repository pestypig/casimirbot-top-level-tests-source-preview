import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodexStreamReadGrants, isCodexStreamRoomId } from "../apps/desktop/src/codex-stream-read-grants";

const paths: string[] = [];
afterEach(() => {
  for (const dir of paths.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const storage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value),
  decryptString: (value: Buffer) => value.toString(),
};
const a = "01a120f1-66fb-7923-baa7-2c3569addfa2";
const room = "shared_realtime_room:ce03ad8e-62e2-4feb-9e47-48a8f6caff64";
const approval = { approvalId: "ce03ad8e-62e2-4feb-9e47-48a8f6caff64",
  expiresAt: "2100-01-01T00:00:00.000Z", durationHours: 8 as const };

it("accepts hosted room IDs for resume and rejects unrelated references", () => {
  expect(isCodexStreamRoomId(room)).toBe(true);
  expect(isCodexStreamRoomId("ce03ad8e-62e2-4feb-9e47-48a8f6caff64")).toBe(true);
  expect(isCodexStreamRoomId("other:ce03ad8e-62e2-4feb-9e47-48a8f6caff64")).toBe(false);
});

it("persists an exact local grant through restart and clears it on sign-out", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "casimir-stream-grants-"));
  paths.push(dir);
  const first = new CodexStreamReadGrants({ userDataPath: dir, deviceId: "device-a", storage });
  first.add("owner-a", `codex://threads/${a}`, "Source A", null);
  first.saveResumeSelection("owner-a", room, "all", [`codex-thread:${a}`], approval);
  const restarted = new CodexStreamReadGrants({ userDataPath: dir,
    deviceId: "device-a", storage });
  expect(restarted.list("owner-a")).toHaveLength(1);
  expect(restarted.has("owner-a", `codex-thread:${a}`)).toBe(true);
  expect(restarted.resumeSelection("owner-a", room)).toEqual({
    mode: "all", sourceRefs: [`codex-thread:${a}`], ...approval,
  });
  restarted.clear();
  expect(restarted.list("owner-a")).toEqual([]);
  expect(restarted.resumeSelection("owner-a", room)).toBeNull();
});

it("clears automatic resume on explicit stop or read-grant revocation", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "casimir-stream-grants-"));
  paths.push(dir);
  const grants = new CodexStreamReadGrants({ userDataPath: dir, deviceId: "device-a", storage });
  grants.add("owner-a", `codex://threads/${a}`, "Source A", null);
  grants.saveResumeSelection("owner-a", room, "selected", [`codex-thread:${a}`], approval);
  grants.clearResumeSelection("owner-a", room);
  expect(grants.resumeSelection("owner-a", room)).toBeNull();
  grants.saveResumeSelection("owner-a", room, "all", [`codex-thread:${a}`], approval);
  grants.revoke("owner-a", `codex-thread:${a}`);
  expect(grants.resumeSelection("owner-a", room)).toBeNull();
});

it("does not carry a grant across an account or device change", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "casimir-stream-grants-"));
  paths.push(dir);
  const first = new CodexStreamReadGrants({ userDataPath: dir, deviceId: "device-a", storage });
  first.add("owner-a", `codex://threads/${a}`, "Source A", null);
  expect(new CodexStreamReadGrants({ userDataPath: dir, deviceId: "device-b", storage })
    .list("owner-a")).toEqual([]);
  first.add("owner-a", `codex://threads/${a}`, "Source A", null);
  expect(first.list("owner-b")).toEqual([]);
});
