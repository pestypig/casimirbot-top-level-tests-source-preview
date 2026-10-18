import { describe, expect, it, vi } from "vitest";

import {
  encodeRconPacket,
  parseArenaFixture,
  parseServerProperties,
  parseStdinReadinessLine,
  parseLocalPlayerRuntimeStatus,
  runArenaFixtureSupervisor,
  type ArenaReadiness,
} from "../scripts/helix-minecraft-arena-fixture-supervisor";

const fixture = parseArenaFixture({
  schema: "helix.minecraft.arena_fixture.v1",
  fixture_id: "fixture:test",
  setup_commands: ["stage"],
  release_commands: ["release"],
  cleanup_commands: ["cleanup"],
});

const exact = (overrides: Partial<ArenaReadiness> = {}): ArenaReadiness => ({
  action_authority_id: "authority:exact",
  ready_for_actions: true,
  heartbeat_fresh: true,
  active_workflow_count: 1,
  controls_asserted: true,
  ...overrides,
});

const harness = (samples: ArenaReadiness[][]) => {
  let clock = 0;
  let cursor = 0;
  const executeCommands = vi.fn(async () => undefined);
  const events: Array<{ event: string; reason?: string }> = [];
  return {
    executeCommands,
    events,
    run: () => runArenaFixtureSupervisor({
      actionAuthorityId: "authority:exact",
      fixture,
      executeCommands,
      readReadiness: async () => samples[Math.min(cursor++, samples.length - 1)] ?? [],
      emit: (entry) => events.push(entry),
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
      pollIntervalMs: 10,
      admissionTimeoutMs: 31,
      activeTimeoutMs: 31,
    }),
  };
};

describe("Minecraft arena fixture supervisor", () => {
  it("requires two consecutive fresh active-workflow samples before release", async () => {
    const test = harness([
      [exact()],
      [exact({ heartbeat_fresh: false })],
      [exact()],
      [exact()],
      [exact({ active_workflow_count: 0 })],
    ]);
    await test.run();
    expect(test.executeCommands.mock.calls.map(([commands]) => commands)).toEqual([
      fixture.setup_commands,
      fixture.release_commands,
      fixture.cleanup_commands,
    ]);
    expect(test.events.map((entry) => entry.event)).toEqual([
      "fixture_staged",
      "workflow_admission_confirmed",
      "fixture_released",
      "containment_triggered",
      "fixture_cleaned",
      "supervisor_complete",
    ]);
    expect(test.events.find((entry) => entry.event === "containment_triggered")?.reason)
      .toBe("workflow_inactive");
  });

  it.each([
    ["stale heartbeat", [exact({ heartbeat_fresh: false })]],
    ["no active workflow", [exact({ active_workflow_count: 0 })]],
    ["wrong authority", [{ ...exact(), action_authority_id: "authority:other" }]],
  ])("never releases for %s and still cleans", async (_label, sample) => {
    const test = harness([sample as ArenaReadiness[]]);
    await expect(test.run()).rejects.toThrow("arena_workflow_admission_timeout");
    expect(test.executeCommands.mock.calls.map(([commands]) => commands)).toEqual([
      fixture.setup_commands,
      fixture.cleanup_commands,
    ]);
  });

  it("contains immediately when the exact authority projection disappears", async () => {
    const test = harness([[exact()], [exact()], []]);
    await test.run();
    expect(test.events.find((entry) => entry.event === "containment_triggered")?.reason)
      .toBe("authority_projection_missing");
    expect(test.executeCommands).toHaveBeenLastCalledWith(fixture.cleanup_commands);
  });

  it("cleans on readiness errors after staging", async () => {
    const executeCommands = vi.fn(async () => undefined);
    await expect(runArenaFixtureSupervisor({
      actionAuthorityId: "authority:exact",
      fixture,
      executeCommands,
      readReadiness: async () => { throw new Error("readiness_unavailable"); },
      sleep: async () => undefined,
    })).rejects.toThrow("readiness_unavailable");
    expect(executeCommands.mock.calls.map(([commands]) => commands)).toEqual([
      fixture.setup_commands,
      fixture.cleanup_commands,
    ]);
  });

  it("parses RCON properties without requiring callers to expose the secret", () => {
    const properties = parseServerProperties(
      "# local test\nenable-rcon=true\nrcon.port=25576\nrcon.password=opaque-value\n",
    );
    expect(properties.get("enable-rcon")).toBe("true");
    expect(properties.get("rcon.password")).toBe("opaque-value");
    expect(JSON.stringify([...properties.keys()])).not.toContain("opaque-value");
  });

  it("encodes Source RCON packets with bounded framing", () => {
    const packet = encodeRconPacket(7, 2, "list");
    expect(packet.readInt32LE(0)).toBe(packet.length - 4);
    expect(packet.readInt32LE(4)).toBe(7);
    expect(packet.readInt32LE(8)).toBe(2);
    expect(packet.subarray(12, -2).toString("utf8")).toBe("list");
    expect(packet.readInt16LE(packet.length - 2)).toBe(0);
  });

  it("reduces stdin MCP projections to the credential-free readiness fields", () => {
    expect(parseStdinReadinessLine(JSON.stringify({
      connector_readiness: [{
        action_authority_id: "authority:exact",
        ready_for_actions: true,
        heartbeat_fresh: true,
        active_workflow_count: 1,
        controls_asserted: false,
        injected_command: "op attacker",
        credential: "must-not-survive",
      }],
    }))).toEqual([{
      action_authority_id: "authority:exact",
      ready_for_actions: true,
      heartbeat_fresh: true,
      active_workflow_count: 1,
      controls_asserted: false,
    }]);
  });

  it("derives fresh active readiness from the credential-free player sidecar", () => {
    const now = Date.parse("2026-08-31T05:00:01Z");
    expect(parseLocalPlayerRuntimeStatus(JSON.stringify({
      schema: "helix.minecraft.player_local_runtime_status.v1",
      action_authority_id: "authority:exact",
      ready_for_actions: true,
      last_heartbeat_accepted_at: "2026-08-31T05:00:00Z",
      active_workflow_id: "workflow:active",
      controls_asserted: true,
      emergency_stop_latched: false,
      manual_input_detected: false,
      updated_at: "2026-08-31T05:00:00.750Z",
    }), now)).toEqual([exact()]);
  });

  it("fails local readiness closed when the projection or heartbeat is stale", () => {
    const now = Date.parse("2026-08-31T05:01:00Z");
    expect(parseLocalPlayerRuntimeStatus(JSON.stringify({
      schema: "helix.minecraft.player_local_runtime_status.v1",
      action_authority_id: "authority:exact",
      ready_for_actions: true,
      last_heartbeat_accepted_at: "2026-08-31T05:00:00Z",
      active_workflow_id: "workflow:active",
      controls_asserted: true,
      updated_at: "2026-08-31T05:00:00Z",
    }), now)).toEqual([exact({
      ready_for_actions: false,
      heartbeat_fresh: false,
    })]);
  });
});
