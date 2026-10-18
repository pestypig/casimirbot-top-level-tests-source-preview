import assert from "node:assert/strict";
import { test } from "vitest";
import { createRecordingAskTurnSink } from "../server/services/situation-room/ask-turn-sink.ts";
import { runLiveScenarioLoop } from "../server/services/situation-room/live-scenario-loop.ts";
import { buildMinecraftAskEvidencePack } from "../server/services/situation-room/minecraft-ask-evidence-pack-builder.ts";
import { buildEndReturnRouteRehearsal } from "../server/services/situation-room/minecraft-end-return-route-builder.ts";
import { evaluateRouteDrift, monitorRouteDrift } from "../server/services/situation-room/minecraft-route-drift-monitor.ts";
import { extractMinecraftRouteIntent } from "../server/services/situation-room/minecraft-route-intent-extractor.ts";
import { reduceRouteLiveLines } from "../server/services/situation-room/minecraft-route-live-line-reducer.ts";
import { createMinecraftDiscordActorBinding } from "../server/services/situation-room/minecraft-session-actor-binding.ts";
import { buildRouteAssistOperatorReferral } from "../server/services/situation-room/operator-referral-builder.ts";
import { createMinecraftVisualObservation } from "../shared/helix-minecraft-visual-observation.ts";

