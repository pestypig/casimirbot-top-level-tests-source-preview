import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { readPreferredDesktopPort, rememberHealthyDesktopPort, reserveDesktopLoopbackPort } from "../apps/desktop/src/loopback-origin";

const folders: string[] = [];
const listeners: Server[] = [];
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "casimir-loopback-test-"));
  folders.push(dir); mkdirSync(path.join(dir, "state")); return dir;
}
afterEach(async () => {
  for (const server of listeners.splice(0)) if (server.listening) {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("native loopback address continuity", () => {
  it("reuses an OS-allocated healthy address with no stored secret or readiness authority", async () => {
    const dir = fixture();
    expect(readPreferredDesktopPort(dir)).toBeNull();
    const port = await reserveDesktopLoopbackPort(null);
    rememberHealthyDesktopPort(dir, port);
    expect(JSON.parse(readFileSync(path.join(dir, "state", "desktop-loopback-preference.json"), "utf8")))
      .toEqual({ schema: "casimir_desktop_loopback_preference/1", port });
    expect(await reserveDesktopLoopbackPort(readPreferredDesktopPort(dir))).toBe(port);
  });
  it("uses a prior package's non-secret receipt only as an address preference", () => {
    const dir = fixture();
    writeFileSync(path.join(dir, "state", "desktop-service-ready.json"), JSON.stringify({
      schema: "casimir_desktop_service_ready_receipt/1", ready: true,
      origin: "http://127.0.0.1:51234", serviceProcessId: 123, readyAt: "2020-01-01T00:00:00Z",
    }));
    expect(readPreferredDesktopPort(dir)).toBe(51234);
    rememberHealthyDesktopPort(dir, 51235);
    expect(readPreferredDesktopPort(dir)).toBe(51235);
  });
  it("falls back without connecting to or stopping an occupied preferred port", async () => {
    let connections = 0;
    const occupant = createServer(() => connections++); listeners.push(occupant);
    await new Promise<void>(resolve => occupant.listen(0, "127.0.0.1", resolve));
    const address = occupant.address();
    if (!address || typeof address === "string") throw new Error("fixture_address_missing");
    const port = await reserveDesktopLoopbackPort(address.port);
    expect(port).not.toBe(address.port);
    expect(occupant.listening).toBe(true);
    expect(connections).toBe(0);
  });
  it.each(["https://127.0.0.1:51234", "http://localhost:51234", "http://192.168.1.1:51234",
    "http://127.0.0.1:51234/", "http://127.0.0.1:51234?x=1", "http://user:secret@127.0.0.1:51234",
    "http://127.0.0.1:80", "http://127.0.0.1:65536", "http://127.0.0.1:051234"])
  ("rejects an invalid legacy origin: %s", origin => {
    const dir = fixture();
    writeFileSync(path.join(dir, "state", "desktop-service-ready.json"), JSON.stringify({
      schema: "casimir_desktop_service_ready_receipt/1", ready: true, origin,
    }));
    expect(readPreferredDesktopPort(dir)).toBeNull();
  });
  it.each(["not json", JSON.stringify({ schema: "foreign", port: 51234 }),
    JSON.stringify({ schema: "casimir_desktop_loopback_preference/1", port: "51234" }),
    " ".repeat(4097)])("ignores malformed preference bytes", bytes => {
    const dir = fixture();
    writeFileSync(path.join(dir, "state", "desktop-loopback-preference.json"), bytes);
    expect(readPreferredDesktopPort(dir)).toBeNull();
  });
  it("does not accept a receipt which reports startup incomplete", () => {
    const dir = fixture();
    writeFileSync(path.join(dir, "state", "desktop-service-ready.json"), JSON.stringify({
      schema: "casimir_desktop_service_ready_receipt/1", ready: false, origin: "http://127.0.0.1:51234",
    }));
    expect(readPreferredDesktopPort(dir)).toBeNull();
  });
});
