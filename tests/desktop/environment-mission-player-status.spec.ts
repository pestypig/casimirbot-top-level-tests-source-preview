import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { HelixOwnerMissionActivityPage } from
  "../../shared/helix-environment-mission-activity-page";
import { readCurrentMinecraftPlayerStatus } from
  "../../apps/desktop/src/environment-mission-player-status";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const now = Date.parse("2026-09-30T12:00:00.000Z");
const sessionIdentity: HelixOwnerMissionActivityPage["session_identity"] = {
  mission_id: "mission:one", mission_revision: 1, binding_epoch: 2,
  producer_epoch_ref: "producer:one", action_authority_ref: "authority:one",
  scope: { schema: "helix.environment_mission_activity_scope.v1",
    profile_ref: "profile:one", node_ref: "node:one", run_id: "run:one",
    room_ref: "room:one", environment_binding_ref: "binding:one",
    source_ref: "source:one", world_ref: "world:one" },
};
const status = () => ({
  schema: "helix.minecraft.player_local_runtime_status.v1",
  client_process_id: 4242, client_process_started_at: "2026-09-30T11:00:00.000Z",
  action_authority_id: "authority:one", producer_epoch_ref: "producer:one",
  ready_for_actions: true, last_heartbeat_accepted_at: new Date(now - 200).toISOString(),
  active_workflow_id: null, workflow_state: "idle", controls_asserted: false,
  emergency_stop_latched: false, manual_input_detected: false, controls_released: true,
  updated_at: new Date(now - 100).toISOString(), credential_included: false,
  content_role: "minecraft_player_local_runtime_status_not_assistant_answer",
  answer_authority: false, assistant_answer: false, terminal_eligible: false,
  raw_content_included: false,
});
const fixture = (value: unknown) => {
  const directory = mkdtempSync(path.join(tmpdir(), "casimir-hud-status-"));
  directories.push(directory);
  mkdirSync(path.join(directory, "config"));
  writeFileSync(path.join(directory, "config", "helix-fabric-player-agent.runtime-status.json"),
    JSON.stringify(value));
  return directory;
};

describe("native HUD companion-status prerequisite", () => {
  it("accepts only a fresh exact authority and producer-epoch match", () => {
    const directory = fixture(status());
    expect(readCurrentMinecraftPlayerStatus({ playerGameDirectory: directory,
      sessionIdentity, nowMs: now })).toEqual({ clientProcessId: 4242,
      clientProcessStartedAt: "2026-09-30T11:00:00.000Z" });
    expect(readCurrentMinecraftPlayerStatus({ playerGameDirectory: directory,
      sessionIdentity: { ...sessionIdentity, producer_epoch_ref: "producer:rotated" }, nowMs: now }))
      .toBeNull();
    expect(readCurrentMinecraftPlayerStatus({ playerGameDirectory: directory,
      sessionIdentity: { ...sessionIdentity, action_authority_ref: "authority:revoked" }, nowMs: now }))
      .toBeNull();
    expect(readCurrentMinecraftPlayerStatus({ playerGameDirectory: directory,
      sessionIdentity, nowMs: now + 1_501 })).toBeNull();
  });

  it("fails closed on manual override, Emergency Stop, stale heartbeat and forged authority flags", () => {
    for (const poisoned of [
      { manual_input_detected: true }, { emergency_stop_latched: true },
      { last_heartbeat_accepted_at: new Date(now - 6_000).toISOString() },
      { action_authority_granted: true }, { credential_included: true },
    ]) {
      const directory = fixture({ ...status(), ...poisoned });
      expect(readCurrentMinecraftPlayerStatus({ playerGameDirectory: directory,
        sessionIdentity, nowMs: now })).toBeNull();
    }
  });

  it("rejects absent, malformed and oversized fixed-path status files", () => {
    expect(readCurrentMinecraftPlayerStatus({ playerGameDirectory: null,
      sessionIdentity, nowMs: now })).toBeNull();
    expect(readCurrentMinecraftPlayerStatus({ playerGameDirectory: fixture({}),
      sessionIdentity, nowMs: now })).toBeNull();
    const directory = fixture({ ...status(), padding: "x".repeat(5_000) });
    expect(readCurrentMinecraftPlayerStatus({ playerGameDirectory: directory,
      sessionIdentity, nowMs: now })).toBeNull();
  });
});