test("monitors return-home-from-End without hidden Ask injection", () => {
  const threadId = "thread_end_return";
  const roomId = "room_end_return";
  const worldId = "world_survival";
  const binding = createMinecraftDiscordActorBinding({
    binding_id: "binding_dan_player",
    room_id: roomId,
    thread_id: threadId,
    profile_id: "profile_dan",
    discord_session_id: "discord_call",
    discord_speaker_id: "speaker_dan",
    minecraft_actor_id: "player_dan",
    minecraft_actor_label: "Dan",
    confidence: 0.93,
    source: "manual_link",
  });

  const objective = extractMinecraftRouteIntent({
    room_id: roomId,
    world_id: worldId,
    transcript_id: "transcript_001",
    transcript_text: "I think we need to get back home from the End. Where was the gateway?",
    transcript_mode: "ambient",
    actor_binding: binding,
    ts: "2026-05-20T17:00:00.000Z",
  });

  assert.ok(objective);
  assert.equal(objective.intent_label, "return_home_from_end");
  assert.equal(objective.intent_status, "hypothesized");
  assert.equal(objective.creates_ask_turn, false);
  assert.equal(objective.turn_triggered, false);
  assert.equal(objective.raw_user_text_included, false);

  const visual = createMinecraftVisualObservation({
    observation_id: "visual_001",
    room_id: roomId,
    thread_id: threadId,
    world_id: worldId,
    source_id: "minecraft_window",
    facts: [
      { kind: "dimension_hint", value: "minecraft:the_end", confidence: 0.9 },
      { kind: "facing_hint", direction: "west", confidence: 0.74 },
      { kind: "void_nearby", confidence: 0.82 },
      { kind: "bridge_visible", direction: "east-northeast", confidence: 0.68 },
    ],
    evidence_refs: ["visual_frame_001"],
    model_invoked_for_observation: true,
    ts: "2026-05-20T17:00:01.000Z",
  });

  const rehearsal = buildEndReturnRouteRehearsal({
    objective,
    current_position: { dimension: "minecraft:the_end", x: 1000, y: 72, z: 1000 },
    gateway_candidate: { dimension: "minecraft:the_end", x: 1120, y: 74, z: 920 },
    bridge_overlay_observed: true,
    ender_pearl_known_available: false,
    respawn_location_known: true,
    evidence_refs: ["seed_metadata", "chunk_snapshot", "bridge_overlay", visual.observation_id],
    ts: "2026-05-20T17:00:02.000Z",
  });

  assert.equal(rehearsal.route_kind, "return_home_from_end");
  assert.equal(rehearsal.stages.length, 4);
  assert.equal(rehearsal.instruction_authority, "none");
  assert.equal(rehearsal.ask_instruction_authority, "none");
  assert.equal(rehearsal.creates_ask_turn, false);

  const drift = evaluateRouteDrift(rehearsal, [
    { dimension: "minecraft:the_end", x: 1000, y: 72, z: 1000, ts_ms: Date.UTC(2026, 4, 20, 17, 0, 3) },
    { dimension: "minecraft:the_end", x: 990, y: 72, z: 1003, ts_ms: Date.UTC(2026, 4, 20, 17, 0, 6) },
    { dimension: "minecraft:the_end", x: 976, y: 72, z: 1008, ts_ms: Date.UTC(2026, 4, 20, 17, 0, 9) },
  ]);

  assert.ok(drift);
  assert.equal(drift.drift_status, "wrong_direction");
  assert.equal(drift.salience_candidate, true);
  assert.equal(drift.should_surface, false);
  assert.equal(Object.hasOwn(drift, "surface_text"), false);

  const live = reduceRouteLiveLines({ rehearsal, drift });
  assert.match(live.lines_by_key.rehearsal.value, /Return-home route candidate/);
  assert.match(live.lines_by_key.unknowns.value, /gateway|ender_pearl/i);
  assert.equal(live.lines_by_key.recommendation.value, "Awaiting companion policy gate.");
  assert.equal(live.lines_by_key.recommendation.ask_admissible, false);

  const referral = buildRouteAssistOperatorReferral({
    thread_id: threadId,
    objective,
    rehearsal,
    drift,
    salience_decision_id: "salience_001",
  });
  assert.ok(referral);
  assert.equal(referral.context_role, "operator_referral");
  assert.equal(referral.ask_context_policy, "operator_only");
  assert.equal(referral.creates_ask_turn, false);

  const askPack = buildMinecraftAskEvidencePack({
    room_id: roomId,
    thread_id: threadId,
    items: [objective, visual, rehearsal, drift, live.lines_by_key.recommendation, referral],
  });

  assert.equal(askPack.raw_transcript_included, false);
  assert.equal(askPack.raw_image_included, false);
  assert.equal(askPack.hidden_ask_turns_created, 0);
  assert.equal(askPack.items.includes(live.lines_by_key.recommendation), false);
  assert.equal(askPack.items.includes(referral), false);
  assert.ok(askPack.items.length >= 4);
  assert.ok(
    askPack.items.every((item) => {
      const evidence = item as {
        context_role?: string;
        instruction_authority?: string;
        ask_instruction_authority?: string;
        ask_context_policy?: string;
      };
      return (
        evidence.context_role === "tool_evidence" &&
        evidence.instruction_authority === "none" &&
        evidence.ask_instruction_authority === "none" &&
        evidence.ask_context_policy === "evidence_only"
      );
    }),
  );

  const { sink, requests } = createRecordingAskTurnSink();
  const loop = runLiveScenarioLoop({
    scenario_kind: "minecraft_route_monitor",
    events: [
      {
        kind: "transcript",
        transcript_id: "transcript_001",
        thread_id: threadId,
        room_id: roomId,
        world_id: worldId,
        text: "I think we need to get back home from the End. Where was the gateway?",
        transcript_mode: "ambient",
        actor_binding: binding,
      },
      {
        kind: "minecraft_route_context",
        current_position: { dimension: "minecraft:the_end", x: 1000, y: 72, z: 1000 },
        gateway_candidate: { dimension: "minecraft:the_end", x: 1120, y: 74, z: 920 },
        bridge_overlay_observed: true,
        respawn_location_known: true,
        evidence_refs: ["seed_metadata", "chunk_snapshot", "bridge_overlay"],
      },
      {
        kind: "minecraft_location_sample",
        sample: { dimension: "minecraft:the_end", x: 1000, y: 72, z: 1000, ts_ms: Date.UTC(2026, 4, 20, 17, 0, 3) },
      },
      {
        kind: "minecraft_location_sample",
        sample: { dimension: "minecraft:the_end", x: 990, y: 72, z: 1003, ts_ms: Date.UTC(2026, 4, 20, 17, 0, 6) },
      },
      {
        kind: "minecraft_location_sample",
        sample: { dimension: "minecraft:the_end", x: 976, y: 72, z: 1008, ts_ms: Date.UTC(2026, 4, 20, 17, 0, 9) },
      },
    ],
    askTurnSink: sink,
    now: "2026-05-20T17:00:10.000Z",
  });

  assert.equal(requests.length, 0);
  assert.equal(loop.objective?.creates_ask_turn, false);
  assert.equal(loop.direct_address_candidate, false);
});

