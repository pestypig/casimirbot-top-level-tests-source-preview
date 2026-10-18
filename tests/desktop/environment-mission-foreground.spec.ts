import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyMinecraftForegroundEvidence, probeMinecraftForeground } from
  "../../apps/desktop/src/environment-mission-foreground";

const now = Date.parse("2026-09-30T12:00:00.000Z");
const player = { clientProcessId: 4242,
  clientProcessStartedAt: "2026-09-30T11:00:00.000Z" };
const observation = () => ({
  schema: "helix.minecraft.hud_foreground_window.v1",
  status: "observed", client_process_id: 4242,
  client_process_started_at: "2026-09-30T11:00:00.123Z",
  bounds_physical: { x: -8, y: -8, width: 1920, height: 1080 },
  observed_at: new Date(now - 100).toISOString(),
  credential_included: false, input_sent: false,
});
const verify = (value: unknown, changed: Partial<Parameters<
  typeof verifyMinecraftForegroundEvidence>[0]> = {}) =>
  verifyMinecraftForegroundEvidence({ raw: JSON.stringify(value), player,
    physicalToDip: bounds => ({ ...bounds, width: bounds.width / 2,
      height: bounds.height / 2 }), nowMs: now, ...changed });

describe("native Minecraft foreground evidence", () => {
  it("matches OS process and start time to the separate fresh Fabric status", () => {
    expect(verify(observation())).toEqual({ clientProcessId: 4242,
      foreground: true, bounds: { x: -8, y: -8, width: 960, height: 540 } });
  });

  it("rejects PID reuse, stale foreground, hidden/unavailable and malformed evidence", () => {
    expect(verify({ ...observation(), client_process_id: 99 })).toBeNull();
    expect(verify({ ...observation(), client_process_started_at: "2026-09-30T10:59:58Z" }))
      .toBeNull();
    expect(verify({ ...observation(), observed_at: new Date(now - 1_501).toISOString() }))
      .toBeNull();
    expect(verify({ ...observation(), status: "unavailable" })).toBeNull();
    expect(verify({ ...observation(), input_sent: true })).toBeNull();
    expect(verify({ ...observation(), title: "Minecraft" })).toBeNull();
    expect(verify({ ...observation(), bounds_physical: { x: 0, y: 0,
      width: -1, height: 900 } })).toBeNull();
    expect(verifyMinecraftForegroundEvidence({ raw: "{", player,
      physicalToDip: bounds => bounds, nowMs: now })).toBeNull();
  });

  it("rejects invalid DPI conversion and an unsafe oversized result", () => {
    expect(verify(observation(), { physicalToDip: () => ({ x: 0, y: 0,
      width: Number.NaN, height: 100 }) })).toBeNull();
    expect(verifyMinecraftForegroundEvidence({ raw: "x".repeat(5_000), player,
      physicalToDip: bounds => bounds, nowMs: now })).toBeNull();
  });

  it("runs only the fixed packaged script name and fails closed on probe errors", async () => {
    const runProbe = vi.fn(async (_scriptPath: string) => JSON.stringify(observation()));
    expect(await probeMinecraftForeground({ runtimeRoot: "C:\\sealed-runtime",
      player, physicalToDip: bounds => bounds, nowMs: now, runProbe })).toEqual(
        expect.objectContaining({ clientProcessId: 4242, foreground: true }));
    expect(runProbe).toHaveBeenCalledWith(
      "C:\\sealed-runtime\\scripts\\helix-minecraft-hud-foreground.ps1");
    const failingProbe = vi.fn(async (_scriptPath: string): Promise<string> => {
      throw new Error("native probe unavailable");
    });
    expect(await probeMinecraftForeground({ runtimeRoot: "C:\\sealed-runtime",
      player, physicalToDip: bounds => bounds, nowMs: now,
      runProbe: failingProbe })).toBeNull();
  });

  it("rejects a modified packaged probe before invoking PowerShell", async () => {
    const runtimeRoot = mkdtempSync(path.join(tmpdir(), "casimir-hud-probe-"));
    try {
      mkdirSync(path.join(runtimeRoot, "scripts"));
      const script = path.join(runtimeRoot, "scripts",
        "helix-minecraft-hud-foreground.ps1");
      writeFileSync(script, "signed-probe");
      const digest = createHash("sha256").update("signed-probe").digest("hex");
      const runProbe = vi.fn(async () => JSON.stringify(observation()));
      expect(await probeMinecraftForeground({ runtimeRoot, player,
        physicalToDip: bounds => bounds, expectedScriptSha256: digest,
        nowMs: now, runProbe })).not.toBeNull();
      writeFileSync(script, "changed-probe");
      expect(await probeMinecraftForeground({ runtimeRoot, player,
        physicalToDip: bounds => bounds, expectedScriptSha256: digest,
        nowMs: now, runProbe })).toBeNull();
      expect(runProbe).toHaveBeenCalledTimes(1);
    } finally { rmSync(runtimeRoot, { recursive: true, force: true }); }
  });
});
