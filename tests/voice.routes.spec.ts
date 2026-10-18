import express from "express";
import request from "supertest";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { hashDotVoiceSourceText } from "../shared/helix-dot-voice-authority";
import { buildHelixTurnTerminalAuthority } from "../server/services/helix-ask/turn-terminal-authority";
import { resetVoiceRouteState, voiceRouter } from "../server/routes/voice";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/voice", voiceRouter);
  return app;
};

const uniqueId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const buildTestTerminalAuthority = (input: {
  terminal_kind?: "answer" | "request_user_input" | "workspace_action_receipt" | "situation_context_pack" | "live_answer_environment" | "tool_evaluation" | "failure";
  terminal_artifact_kind?: string;
  final_answer_source?: string;
  terminal_text: string;
}) =>
  buildHelixTurnTerminalAuthority({
    thread_id: "thread_voice_test",
    turn_id: "turn_voice_test",
    route: "/ask",
    terminal_kind: input.terminal_kind ?? "answer",
    terminal_artifact_kind: input.terminal_artifact_kind ?? "assistant_answer",
    final_answer_source: input.final_answer_source ?? "terminal_final_answer",
    terminal_text: input.terminal_text,
  });

const buildAcceptedCandidate = (input: {
  text: string;
  text_certainty: string;
  voice_certainty: string;
  source_kind?: "operator_callout_v1" | "terminal_answer_authority" | "solver_public_commentary";
  evidence_refs?: string[];
  expires_at?: string | null;
}) => ({
  schema: "helix.accepted_arbitration_candidate.v1",
  candidate_id: uniqueId("candidate"),
  arbiter_id: "server_arbiter_test",
  accepted_at: "2026-05-18T10:00:00.000Z",
  expires_at: input.expires_at ?? "2099-01-01T00:00:00.000Z",
  status: "accepted",
  voice_authority_state: "callout_voice",
  source_kind: input.source_kind ?? "operator_callout_v1",
  source_event_ids: ["event_voice_test"],
  evidence_refs: input.evidence_refs ?? ["docs/verify.md#L1"],
  text_certainty: input.text_certainty,
  voice_certainty: input.voice_certainty,
  text_hash: hashDotVoiceSourceText(input.text),
  normalized_text_preview: input.text.trim().slice(0, 240),
  suppression_reason: null,
  server_authoritative: true,
});

const withAcceptedCalloutAuthority = <T extends { text: string; evidenceRefs?: string[] }>(payload: T) => ({
  ...payload,
  voiceAuthorityState: "callout_voice" as const,
  accepted_arbitration_candidate: buildAcceptedCandidate({
    text: payload.text,
    text_certainty: "reasoned",
    voice_certainty: "reasoned",
    evidence_refs: payload.evidenceRefs ?? ["docs/helix-ask-flow.md#L1"],
  }),
});

const ORIGINAL_ENV = {
  VOICE_PROXY_DRY_RUN: process.env.VOICE_PROXY_DRY_RUN,
  TTS_BASE_URL: process.env.TTS_BASE_URL,
  VOICE_PROVIDER_MODE: process.env.VOICE_PROVIDER_MODE,
  VOICE_PROVIDER_ALLOWLIST: process.env.VOICE_PROVIDER_ALLOWLIST,
  VOICE_COMMERCIAL_MODE: process.env.VOICE_COMMERCIAL_MODE,
  VOICE_MANAGED_PROVIDERS_ENABLED: process.env.VOICE_MANAGED_PROVIDERS_ENABLED,
  VOICE_LOCAL_ONLY_MISSION_MODE: process.env.VOICE_LOCAL_ONLY_MISSION_MODE,
  VOICE_BUDGET_MISSION_WINDOW_MS: process.env.VOICE_BUDGET_MISSION_WINDOW_MS,
  VOICE_BUDGET_MISSION_MAX_REQUESTS: process.env.VOICE_BUDGET_MISSION_MAX_REQUESTS,
  VOICE_BUDGET_TENANT_DAILY_MAX_REQUESTS: process.env.VOICE_BUDGET_TENANT_DAILY_MAX_REQUESTS,
  VOICE_REPLAY_CLOCK_TRUSTED: process.env.VOICE_REPLAY_CLOCK_TRUSTED,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  VOICE_ELEVENLABS_API_KEY: process.env.VOICE_ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
  ELEVENLABS_API_BASE: process.env.ELEVENLABS_API_BASE,
  ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID,
  ELEVENLABS_OUTPUT_FORMAT: process.env.ELEVENLABS_OUTPUT_FORMAT,
  VOICE_CHUNK_CACHE_TTL_MS: process.env.VOICE_CHUNK_CACHE_TTL_MS,
};

