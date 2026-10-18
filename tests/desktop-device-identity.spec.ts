import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadOrCreateDesktopDeviceIdentity } from
  "../apps/desktop/src/device-identity";

describe("desktop device identity", () => {
  it("creates a stable opaque identity under the exact user-data root", () => {
    const root = mkdtempSync(path.join(tmpdir(), "casimir-device-"));
    const first = loadOrCreateDesktopDeviceIdentity({
      userDataPath: root,
      now: () => new Date("2026-08-27T21:00:00.000Z"),
      random: (size) => Buffer.alloc(size, 9),
    });
    const second = loadOrCreateDesktopDeviceIdentity({ userDataPath: root });
    expect(first).toEqual(second);
    expect(first.deviceId).toMatch(/^desktop_device_[A-Za-z0-9_-]{22}$/u);
    expect(JSON.parse(readFileSync(
      path.join(root, "state", "device-identity.v1.json"), "utf8",
    ))).toEqual(first);
  });

  it("fails closed instead of silently replacing invalid identity state", () => {
    const root = mkdtempSync(path.join(tmpdir(), "casimir-device-invalid-"));
    loadOrCreateDesktopDeviceIdentity({
      userDataPath: root,
      random: (size) => Buffer.alloc(size, 3),
    });
    writeFileSync(
      path.join(root, "state", "device-identity.v1.json"),
      JSON.stringify({ schema: "wrong", deviceId: "attacker" }),
      "utf8",
    );
    expect(() => loadOrCreateDesktopDeviceIdentity({ userDataPath: root }))
      .toThrow("Desktop device identity state is invalid");
  });
});