test("direct address creates a candidate but not an Ask turn without policy approval", () => {
  const { sink, requests } = createRecordingAskTurnSink();
  const result = runLiveScenarioLoop({
    scenario_kind: "minecraft_route_monitor",
    events: [
      {
        kind: "transcript",
        transcript_id: "transcript_direct_001",
        thread_id: "thread_direct",
        room_id: "room_direct",
        world_id: "world_survival",
        text: "Helix, how do we get home from the End?",
        transcript_mode: "direct_address",
        direct_address_detected: true,
      },
    ],
    askTurnSink: sink,
    now: "2026-05-20T17:20:00.000Z",
  });

  assert.ok(result.direct_address_candidate);
  assert.equal(requests.length, 0);
});

test("policy approval creates one Ask turn for direct address", () => {
  const { sink, requests } = createRecordingAskTurnSink();
  const result = runLiveScenarioLoop({
    scenario_kind: "minecraft_route_monitor",
    events: [
      {
        kind: "transcript",
        transcript_id: "transcript_direct_002",
        thread_id: "thread_direct",
        room_id: "room_direct",
        world_id: "world_survival",
        text: "Helix, how do we get home from the End?",
        transcript_mode: "direct_address",
        direct_address_detected: true,
      },
      {
        kind: "policy_approval",
        may_create_ask_turn: true,
        reason: "direct_address",
        evidence_refs: ["transcript_direct_002"],
      },
    ],
    askTurnSink: sink,
    now: "2026-05-20T17:21:00.000Z",
  });

  assert.ok(result.direct_address_candidate);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].reason, "direct_address");
  assert.equal(requests[0].thread_id, "thread_direct");
});

test("low-confidence actor binding leaves ambient route objective pending identity", () => {
  const objective = extractMinecraftRouteIntent({
    room_id: "room",
    world_id: "world",
    transcript_id: "transcript_002",
    transcript_text: "We need to get home from the End.",
    transcript_mode: "ambient",
    actor_binding: createMinecraftDiscordActorBinding({
      binding_id: "binding_unknown",
      room_id: "room",
      thread_id: "thread",
      minecraft_actor_id: "player_unknown",
      confidence: 0.3,
      source: "unknown",
    }),
    ts: "2026-05-20T17:10:00.000Z",
  });

  assert.ok(objective);
  assert.equal(objective.lifecycle, "pending_identity");
  assert.equal(objective.actor_id, null);
  assert.equal(objective.creates_ask_turn, false);
});

test("does not fabricate a gateway waypoint when gateway evidence is missing", () => {
  const objective = extractMinecraftRouteIntent({
    room_id: "room",
    world_id: "world",
    transcript_id: "transcript_no_gateway",
    transcript_text: "We need to get home from the End.",
    transcript_mode: "ambient",
    actor_binding: createMinecraftDiscordActorBinding({
      binding_id: "binding_player",
      room_id: "room",
      thread_id: "thread",
      minecraft_actor_id: "player",
      confidence: 0.9,
      source: "manual_link",
    }),
    ts: "2026-05-20T17:30:00.000Z",
  });

  assert.ok(objective);
  const currentPosition = { dimension: "minecraft:the_end", x: 2048, y: 70, z: -500 };
  const rehearsal = buildEndReturnRouteRehearsal({
    objective,
    current_position: currentPosition,
    gateway_candidate: null,
    bridge_overlay_observed: false,
    ender_pearl_known_available: null,
    respawn_location_known: false,
    evidence_refs: [],
    ts: "2026-05-20T17:30:01.000Z",
  });

  assert.equal(rehearsal.result_status, "not_enough_evidence");
  assert.equal(rehearsal.route_confidence <= 0.35, true);
  assert.equal(rehearsal.candidate_next_waypoint, null);
  assert.ok(rehearsal.missing_evidence_codes.includes("no_gateway_candidate"));
  assert.equal(JSON.stringify(rehearsal).includes(String(currentPosition.x + 100)), false);
});

