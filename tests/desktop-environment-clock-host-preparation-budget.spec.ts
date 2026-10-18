import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePrivateClockHost } from "../apps/desktop/src/environment-private-clock-host";

let root: string, host: NativePrivateClockHost | undefined;
const fixture = () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  root = fs.mkdtempSync(path.join(os.tmpdir(), "g16a-clock-budget-"));
  host = new NativePrivateClockHost({ userDataPath: root, deviceId: `desktop_device_${"b".repeat(22)}`,
    runtime: { executable: path.join(root, "unused-node.exe"), sha256: "a".repeat(64), helperPath: path.join(root, "unused-helper.exe"), helperSha256: "b".repeat(64) },
    preparedHelper: { path: path.join(root, "unused-prepared.exe"), sha256: "c".repeat(64) }, featureEnabled: () => true, runtimeEnabled: () => true,
    readAccount: () => new Promise(() => {}), readPolicy: async () => { throw Error("unexpected_policy_read"); },
    readRuntimePolicy: async () => { throw Error("unexpected_runtime_read"); }, selectArchive: async () => null });
  return host;
};
afterEach(async () => { await host?.close(); host = undefined; vi.useRealTimers(); if (root) fs.rmdirSync(root); });
describe("complete native host preparation budget", () => {
  it("cancels the whole preparation at the original ten-second ceiling", async () => {
    const native = fixture(); let settled = false;
    const pending = native.prepare().finally(() => { settled = true; });
    const rejected = expect(pending).rejects.toMatchObject({ code: "clock_preparation_timeout" });
    await vi.advanceTimersByTimeAsync(9999); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await rejected;
    expect(native.status()).toMatchObject({ preparing: false, ready: false, running: false, fenced: false });
    expect(fs.readdirSync(root)).toEqual([]);
  });
  it("does not make explicit Stop wait for the preparation ceiling", async () => {
    const native = fixture(), pending = native.prepare();
    const rejected = expect(pending).rejects.toMatchObject({ code: "clock_stopped" });
    await vi.advanceTimersByTimeAsync(1000); await native.stop(); await rejected;
    expect(Date.now()).toBe(Date.parse("2026-09-26T12:00:01Z"));
    expect(native.status()).toMatchObject({ preparing: false, ready: false, running: false, fenced: false });
    expect(fs.readdirSync(root)).toEqual([]);
  });
});