describe("voice routes", () => {
  afterEach(() => {
    resetVoiceRouteState();
    if (ORIGINAL_ENV.VOICE_PROXY_DRY_RUN === undefined) {
      delete process.env.VOICE_PROXY_DRY_RUN;
    } else {
      process.env.VOICE_PROXY_DRY_RUN = ORIGINAL_ENV.VOICE_PROXY_DRY_RUN;
    }
    if (ORIGINAL_ENV.TTS_BASE_URL === undefined) {
      delete process.env.TTS_BASE_URL;
    } else {
      process.env.TTS_BASE_URL = ORIGINAL_ENV.TTS_BASE_URL;
    }
    if (ORIGINAL_ENV.VOICE_PROVIDER_MODE === undefined) {
      delete process.env.VOICE_PROVIDER_MODE;
    } else {
      process.env.VOICE_PROVIDER_MODE = ORIGINAL_ENV.VOICE_PROVIDER_MODE;
    }
    if (ORIGINAL_ENV.VOICE_PROVIDER_ALLOWLIST === undefined) {
      delete process.env.VOICE_PROVIDER_ALLOWLIST;
    } else {
      process.env.VOICE_PROVIDER_ALLOWLIST = ORIGINAL_ENV.VOICE_PROVIDER_ALLOWLIST;
    }
    if (ORIGINAL_ENV.VOICE_COMMERCIAL_MODE === undefined) {
      delete process.env.VOICE_COMMERCIAL_MODE;
    } else {
      process.env.VOICE_COMMERCIAL_MODE = ORIGINAL_ENV.VOICE_COMMERCIAL_MODE;
    }
    if (ORIGINAL_ENV.VOICE_MANAGED_PROVIDERS_ENABLED === undefined) {
      delete process.env.VOICE_MANAGED_PROVIDERS_ENABLED;
    } else {
      process.env.VOICE_MANAGED_PROVIDERS_ENABLED = ORIGINAL_ENV.VOICE_MANAGED_PROVIDERS_ENABLED;
    }
    if (ORIGINAL_ENV.VOICE_LOCAL_ONLY_MISSION_MODE === undefined) {
      delete process.env.VOICE_LOCAL_ONLY_MISSION_MODE;
    } else {
      process.env.VOICE_LOCAL_ONLY_MISSION_MODE = ORIGINAL_ENV.VOICE_LOCAL_ONLY_MISSION_MODE;
    }
    if (ORIGINAL_ENV.VOICE_BUDGET_MISSION_WINDOW_MS === undefined) {
      delete process.env.VOICE_BUDGET_MISSION_WINDOW_MS;
    } else {
      process.env.VOICE_BUDGET_MISSION_WINDOW_MS = ORIGINAL_ENV.VOICE_BUDGET_MISSION_WINDOW_MS;
    }
    if (ORIGINAL_ENV.VOICE_BUDGET_MISSION_MAX_REQUESTS === undefined) {
      delete process.env.VOICE_BUDGET_MISSION_MAX_REQUESTS;
    } else {
      process.env.VOICE_BUDGET_MISSION_MAX_REQUESTS = ORIGINAL_ENV.VOICE_BUDGET_MISSION_MAX_REQUESTS;
    }
    if (ORIGINAL_ENV.VOICE_BUDGET_TENANT_DAILY_MAX_REQUESTS === undefined) {
      delete process.env.VOICE_BUDGET_TENANT_DAILY_MAX_REQUESTS;
    } else {
      process.env.VOICE_BUDGET_TENANT_DAILY_MAX_REQUESTS = ORIGINAL_ENV.VOICE_BUDGET_TENANT_DAILY_MAX_REQUESTS;
    }
    if (ORIGINAL_ENV.VOICE_REPLAY_CLOCK_TRUSTED === undefined) {
      delete process.env.VOICE_REPLAY_CLOCK_TRUSTED;
    } else {
      process.env.VOICE_REPLAY_CLOCK_TRUSTED = ORIGINAL_ENV.VOICE_REPLAY_CLOCK_TRUSTED;
    }
    if (ORIGINAL_ENV.ELEVENLABS_API_KEY === undefined) {
      delete process.env.ELEVENLABS_API_KEY;
    } else {
      process.env.ELEVENLABS_API_KEY = ORIGINAL_ENV.ELEVENLABS_API_KEY;
    }
    if (ORIGINAL_ENV.VOICE_ELEVENLABS_API_KEY === undefined) {
      delete process.env.VOICE_ELEVENLABS_API_KEY;
    } else {
      process.env.VOICE_ELEVENLABS_API_KEY = ORIGINAL_ENV.VOICE_ELEVENLABS_API_KEY;
    }
    if (ORIGINAL_ENV.ELEVENLABS_VOICE_ID === undefined) {
      delete process.env.ELEVENLABS_VOICE_ID;
    } else {
      process.env.ELEVENLABS_VOICE_ID = ORIGINAL_ENV.ELEVENLABS_VOICE_ID;
    }
    if (ORIGINAL_ENV.ELEVENLABS_API_BASE === undefined) {
      delete process.env.ELEVENLABS_API_BASE;
    } else {
      process.env.ELEVENLABS_API_BASE = ORIGINAL_ENV.ELEVENLABS_API_BASE;
    }
    if (ORIGINAL_ENV.ELEVENLABS_MODEL_ID === undefined) {
      delete process.env.ELEVENLABS_MODEL_ID;
    } else {
      process.env.ELEVENLABS_MODEL_ID = ORIGINAL_ENV.ELEVENLABS_MODEL_ID;
    }
    if (ORIGINAL_ENV.ELEVENLABS_OUTPUT_FORMAT === undefined) {
      delete process.env.ELEVENLABS_OUTPUT_FORMAT;
    } else {
      process.env.ELEVENLABS_OUTPUT_FORMAT = ORIGINAL_ENV.ELEVENLABS_OUTPUT_FORMAT;
    }
    if (ORIGINAL_ENV.VOICE_CHUNK_CACHE_TTL_MS === undefined) {
      delete process.env.VOICE_CHUNK_CACHE_TTL_MS;
    } else {
      process.env.VOICE_CHUNK_CACHE_TTL_MS = ORIGINAL_ENV.VOICE_CHUNK_CACHE_TTL_MS;
    }
  });

  it("rejects invalid payloads with deterministic envelope", async () => {
    delete process.env.VOICE_PROXY_DRY_RUN;
    delete process.env.TTS_BASE_URL;
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({ text: " " });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("voice_invalid_request");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.details).toBeTruthy();
  });

  it("requires consent_asserted when reference audio is provided", async () => {
    delete process.env.VOICE_PROXY_DRY_RUN;
    delete process.env.TTS_BASE_URL;
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Reference clip detected.",
      referenceAudioHash: "sha256:test-ref",
      consent_asserted: false,
      traceId: "trace-consent",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("voice_consent_required");
    expect(res.body.traceId).toBe("trace-consent");
  });

  it("returns voice_unavailable when backend is not configured", async () => {
    delete process.env.VOICE_PROXY_DRY_RUN;
    delete process.env.TTS_BASE_URL;
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Speak this callout.",
      mode: "callout",
      priority: "info",
      traceId: "trace-unconfigured",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("voice_unavailable");
    expect(res.body.traceId).toBe("trace-unconfigured");
    expect(res.body.details?.providerConfigured).toBe(false);
  });

  it("returns voice_unavailable when elevenlabs is selected without credentials", async () => {
    delete process.env.VOICE_PROXY_DRY_RUN;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.VOICE_ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Speak with ElevenLabs.",
      provider: "elevenlabs",
      voice_profile_id: "voice-custom",
      traceId: "trace-elevenlabs-unconfigured",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("voice_unavailable");
    expect(res.body.traceId).toBe("trace-elevenlabs-unconfigured");
  });

  it("suppresses Dot voice when authority is omitted", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Status: verifier passed.",
      mode: "callout",
      priority: "info",
      voiceAuthorityState: "status_voice",
      traceId: "trace-omitted-authority",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("missing_terminal_authority");
  });

  it("suppresses status_voice without terminal authority", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Status: terminal ready.",
      mode: "callout",
      priority: "info",
      voiceAuthorityState: "status_voice",
      traceId: "trace-status-missing-authority",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("missing_terminal_authority");
  });

  it("allows provisional interim tool receipt playback without terminal answer authority", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();
    const receiptId = "helix_interim_voice_callout_receipt:test";

    const res = await request(app).post("/api/voice/speak").send({
      text: "I am checking this now.",
      mode: "briefing",
      priority: "info",
      provider: "local-chatterbox",
      traceId: "ask:test-interim-voice",
      eventId: receiptId,
      utteranceId: `tool_receipt:ask:test-interim-voice:${receiptId}`,
      chunkKind: "tool_receipt",
      turnKey: "ask:test-interim-voice",
      evidenceRefs: [receiptId, `tool_receipt:ask:test-interim-voice:${receiptId}`],
      repoAttributed: false,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      dryRun: true,
      provider: "dry-run",
    });
    expect(res.body.suppressed).not.toBe(true);
    expect(res.body.reason).not.toBe("missing_terminal_authority");
  });

  it("suppresses status_voice from legacy context packs", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const text = "Status: context pack summary.";
    const terminalAuthority = buildTestTerminalAuthority({
      terminal_kind: "situation_context_pack",
      terminal_text: text,
    });

    const res = await request(app).post("/api/voice/speak").send({
      text,
      mode: "callout",
      priority: "info",
      voiceAuthorityState: "status_voice",
      terminal_answer_authority: terminalAuthority,
      traceId: "trace-status-context-pack",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("legacy_context_pack_not_speakable");
  });

  it("allows status_voice from a matching server-authoritative terminal answer", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const text = "Status: verifier passed.";
    const terminalAuthority = buildTestTerminalAuthority({
      terminal_kind: "answer",
      terminal_artifact_kind: "assistant_answer",
      final_answer_source: "terminal_final_answer",
      terminal_text: text,
    });

    const res = await request(app).post("/api/voice/speak").send({
      text,
      mode: "callout",
      priority: "info",
      voiceAuthorityState: "status_voice",
      terminal_answer_authority: terminalAuthority,
      repoAttributed: false,
      traceId: "trace-status-authorized",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.suppressed ?? false).toBe(false);
  });

  it("suppresses status_voice when the declared source is a raw transcript", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const text = "Status: verifier passed.";
    const res = await request(app).post("/api/voice/speak").send({
      text,
      mode: "callout",
      priority: "info",
      voiceAuthorityState: "status_voice",
      sourceKind: "raw_transcript",
      terminal_answer_authority: buildTestTerminalAuthority({
        terminal_kind: "answer",
        terminal_artifact_kind: "assistant_answer",
        final_answer_source: "terminal_final_answer",
        terminal_text: text,
      }),
      repoAttributed: false,
      traceId: "trace-status-raw-transcript",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("raw_transcript_not_speakable");
  });

  it("suppresses command_execute as a non-voice lane", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Execute verifier rerun.",
      mode: "callout",
      priority: "action",
      voiceAuthorityState: "command_execute",
      evidenceRefs: ["docs/verify.md#L1"],
      traceId: "trace-command-execute-not-voice",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("command_execute_not_voice");
  });

  it("suppresses callout_voice without accepted arbitration candidate", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Action required: rerun verifier.",
      mode: "callout",
      priority: "action",
      voiceAuthorityState: "callout_voice",
      evidenceRefs: ["docs/verify.md#L1"],
      traceId: "trace-callout-missing-candidate",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("missing_accepted_arbitration_candidate");
  });

  it("suppresses Dot callout voice when authority fields are omitted", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Action required: rerun verifier.",
      mode: "callout",
      priority: "action",
      voiceProfile: "dottie_default",
      missionId: "mission-dot-omitted-authority",
      evidenceRefs: ["docs/verify.md#L1"],
      traceId: "trace-dot-omitted-authority",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("missing_accepted_arbitration_candidate");
  });

  it("suppresses callout_voice when candidate text hash does not match", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Action required: rerun verifier.",
      mode: "callout",
      priority: "action",
      voiceAuthorityState: "callout_voice",
      accepted_arbitration_candidate: buildAcceptedCandidate({
        text: "Different accepted text.",
        text_certainty: "reasoned",
        voice_certainty: "reasoned",
        evidence_refs: ["docs/verify.md#L1"],
      }),
      evidenceRefs: ["docs/verify.md#L1"],
      traceId: "trace-callout-hash-mismatch",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("candidate_text_hash_mismatch");
  });

  it("allows callout_voice from accepted arbitration candidate", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const text = "Action required: rerun verifier.";
    const res = await request(app).post("/api/voice/speak").send({
      text,
      mode: "callout",
      priority: "action",
      voiceAuthorityState: "callout_voice",
      accepted_arbitration_candidate: buildAcceptedCandidate({
        text,
        text_certainty: "reasoned",
        voice_certainty: "reasoned",
        evidence_refs: ["docs/verify.md#L1"],
      }),
      evidenceRefs: ["docs/verify.md#L1"],
      traceId: "trace-callout-accepted",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.suppressed ?? false).toBe(false);
  });

  it("allows Dottie callout voice from solver public commentary", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const text = "I am checking route authority before the voice lane.";
    const res = await request(app).post("/api/voice/speak").send({
      text,
      mode: "callout",
      priority: "info",
      voiceAuthorityState: "callout_voice",
      accepted_arbitration_candidate: buildAcceptedCandidate({
        text,
        text_certainty: "reasoned",
        voice_certainty: "reasoned",
        source_kind: "solver_public_commentary",
        evidence_refs: ["ask_turn_solver_trace:turn_voice_test"],
      }),
      evidenceRefs: ["ask_turn_solver_trace:turn_voice_test"],
      traceId: "trace-dottie-public-commentary",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.suppressed ?? false).toBe(false);
  });

  it("suppresses hypothesis-only callout_voice", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const text = "Possible risk: verifier may fail.";
    const res = await request(app).post("/api/voice/speak").send({
      text,
      mode: "callout",
      priority: "warn",
      voiceAuthorityState: "callout_voice",
      accepted_arbitration_candidate: buildAcceptedCandidate({
        text,
        text_certainty: "hypothesis",
        voice_certainty: "hypothesis",
        evidence_refs: ["docs/verify.md#L1"],
      }),
      evidenceRefs: ["docs/verify.md#L1"],
      traceId: "trace-callout-hypothesis",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("field_hypothesis_not_speakable");
  });

  it("enforces local-only provider mode", async () => {
    process.env.VOICE_PROVIDER_MODE = "local_only";
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Remote callout",
      provider: "remote-tts",
      traceId: "trace-local-only",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("voice_provider_not_allowed");
    expect(res.body.traceId).toBe("trace-local-only");
  });

  it("enforces commercial allowlist when enabled", async () => {
    process.env.VOICE_PROVIDER_MODE = "allow_remote";
    process.env.VOICE_PROVIDER_ALLOWLIST = "local-chatterbox,remote-approved";
    process.env.VOICE_COMMERCIAL_MODE = "1";
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const denied = await request(app).post("/api/voice/speak").send({
      text: "Denied callout",
      provider: "remote-denied",
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("voice_provider_not_allowed");

    const allowed = await request(app).post("/api/voice/speak").send({
      text: "Allowed callout",
      provider: "remote-approved",
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body.ok).toBe(true);
  });


  it("routes mission-critical requests to local provider in local-only mission mode", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    process.env.VOICE_LOCAL_ONLY_MISSION_MODE = "1";
    process.env.VOICE_PROVIDER_MODE = "allow_remote";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Critical escalation",
      priority: "critical",
      provider: "remote-approved",
      traceId: "trace-critical-local",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.provider).toBe("dry-run");
  });

  it("blocks managed providers when disabled for non-critical callouts", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    process.env.VOICE_PROVIDER_MODE = "allow_remote";
    process.env.VOICE_MANAGED_PROVIDERS_ENABLED = "0";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Non-critical remote",
      priority: "warn",
      provider: "remote-tts",
      traceId: "trace-managed-disabled",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("voice_provider_not_allowed");
    expect(res.body.details?.managedProvidersEnabled).toBe(false);
  });

  it("supports dry-run mode and suppresses dedupe duplicates", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    delete process.env.TTS_BASE_URL;
    const app = buildApp();
    const missionId = uniqueId("mission");
    const dedupeKey = uniqueId("event");

    const first = await request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
      text: "Evidence gate passed.",
      mode: "callout",
      priority: "warn",
      missionId,
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      eventId: dedupeKey,
      dedupe_key: dedupeKey,
      traceId: "trace-first",
    }));
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.dryRun).toBe(true);

    const second = await request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
      text: "Evidence gate passed.",
      mode: "callout",
      priority: "warn",
      missionId,
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      eventId: dedupeKey,
      dedupe_key: dedupeKey,
      traceId: "trace-second",
    }));
    expect(second.status).toBe(200);
    expect(second.body.suppressed).toBe(true);
    expect(second.body.reason).toBe("dedupe_cooldown");
  });

  it("does not suppress dedupe duplicates for briefing mode", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    delete process.env.TTS_BASE_URL;
    const app = buildApp();
    const dedupeKey = uniqueId("brief-dedupe");

    const payload = {
      text: "Briefing chunk.",
      mode: "briefing",
      priority: "info",
      eventId: dedupeKey,
      dedupe_key: dedupeKey,
      traceId: "trace-brief-dedupe",
    } as const;

    const first = await request(app).post("/api/voice/speak").send(payload);
    const second = await request(app).post("/api/voice/speak").send(payload);

    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.suppressed ?? false).toBe(false);
    expect(second.body.reason).toBeUndefined();
  });

  it("returns normalized metering in dry-run mode", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
      text: "Meter this callout.",
      missionId: uniqueId("mission-meter"),
      repoAttributed: false,
      durationMs: 1200,
    }));

    expect(res.status).toBe(200);
    expect(res.body.metering?.requestCount).toBe(1);
    expect(res.body.metering?.charCount).toBe("Meter this callout.".length);
    expect(res.body.metering?.durationMs).toBe(1200);
  });

  it("ignores untrusted policy clock overrides for mission budget enforcement", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    process.env.VOICE_BUDGET_MISSION_WINDOW_MS = "60000";
    process.env.VOICE_BUDGET_MISSION_MAX_REQUESTS = "1";
    delete process.env.VOICE_REPLAY_CLOCK_TRUSTED;
    const app = buildApp();
    const missionId = uniqueId("mission-untrusted-clock");

    const first = await request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
      text: "first",
      missionId,
      eventId: uniqueId("evt-untrusted"),
      repoAttributed: false,
      policyTsMs: 0,
      replayMode: true,
    }));
    const second = await request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
      text: "second",
      missionId,
      eventId: uniqueId("evt-untrusted"),
      repoAttributed: false,
      policyTsMs: 4102444800000,
      replayMode: true,
    }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.error).toBe("voice_budget_exceeded");
  });

  it("allows trusted replay mode policy clock overrides deterministically", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    process.env.VOICE_BUDGET_MISSION_WINDOW_MS = "60000";
    process.env.VOICE_BUDGET_MISSION_MAX_REQUESTS = "1";
    process.env.VOICE_REPLAY_CLOCK_TRUSTED = "1";
    const app = buildApp();
    const missionId = uniqueId("mission-trusted-clock");

    const first = await request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
      text: "first",
      missionId,
      eventId: uniqueId("evt-trusted"),
      repoAttributed: false,
      policyTsMs: 1000,
      replayMode: true,
    }));
    const second = await request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
      text: "second",
      missionId,
      eventId: uniqueId("evt-trusted"),
      repoAttributed: false,
      policyTsMs: 62000,
      replayMode: true,
    }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);
  });

  it("enforces mission and tenant voice budgets deterministically", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    process.env.VOICE_BUDGET_MISSION_WINDOW_MS = "60000";
    process.env.VOICE_BUDGET_MISSION_MAX_REQUESTS = "2";
    process.env.VOICE_BUDGET_TENANT_DAILY_MAX_REQUESTS = "3";
    const app = buildApp();
    const missionId = uniqueId("mission-budget");

    const first = await request(app)
      .post("/api/voice/speak")
      .set("x-tenant-id", "tenant-a")
      .send(withAcceptedCalloutAuthority({ text: "one", missionId, eventId: uniqueId("event"), repoAttributed: false }));
    const second = await request(app)
      .post("/api/voice/speak")
      .set("x-tenant-id", "tenant-a")
      .send(withAcceptedCalloutAuthority({ text: "two", missionId, eventId: uniqueId("event"), repoAttributed: false }));
    const missionBudget = await request(app)
      .post("/api/voice/speak")
      .set("x-tenant-id", "tenant-a")
      .send(withAcceptedCalloutAuthority({ text: "three", missionId, eventId: uniqueId("event"), repoAttributed: false }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(missionBudget.status).toBe(429);
    expect(missionBudget.body.error).toBe("voice_budget_exceeded");
    expect(missionBudget.body.details?.scope).toBe("mission_window");

    const tenantMissionA = await request(app)
      .post("/api/voice/speak")
      .set("x-tenant-id", "tenant-b")
      .send(withAcceptedCalloutAuthority({ text: "b-one", missionId: uniqueId("mission-b"), repoAttributed: false }));
    const tenantMissionB = await request(app)
      .post("/api/voice/speak")
      .set("x-tenant-id", "tenant-b")
      .send(withAcceptedCalloutAuthority({ text: "b-two", missionId: uniqueId("mission-b"), repoAttributed: false }));
    const tenantDaily = await request(app)
      .post("/api/voice/speak")
      .set("x-tenant-id", "tenant-b")
      .send(withAcceptedCalloutAuthority({ text: "b-three", missionId: uniqueId("mission-b"), repoAttributed: false }));
    const tenantDailyExceeded = await request(app)
      .post("/api/voice/speak")
      .set("x-tenant-id", "tenant-b")
      .send(withAcceptedCalloutAuthority({ text: "b-four", missionId: uniqueId("mission-b"), repoAttributed: false }));

    expect(tenantMissionA.status).toBe(200);
    expect(tenantMissionB.status).toBe(200);
    expect(tenantDaily.status).toBe(200);
    expect(tenantDailyExceeded.status).toBe(429);
    expect(tenantDailyExceeded.body.details?.scope).toBe("tenant_day");
  });

  it("enforces mission-level rate cap for non-critical callouts", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    delete process.env.TTS_BASE_URL;
    const app = buildApp();
    const missionId = uniqueId("mission-rate");

    const send = (eventId: string) =>
      request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
        text: "Status update.",
        mode: "callout",
        priority: "info",
        missionId,
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
        eventId,
        dedupe_key: eventId,
      }));

    const first = await send(uniqueId("evt"));
    const second = await send(uniqueId("evt"));
    const third = await send(uniqueId("evt"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.error).toBe("voice_rate_limited");
  });

  it("does not apply mission-level callout rate cap to briefing mode", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    delete process.env.TTS_BASE_URL;
    const app = buildApp();
    const missionId = uniqueId("mission-briefing-rate");

    const send = (eventId: string) =>
      request(app).post("/api/voice/speak").send({
        text: "Briefing update.",
        mode: "briefing",
        priority: "info",
        missionId,
        eventId,
        dedupe_key: eventId,
      });

    const first = await send(uniqueId("evt"));
    const second = await send(uniqueId("evt"));
    const third = await send(uniqueId("evt"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
  });



  it("passes voice_profile_id through to proxy contract without breaking legacy shape", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "0";
    const upstreamApp = express();
    upstreamApp.use(express.json());
    let seenProfile: string | null = null;
    let seenUtteranceId: string | null = null;
    let seenChunkKind: string | null = null;
    upstreamApp.post("/speak", (req, res) => {
      seenProfile = req.body.voice_profile_id ?? req.body.voiceProfile ?? null;
      seenUtteranceId = req.body.utteranceId ?? null;
      seenChunkKind = req.body.chunkKind ?? null;
      res.setHeader("content-type", "audio/wav");
      res.send(Buffer.from("ok"));
    });
    const upstreamServer = await new Promise<Server>((resolve) => {
      const server = upstreamApp.listen(0, () => resolve(server));
    });

    try {
      const address = upstreamServer.address();
      if (!address || typeof address !== "object") throw new Error("no port");
      process.env.TTS_BASE_URL = `http://127.0.0.1:${address.port}`;
      const app = buildApp();
      const text = "profile passthrough";
      const res = await request(app).post("/api/voice/speak").send({
        text,
        mode: "briefing",
        voice_profile_id: "dottie_governed",
        voiceAuthorityState: "status_voice",
        terminal_answer_authority: buildTestTerminalAuthority({
          terminal_kind: "answer",
          terminal_artifact_kind: "assistant_answer",
          final_answer_source: "terminal_final_answer",
          terminal_text: text,
        }),
        utteranceId: "utt-meta-1",
        chunkIndex: 0,
        chunkCount: 1,
        chunkKind: "brief",
        turnKey: "turn-meta-1",
      });

      expect(res.status).toBe(200);
      expect(seenProfile).toBe("dottie_governed");
      expect(seenUtteranceId).toBe("utt-meta-1");
      expect(seenChunkKind).toBe("brief");
      expect(res.headers["x-voice-profile"]).toBe("dottie_governed");
    } finally {
      await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    }
  });

  it("opens deterministic circuit breaker after repeated backend failures", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "0";
    const upstreamApp = express();
    upstreamApp.use(express.json());
    upstreamApp.post("/speak", (_req, res) => {
      res.status(500).json({ error: "upstream_failure" });
    });
    const upstreamServer = await new Promise<Server>((resolve) => {
      const server = upstreamApp.listen(0, () => resolve(server));
    });

    try {
      const address = upstreamServer.address();
      if (!address || typeof address !== "object") {
        throw new Error("Failed to resolve upstream listen port");
      }
      process.env.TTS_BASE_URL = `http://127.0.0.1:${address.port}`;
      const app = buildApp();

      const sendFail = () =>
        request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
          text: "Backend unstable.",
          mode: "callout",
          priority: "warn",
          missionId: uniqueId("mission-breaker"),
          eventId: uniqueId("event-breaker"),
          evidenceRefs: ["docs/helix-ask-flow.md#L1"],
        }));

      const first = await sendFail();
      const second = await sendFail();
      const third = await sendFail();
      const fourth = await sendFail();

      expect(first.status).toBe(502);
      expect(second.status).toBe(502);
      expect(third.status).toBe(502);
      expect(fourth.status).toBe(503);
      expect(fourth.body.error).toBe("voice_backend_error");
      expect(fourth.body.details?.circuitBreakerOpen).toBe(true);
      expect(fourth.body.details?.retryAfterMs).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    }
  });

  it("meets voice dry-run latency budget", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const start = Date.now();
    const res = await request(app).post("/api/voice/speak").send({
      text: "Latency check",
      missionId: uniqueId("mission-latency"),
      eventId: uniqueId("event-latency"),
    });
    const latencyMs = Date.now() - start;

    expect(res.status).toBe(200);
    expect(latencyMs).toBeLessThan(250);
  });

  it("keeps deterministic envelope under controlled overload", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    process.env.VOICE_BUDGET_MISSION_WINDOW_MS = "60000";
    process.env.VOICE_BUDGET_MISSION_MAX_REQUESTS = "1";
    const app = buildApp();
    const missionId = uniqueId("mission-overload");

    const first = await request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
      text: "baseline",
      missionId,
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      eventId: uniqueId("event-overload"),
    }));
    const overloaded = await request(app).post("/api/voice/speak").send(withAcceptedCalloutAuthority({
      text: "overload",
      missionId,
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      eventId: uniqueId("event-overload"),
    }));

    expect(first.status).toBe(200);
    expect(overloaded.status).toBe(429);
    expect(overloaded.body.error).toBe("voice_budget_exceeded");
    expect(typeof overloaded.body.message).toBe("string");
    expect(overloaded.body.details?.scope).toBe("mission_window");
  });

  it("proxies configured backend audio bytes", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "0";
    const upstreamApp = express();
    upstreamApp.use(express.json());
    upstreamApp.post("/speak", (_req, res) => {
      res.setHeader("content-type", "audio/wav");
      res.status(200).send(Buffer.from("RIFFTESTWAVE", "utf8"));
    });
    const upstreamServer = await new Promise<Server>((resolve) => {
      const server = upstreamApp.listen(0, () => resolve(server));
    });

    try {
      const address = upstreamServer.address();
      if (!address || typeof address !== "object") {
        throw new Error("Failed to resolve upstream listen port");
      }
      process.env.TTS_BASE_URL = `http://127.0.0.1:${address.port}`;
      const app = buildApp();

      const res = await request(app)
        .post("/api/voice/speak")
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        })
        .send(withAcceptedCalloutAuthority({
          text: "Proxy this voice message.",
          mode: "callout",
          priority: "action",
          missionId: uniqueId("mission-audio"),
          eventId: uniqueId("event-audio"),
          evidenceRefs: ["docs/helix-ask-flow.md#L1"],
        }));

      expect(res.status).toBe(200);
      expect(res.headers["x-voice-provider"]).toBe("proxy");
      expect(res.headers["content-type"]).toContain("audio/wav");
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect((res.body as Buffer).length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    }
  });

  it("calls elevenlabs provider when configured", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "0";
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-default";
    process.env.ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
    process.env.ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
    const upstreamApp = express();
    upstreamApp.use(express.json());
    upstreamApp.post("/v1/text-to-speech/:voiceId", (req, res) => {
      expect(req.headers["xi-api-key"]).toBe("test-elevenlabs-key");
      expect(req.params.voiceId).toBe("voice-custom");
      res.setHeader("content-type", "audio/mpeg");
      res.status(200).send(Buffer.from("ID3TESTAUDIO", "utf8"));
    });
    const upstreamServer = await new Promise<Server>((resolve) => {
      const server = upstreamApp.listen(0, () => resolve(server));
    });

    try {
      const address = upstreamServer.address();
      if (!address || typeof address !== "object") {
        throw new Error("Failed to resolve upstream listen port");
      }
      process.env.ELEVENLABS_API_BASE = `http://127.0.0.1:${address.port}`;
      const app = buildApp();

      const res = await request(app)
        .post("/api/voice/speak")
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        })
        .send({
          text: "Read this with ElevenLabs.",
          provider: "elevenlabs",
          voice_profile_id: "voice-custom",
          mode: "briefing",
          priority: "info",
        });

      expect(res.status).toBe(200);
      expect(res.headers["x-voice-provider"]).toBe("elevenlabs");
      expect(res.headers["x-voice-profile"]).toBe("voice-custom");
      expect(res.headers["content-type"]).toContain("audio/mpeg");
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect((res.body as Buffer).length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    }
  });

  it("serves repeated chunked speak payloads from short-lived cache", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "0";
    process.env.VOICE_CHUNK_CACHE_TTL_MS = "30000";
    let callCount = 0;
    const upstreamApp = express();
    upstreamApp.use(express.json());
    upstreamApp.post("/speak", (_req, res) => {
      callCount += 1;
      res.setHeader("content-type", "audio/wav");
      res.status(200).send(Buffer.from("CACHEAUDIO", "utf8"));
    });
    const upstreamServer = await new Promise<Server>((resolve) => {
      const server = upstreamApp.listen(0, () => resolve(server));
    });

    try {
      const address = upstreamServer.address();
      if (!address || typeof address !== "object") {
        throw new Error("Failed to resolve upstream listen port");
      }
      process.env.TTS_BASE_URL = `http://127.0.0.1:${address.port}`;
      const app = buildApp();
      const payload = {
        text: "Chunked brief one.",
        mode: "briefing",
        utteranceId: "utt-cache-1",
        chunkIndex: 0,
        chunkCount: 1,
        chunkKind: "brief",
        turnKey: "turn-cache-1",
      };

      const first = await request(app).post("/api/voice/speak").send(payload);
      const second = await request(app).post("/api/voice/speak").send(payload);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.headers["x-voice-cache"]).toBe("miss");
      expect(second.headers["x-voice-cache"]).toBe("hit");
      expect(callCount).toBe(1);
    } finally {
      await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    }
  });

  it("retries transient backend failures once before succeeding", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "0";
    let callCount = 0;
    const upstreamApp = express();
    upstreamApp.use(express.json());
    upstreamApp.post("/speak", (_req, res) => {
      callCount += 1;
      if (callCount === 1) {
        res.status(500).json({ error: "transient_failure" });
        return;
      }
      res.setHeader("content-type", "audio/wav");
      res.status(200).send(Buffer.from("RETRYOK", "utf8"));
    });
    const upstreamServer = await new Promise<Server>((resolve) => {
      const server = upstreamApp.listen(0, () => resolve(server));
    });

    try {
      const address = upstreamServer.address();
      if (!address || typeof address !== "object") {
        throw new Error("Failed to resolve upstream listen port");
      }
      process.env.TTS_BASE_URL = `http://127.0.0.1:${address.port}`;
      const app = buildApp();

      const res = await request(app)
        .post("/api/voice/speak")
        .send({
          text: "Retry this chunk.",
          mode: "briefing",
          utteranceId: "utt-retry-1",
          chunkIndex: 0,
          chunkCount: 1,
          chunkKind: "brief",
          turnKey: "turn-retry-1",
        });

      expect(res.status).toBe(200);
      expect(res.headers["x-voice-cache"]).toBe("miss");
      expect(callCount).toBe(2);
    } finally {
      await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    }
  });

  it("suppresses non-eligible context callouts", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Context ping",
      priority: "warn",
      contextTier: "tier0",
      sessionState: "idle",
      voiceMode: "normal",
      traceId: "trace-context-suppress",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("voice_context_ineligible");
    expect(res.body.traceId).toBe("trace-context-suppress");
  });

  it("allows briefing mode even when context callout gate is ineligible", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Briefing voice lane update",
      mode: "briefing",
      priority: "info",
      contextTier: "tier0",
      sessionState: "idle",
      voiceMode: "off",
      traceId: "trace-briefing-context-bypass",
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.suppressed ?? false).toBe(false);
    expect(res.body.traceId).toBe("trace-briefing-context-bypass");
  });


  it("suppresses mission callout without source authority before evidence parity", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Mission callout without evidence",
      mode: "callout",
      missionId: uniqueId("mission-parity"),
      priority: "action",
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("missing_accepted_arbitration_candidate");
  });

  it("suppresses mission callout even with explicit repoAttributed false when source authority is omitted", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Mission callout without evidence explicit false",
      mode: "callout",
      missionId: uniqueId("mission-nonrepo"),
      priority: "action",
      repoAttributed: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("missing_accepted_arbitration_candidate");
  });

  it("suppresses when voice certainty exceeds text certainty", async () => {
    process.env.VOICE_PROXY_DRY_RUN = "1";
    const app = buildApp();

    const res = await request(app).post("/api/voice/speak").send({
      text: "Critical certainty mismatch",
      priority: "action",
      textCertainty: "reasoned",
      voiceCertainty: "confirmed",
      deterministic: true,
      evidenceRefs: ["docs/helix-ask-flow.md#L1"],
      repoAttributed: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(res.body.reason).toBe("contract_violation");
  });
});