test("does not evaluate drift when objective is inactive", () => {
  const objective = extractMinecraftRouteIntent({
    room_id: "room",
    world_id: "world",
    transcript_id: "transcript_inactive",
    transcript_text: "We need to get home from the End.",
    transcript_mode: "ambient",
    actor_binding: createMinecraftDiscordActorBinding({
      binding_id: "binding_player",
      room_id: "room",
      thread_id: "thread",
      minecraft_actor_id: "player",
      confidence: 0.9,
      source: "manual_link",
    }),
    ts: "2026-05-20T17:40:00.000Z",
  });
  assert.ok(objective);

  const rehearsal = buildEndReturnRouteRehearsal({
    objective,
    current_position: { dimension: "minecraft:the_end", x: 1000, y: 72, z: 1000 },
    gateway_candidate: { dimension: "minecraft:the_end", x: 1120, y: 74, z: 920 },
    bridge_overlay_observed: true,
    ender_pearl_known_available: false,
    respawn_location_known: true,
    evidence_refs: ["gateway"],
    ts: "2026-05-20T17:40:01.000Z",
  });

  const drift = monitorRouteDrift({
    objective: { ...objective, lifecycle: "completed" },
    rehearsal,
    samples: [
      { dimension: "minecraft:the_end", x: 1000, y: 72, z: 1000, ts_ms: Date.UTC(2026, 4, 20, 17, 40, 3) },
      { dimension: "minecraft:the_end", x: 990, y: 72, z: 1003, ts_ms: Date.UTC(2026, 4, 20, 17, 40, 6) },
      { dimension: "minecraft:the_end", x: 976, y: 72, z: 1008, ts_ms: Date.UTC(2026, 4, 20, 17, 40, 9) },
    ],
    now: "2026-05-20T17:40:10.000Z",
  });

  assert.equal(drift.drift_status, "stale_route");
  assert.equal(drift.salience_candidate, false);
  assert.equal(drift.stale_reason, "objective_not_active");
});

test("does not evaluate drift across dimension mismatch", () => {
  const objective = extractMinecraftRouteIntent({
    room_id: "room",
    world_id: "world",
    transcript_id: "transcript_dimension_mismatch",
    transcript_text: "We need to get home from the End.",
    transcript_mode: "ambient",
    actor_binding: createMinecraftDiscordActorBinding({
      binding_id: "binding_player",
      room_id: "room",
      thread_id: "thread",
      minecraft_actor_id: "player",
      confidence: 0.9,
      source: "manual_link",
    }),
    ts: "2026-05-20T17:50:00.000Z",
  });
  assert.ok(objective);

  const rehearsal = buildEndReturnRouteRehearsal({
    objective,
    current_position: { dimension: "minecraft:the_end", x: 1000, y: 72, z: 1000 },
    gateway_candidate: { dimension: "minecraft:the_end", x: 1120, y: 74, z: 920 },
    bridge_overlay_observed: true,
    ender_pearl_known_available: false,
    respawn_location_known: true,
    evidence_refs: ["gateway"],
    ts: "2026-05-20T17:50:01.000Z",
  });

  const drift = monitorRouteDrift({
    objective,
    rehearsal,
    samples: [
      { dimension: "minecraft:overworld", x: 0, y: 64, z: 0, ts_ms: Date.UTC(2026, 4, 20, 17, 50, 3) },
      { dimension: "minecraft:overworld", x: 1, y: 64, z: 0, ts_ms: Date.UTC(2026, 4, 20, 17, 50, 6) },
      { dimension: "minecraft:overworld", x: 2, y: 64, z: 0, ts_ms: Date.UTC(2026, 4, 20, 17, 50, 9) },
    ],
    now: "2026-05-20T17:50:10.000Z",
  });

  assert.equal(drift.drift_status, "stale_route");
  assert.equal(drift.stale_reason, "dimension_mismatch");
  assert.equal(drift.salience_candidate, false);
});
