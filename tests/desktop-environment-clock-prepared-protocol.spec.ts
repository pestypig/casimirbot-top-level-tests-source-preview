import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const processMock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => processMock);
import { WindowsPreparedClockSession } from "../apps/desktop/src/environment-clock-prepared-runner";

class Child extends EventEmitter {
  stdin = new PassThrough(); stdout = new PassThrough(); stderr = new PassThrough();
  written: Buffer[] = [];
  kill = vi.fn(() => { queueMicrotask(() => this.emit("close", null, "SIGKILL")); return true; });
  constructor() { super(); this.stdin.on("data", bytes => this.written.push(Buffer.from(bytes))); }
  frame(value: unknown) { this.stdout.write(JSON.stringify(value) + "\n"); }
}
const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
let config: Parameters<typeof WindowsPreparedClockSession.prepare>[0], child: Child, recoveries: Child[], badRecovery: boolean;
const prepare = () => WindowsPreparedClockSession.prepare(config, new AbortController().signal);
const ready = async () => { const promise = prepare(); child.frame({ type: "ready", version: 2, pid: 4242 }); return promise; };
const input = () => ({ entryPath: config.entryPath, input: Buffer.from('{"fixture":true}'), signal: new AbortController().signal,
  onSpawn: vi.fn(), beforeExecute: vi.fn(async (): Promise<void> => {}) });
describe.skipIf(process.platform !== "win32")("prepared runner controlled transport faults", () => {
  beforeAll(() => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "g16a-protocol-fixture-"));
    const helperPath = path.join(root, "helper.exe"), entryPath = path.join(root, "clock.cjs");
    fs.writeFileSync(helperPath, "not executable; spawn is mocked"); fs.writeFileSync(entryPath, "fixture");
    config = { helperPath, helperSha256: sha(helperPath), entryPath, entrySha256: sha(entryPath), runtimeSha256: "a".repeat(64), leaseRoot: root };
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); recoveries = []; badRecovery = false;
    processMock.spawn.mockReset().mockImplementation((_file, args) => {
      const created = new Child();
      if (args[0] === "prepare") child = created;
      else { recoveries.push(created); queueMicrotask(() => {
        created.frame(badRecovery ? { type: "result", version: 2 } : { type: "recovered", version: 2 }); created.emit("close", 0, null);
      }); }
      return created;
    });
  });
  afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

  it("times out preparation and confirms recovery before rejection", async () => {
    const preparing = prepare(), rejected = expect(preparing).rejects.toMatchObject({ code: "clock_preparation_timeout" });
    await vi.advanceTimersByTimeAsync(9999); expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await rejected;
    expect(child.written).toHaveLength(0); expect(recoveries).toHaveLength(1);
  });
  it.each([
    ["invalid JSON", "not-json\n"],
    ["wrong version", JSON.stringify({ type: "ready", version: 1, pid: 1 }) + "\n"],
    ["extra field", JSON.stringify({ type: "ready", version: 2, pid: 1, authorized: true }) + "\n"],
    ["invalid PID", JSON.stringify({ type: "ready", version: 2, pid: -1 }) + "\n"],
    ["result before readiness", JSON.stringify({ type: "result", version: 2, outputBase64: "e30=" }) + "\n"],
  ])("rejects %s before transmitting any request", async (_name, text) => {
    const preparing = prepare(), rejected = expect(preparing).rejects.toMatchObject({ code: "clock_native_protocol_invalid" });
    child.stdout.write(text); await rejected;
    expect(child.written).toHaveLength(0); expect(child.kill).toHaveBeenCalled(); expect(recoveries).toHaveLength(1);
  });
  it.each(["stdout", "stderr"] as const)("bounds %s during preparation", async stream => {
    const preparing = prepare(), rejected = expect(preparing).rejects.toMatchObject({ code: "clock_native_output_limit" });
    child[stream].write(Buffer.alloc(stream === "stdout" ? 96 * 1024 + 1 : 4097, 120)); await rejected;
    expect(child.written).toHaveLength(0); expect(recoveries).toHaveLength(1);
  });
  it("rejects unsolicited output while admission is pending and ignores its late success", async () => {
    const session = await ready(), gate = deferred(), entered = deferred(), call = input();
    call.beforeExecute = vi.fn(async () => { entered.resolve(); await gate.promise; });
    const result = session.run(call), rejected = expect(result).rejects.toMatchObject({ code: "clock_native_protocol_invalid" });
    await entered.promise; expect(child.written).toHaveLength(0);
    child.frame({ type: "result", version: 2, outputBase64: "e30=" }); await rejected;
    gate.resolve(); await Promise.resolve(); await Promise.resolve(); expect(child.written).toHaveLength(0);
    expect(session.status().phase).toBe("closed"); expect(recoveries).toHaveLength(1);
  });
  it("does not extend idle readiness on a duplicate ready frame", async () => {
    const session = await ready(); child.frame({ type: "ready", version: 2, pid: 4242 });
    await expect(session.run(input())).rejects.toMatchObject({ code: "clock_native_protocol_invalid" });
    expect(child.written).toHaveLength(0); expect(recoveries).toHaveLength(1);
  });
  it("rejects noncanonical result encoding after GO", async () => {
    const session = await ready(), call = input(), result = session.run(call);
    const rejected = expect(result).rejects.toMatchObject({ code: "clock_native_protocol_invalid" });
    await vi.advanceTimersByTimeAsync(0); expect(Buffer.concat(child.written).at(-1)).toBe(0x47);
    child.frame({ type: "result", version: 2, outputBase64: " e30=" }); await rejected; expect(recoveries).toHaveLength(1);
  });
  it("cancels after GO and ignores a later native result", async () => {
    const session = await ready(), call = input(), abort = new AbortController(); call.signal = abort.signal;
    const result = session.run(call), rejected = expect(result).rejects.toMatchObject({ code: "clock_stopped" });
    await vi.advanceTimersByTimeAsync(0); expect(Buffer.concat(child.written).at(-1)).toBe(0x47);
    abort.abort(); await rejected; child.frame({ type: "result", version: 2, outputBase64: "e30=" });
    expect(session.status().phase).toBe("closed"); expect(recoveries).toHaveLength(1);
  });
  it("keeps failed recovery typed instead of reporting successful cancellation", async () => {
    const session = await ready(); badRecovery = true;
    await expect(session.stop()).rejects.toMatchObject({ code: "clock_stop_unconfirmed" });
    await expect(session.stop()).rejects.toMatchObject({ code: "clock_stop_unconfirmed" });
    expect(recoveries).toHaveLength(1);
  });
});
