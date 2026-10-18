import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  installProcessOutputGuards,
  writeProcessDiagnostic,
} from "../apps/desktop/src/process-output";

class FakeDiagnosticStream extends EventEmitter {
  destroyed = false;
  writable = true;
  readonly chunks: string[] = [];
  writeError: Error | null = null;

  write(chunk: string): boolean {
    if (this.writeError) throw this.writeError;
    this.chunks.push(chunk);
    return true;
  }
}

describe("desktop process output", () => {
  it("absorbs an inherited-stream EPIPE instead of crashing Electron", () => {
    const stream = new FakeDiagnosticStream();

    installProcessOutputGuards([stream]);

    expect(() =>
      stream.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })),
    ).not.toThrow();
    expect(stream.listenerCount("error")).toBe(1);
  });

  it("installs only one guard per stream", () => {
    const stream = new FakeDiagnosticStream();

    installProcessOutputGuards([stream]);
    installProcessOutputGuards([stream]);

    expect(stream.listenerCount("error")).toBe(1);
  });

  it("keeps diagnostic writes best-effort", () => {
    const stream = new FakeDiagnosticStream();
    writeProcessDiagnostic(stream, "ready");
    expect(stream.chunks).toEqual(["ready\n"]);

    stream.writeError = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    expect(() => writeProcessDiagnostic(stream, "ignored")).not.toThrow();

    stream.destroyed = true;
    stream.writeError = null;
    writeProcessDiagnostic(stream, "also ignored");
    expect(stream.chunks).toEqual(["ready\n"]);
  });
});
