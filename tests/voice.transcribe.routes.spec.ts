import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sttHttpHandlerMock, sttWhisperHandlerMock } = vi.hoisted(() => ({
  sttHttpHandlerMock: vi.fn(),
  sttWhisperHandlerMock: vi.fn(),
}));
const { recoverSttInvalidFormatToPcmWavMock } = vi.hoisted(() => ({
  recoverSttInvalidFormatToPcmWavMock: vi.fn(),
}));

vi.mock("../server/skills/stt.whisper.http", () => ({
  sttHttpHandler: sttHttpHandlerMock,
}));

vi.mock("../server/skills/stt.whisper", () => ({
  sttWhisperHandler: sttWhisperHandlerMock,
}));

vi.mock("../server/services/audio/stt-format-recovery", () => ({
  isSttInvalidFormatMessage: (message: string) =>
    /(invalid file format|format is not supported|could not be decoded|unsupported format)/i.test(
      message,
    ),
  recoverSttInvalidFormatToPcmWav: recoverSttInvalidFormatToPcmWavMock,
}));

import { resetVoiceRouteState, voiceRouter } from "../server/routes/voice";
import { runtimeMemoryGovernor } from "../server/services/runtime/runtime-memory-governor";

const ORIGINAL_ENV = {
  ENABLE_VOICE_TRANSCRIBE: process.env.ENABLE_VOICE_TRANSCRIBE,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  WHISPER_HTTP_API_KEY: process.env.WHISPER_HTTP_API_KEY,
  WHISPER_HTTP_MODEL: process.env.WHISPER_HTTP_MODEL,
  STT_POLICY_MODE: process.env.STT_POLICY_MODE,
  STT_OUTPUT_MODE: process.env.STT_OUTPUT_MODE,
  STT_LOCAL_URL: process.env.STT_LOCAL_URL,
  STT_LOCAL_MODE: process.env.STT_LOCAL_MODE,
  STT_LOCAL_API_KEY: process.env.STT_LOCAL_API_KEY,
  STT_LOCAL_MODEL: process.env.STT_LOCAL_MODEL,
  STT_LOCAL_EMBEDDED_ENABLED: process.env.STT_LOCAL_EMBEDDED_ENABLED,
  WHISPER_HTTP_URL: process.env.WHISPER_HTTP_URL,
  HELIX_VOICE_COMMAND_LANE_ENABLED: process.env.HELIX_VOICE_COMMAND_LANE_ENABLED,
  HELIX_VOICE_COMMAND_LANE_LOG_ONLY: process.env.HELIX_VOICE_COMMAND_LANE_LOG_ONLY,
  HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT: process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT,
  HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE: process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE,
  HELIX_VOICE_COMMAND_LANE_KILL_SWITCH: process.env.HELIX_VOICE_COMMAND_LANE_KILL_SWITCH,
  RUNTIME_TASK_VOICE_STT_BURST_LIMIT: process.env.RUNTIME_TASK_VOICE_STT_BURST_LIMIT,
  RUNTIME_TASK_VOICE_STT_BURST_WINDOW_MS: process.env.RUNTIME_TASK_VOICE_STT_BURST_WINDOW_MS,
};

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/voice", voiceRouter);
  return app;
};

describe("voice transcribe route", () => {
  beforeEach(() => {
    resetVoiceRouteState();
    runtimeMemoryGovernor.resetRuntimeMemoryGovernorForTests();
    sttHttpHandlerMock.mockReset();
    sttWhisperHandlerMock.mockReset();
    recoverSttInvalidFormatToPcmWavMock.mockReset();
    delete process.env.ENABLE_VOICE_TRANSCRIBE;
    delete process.env.OPENAI_API_KEY;
    delete process.env.WHISPER_HTTP_API_KEY;
    delete process.env.WHISPER_HTTP_MODEL;
    delete process.env.STT_POLICY_MODE;
    delete process.env.STT_OUTPUT_MODE;
    delete process.env.STT_LOCAL_URL;
    delete process.env.STT_LOCAL_MODE;
    delete process.env.STT_LOCAL_API_KEY;
    delete process.env.STT_LOCAL_MODEL;
    process.env.STT_LOCAL_EMBEDDED_ENABLED = "0";
    delete process.env.WHISPER_HTTP_URL;
    delete process.env.HELIX_VOICE_COMMAND_LANE_ENABLED;
    delete process.env.HELIX_VOICE_COMMAND_LANE_LOG_ONLY;
    delete process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT;
    delete process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE;
    delete process.env.HELIX_VOICE_COMMAND_LANE_KILL_SWITCH;
    delete process.env.RUNTIME_TASK_VOICE_STT_BURST_LIMIT;
    delete process.env.RUNTIME_TASK_VOICE_STT_BURST_WINDOW_MS;
  });

  afterEach(() => {
    resetVoiceRouteState();
    runtimeMemoryGovernor.resetRuntimeMemoryGovernorForTests();
    if (ORIGINAL_ENV.ENABLE_VOICE_TRANSCRIBE === undefined) {
      delete process.env.ENABLE_VOICE_TRANSCRIBE;
    } else {
      process.env.ENABLE_VOICE_TRANSCRIBE = ORIGINAL_ENV.ENABLE_VOICE_TRANSCRIBE;
    }
    if (ORIGINAL_ENV.OPENAI_API_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;
    }
    if (ORIGINAL_ENV.WHISPER_HTTP_API_KEY === undefined) {
      delete process.env.WHISPER_HTTP_API_KEY;
    } else {
      process.env.WHISPER_HTTP_API_KEY = ORIGINAL_ENV.WHISPER_HTTP_API_KEY;
    }
    if (ORIGINAL_ENV.WHISPER_HTTP_MODEL === undefined) {
      delete process.env.WHISPER_HTTP_MODEL;
    } else {
      process.env.WHISPER_HTTP_MODEL = ORIGINAL_ENV.WHISPER_HTTP_MODEL;
    }
    if (ORIGINAL_ENV.STT_POLICY_MODE === undefined) {
      delete process.env.STT_POLICY_MODE;
    } else {
      process.env.STT_POLICY_MODE = ORIGINAL_ENV.STT_POLICY_MODE;
    }
    if (ORIGINAL_ENV.STT_OUTPUT_MODE === undefined) {
      delete process.env.STT_OUTPUT_MODE;
    } else {
      process.env.STT_OUTPUT_MODE = ORIGINAL_ENV.STT_OUTPUT_MODE;
    }
    if (ORIGINAL_ENV.STT_LOCAL_URL === undefined) {
      delete process.env.STT_LOCAL_URL;
    } else {
      process.env.STT_LOCAL_URL = ORIGINAL_ENV.STT_LOCAL_URL;
    }
    if (ORIGINAL_ENV.STT_LOCAL_MODE === undefined) {
      delete process.env.STT_LOCAL_MODE;
    } else {
      process.env.STT_LOCAL_MODE = ORIGINAL_ENV.STT_LOCAL_MODE;
    }
    if (ORIGINAL_ENV.STT_LOCAL_API_KEY === undefined) {
      delete process.env.STT_LOCAL_API_KEY;
    } else {
      process.env.STT_LOCAL_API_KEY = ORIGINAL_ENV.STT_LOCAL_API_KEY;
    }
    if (ORIGINAL_ENV.STT_LOCAL_MODEL === undefined) {
      delete process.env.STT_LOCAL_MODEL;
    } else {
      process.env.STT_LOCAL_MODEL = ORIGINAL_ENV.STT_LOCAL_MODEL;
    }
    if (ORIGINAL_ENV.STT_LOCAL_EMBEDDED_ENABLED === undefined) {
      delete process.env.STT_LOCAL_EMBEDDED_ENABLED;
    } else {
      process.env.STT_LOCAL_EMBEDDED_ENABLED = ORIGINAL_ENV.STT_LOCAL_EMBEDDED_ENABLED;
    }
    if (ORIGINAL_ENV.WHISPER_HTTP_URL === undefined) {
      delete process.env.WHISPER_HTTP_URL;
    } else {
      process.env.WHISPER_HTTP_URL = ORIGINAL_ENV.WHISPER_HTTP_URL;
    }
    if (ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_ENABLED === undefined) {
      delete process.env.HELIX_VOICE_COMMAND_LANE_ENABLED;
    } else {
      process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_ENABLED;
    }
    if (ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_LOG_ONLY === undefined) {
      delete process.env.HELIX_VOICE_COMMAND_LANE_LOG_ONLY;
    } else {
      process.env.HELIX_VOICE_COMMAND_LANE_LOG_ONLY = ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_LOG_ONLY;
    }
    if (ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT === undefined) {
      delete process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT;
    } else {
      process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT;
    }
    if (ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE === undefined) {
      delete process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE;
    } else {
      process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE =
        ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE;
    }
    if (ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_KILL_SWITCH === undefined) {
      delete process.env.HELIX_VOICE_COMMAND_LANE_KILL_SWITCH;
    } else {
      process.env.HELIX_VOICE_COMMAND_LANE_KILL_SWITCH = ORIGINAL_ENV.HELIX_VOICE_COMMAND_LANE_KILL_SWITCH;
    }
    if (ORIGINAL_ENV.RUNTIME_TASK_VOICE_STT_BURST_LIMIT === undefined) {
      delete process.env.RUNTIME_TASK_VOICE_STT_BURST_LIMIT;
    } else {
      process.env.RUNTIME_TASK_VOICE_STT_BURST_LIMIT = ORIGINAL_ENV.RUNTIME_TASK_VOICE_STT_BURST_LIMIT;
    }
    if (ORIGINAL_ENV.RUNTIME_TASK_VOICE_STT_BURST_WINDOW_MS === undefined) {
      delete process.env.RUNTIME_TASK_VOICE_STT_BURST_WINDOW_MS;
    } else {
      process.env.RUNTIME_TASK_VOICE_STT_BURST_WINDOW_MS = ORIGINAL_ENV.RUNTIME_TASK_VOICE_STT_BURST_WINDOW_MS;
    }
  });

  it("returns deterministic transcription JSON for OpenAI-first uploads", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    sttHttpHandlerMock.mockResolvedValue({
      text: "Alpha bubble stable.",
      language: "en",
      duration_ms: 1200,
      segments: [{ text: "Alpha bubble stable.", start_ms: 0, end_ms: 1200, confidence: 0.98 }],
      essence_id: "essence-1",
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-1")
      .field("missionId", "mission-1")
      .field("durationMs", "1200")
      .attach("audio", Buffer.from("RIFF....WAVE"), {
        filename: "input.wav",
        contentType: "audio/wav",
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      text: "Alpha bubble stable.",
      language: "en",
      duration_ms: 1200,
      segments: [{ text: "Alpha bubble stable.", start_ms: 0, end_ms: 1200, confidence: 0.98 }],
      source_text: null,
      source_language: null,
      translated: false,
      confidence: 0.98,
      confidence_reason: "segment_average",
      needs_confirmation: false,
      translation_uncertain: false,
      language_detected: "en",
      language_confidence: 0.9079999999999999,
      code_mixed: false,
      pivot_confidence: 1,
      dispatch_state: "auto",
      lang_schema_version: "helix.lang.v1",
      speaker_id: null,
      speaker_confidence: null,
      speech_probability: null,
      snr_db: null,
      confirm_auto_eligible: null,
      confirm_block_reason: null,
      traceId: "trace-1",
      missionId: "mission-1",
      mission_id: "mission-1",
      room_id: null,
      thread_id: null,
      capture_session_id: null,
      chunk_index: null,
      capture_source: "mic",
      engine: "openai_transcribe",
      essence_id: "essence-1",
      interpreter: null,
      interpreter_schema_version: null,
      interpreter_status: null,
      interpreter_confidence: null,
      interpreter_dispatch_state: null,
      interpreter_confirm_prompt: null,
      interpreter_term_ids: [],
      interpreter_concept_ids: [],
      command_lane: {
        version: "helix.voice.command_lane.v1",
        decision: "none",
        action: null,
        confidence: null,
        source: "none",
        suppression_reason: "disabled",
        strict_prefix_applied: false,
        confirm_required: false,
        utterance_id: expect.stringMatching(/^vcmd:/),
      },
    });
    expect(sttHttpHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio_url: expect.stringContaining("data:audio/wav;base64,"),
        task: "transcribe",
        backend_mode: "openai",
        backend_url: "https://api.openai.com",
        api_key: "openai-key",
        model: "gpt-4o-mini-transcribe",
        duration_ms: 1200,
      }),
      { personaId: "mission-1" },
    );
    expect(sttWhisperHandlerMock).not.toHaveBeenCalled();
  });

  it("accepts a prefixed send command under adaptive strict-prefix in noisy audio", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";
    sttHttpHandlerMock.mockResolvedValue({
      text: "helix send",
      language: "en",
      duration_ms: 500,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("snr_db", "6")
      .field("speech_probability", "0.42")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "accepted",
      action: "send",
      source: "parser",
      strict_prefix_applied: true,
      confirm_required: true,
    });
  });

  it("suppresses unprefixed send command under adaptive strict-prefix in noisy audio", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";
    sttHttpHandlerMock.mockResolvedValue({
      text: "send",
      language: "en",
      duration_ms: 500,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("snr_db", "6")
      .field("speech_probability", "0.42")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "suppressed",
      action: "send",
      source: "parser",
      suppression_reason: "strict_prefix_required",
      strict_prefix_applied: true,
      confirm_required: false,
    });
  });

  it("keeps mid-sentence command keywords in dictation flow", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    sttHttpHandlerMock.mockResolvedValue({
      text: "please explain how we retry the warp solver in this codebase",
      language: "en",
      duration_ms: 500,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("snr_db", "20")
      .field("speech_probability", "0.94")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "none",
      action: null,
      confirm_required: false,
    });
  });

  it("treats explanatory 'send' phrasing as dictation while preserving direct send commands", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    const dictationCases = [
      "Explain what a warp bubble is in full solve send.",
      "What does send mean in this codebase?",
      "Please explain how send should behave in queued reasoning.",
    ];

    for (const [index, text] of dictationCases.entries()) {
      sttHttpHandlerMock.mockResolvedValueOnce({
        text,
        language: "en",
        duration_ms: 700,
        segments: [],
      });

      const res = await request(buildApp())
        .post("/api/voice/transcribe")
        .field("traceId", `trace-send-dictation-${index}`)
        .field("snr_db", "20")
        .field("speech_probability", "0.95")
        .attach("audio", Buffer.from("voice"), {
          filename: "input.webm",
          contentType: "audio/webm",
        });

      expect(res.status).toBe(200);
      expect(res.body.command_lane).toMatchObject({
        version: "helix.voice.command_lane.v1",
        decision: "none",
        action: null,
        confirm_required: false,
      });
    }

    const commandCases = ["send", "send now", "send this"];
    for (const [index, text] of commandCases.entries()) {
      sttHttpHandlerMock.mockResolvedValueOnce({
        text,
        language: "en",
        duration_ms: 500,
        segments: [],
      });

      const res = await request(buildApp())
        .post("/api/voice/transcribe")
        .field("traceId", `trace-send-command-${index}`)
        .field("snr_db", "20")
        .field("speech_probability", "0.95")
        .attach("audio", Buffer.from("voice"), {
          filename: "input.webm",
          contentType: "audio/webm",
        });

      expect(res.status).toBe(200);
      expect(res.body.command_lane).toMatchObject({
        version: "helix.voice.command_lane.v1",
        decision: "accepted",
        action: "send",
        source: "parser",
        confirm_required: true,
      });
    }
  });

  it("treats explanatory retry/cancel phrasing as dictation while preserving direct commands", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    const dictationCases = [
      "Can you explain how retry works in this code path?",
      "Please describe when cancel should be used in the queue.",
      "What does retry mean for resumable asks?",
    ];

    for (const [index, text] of dictationCases.entries()) {
      sttHttpHandlerMock.mockResolvedValueOnce({
        text,
        language: "en",
        duration_ms: 700,
        segments: [],
      });

      const res = await request(buildApp())
        .post("/api/voice/transcribe")
        .field("traceId", `trace-retry-cancel-dictation-${index}`)
        .field("snr_db", "20")
        .field("speech_probability", "0.95")
        .attach("audio", Buffer.from("voice"), {
          filename: "input.webm",
          contentType: "audio/webm",
        });

      expect(res.status).toBe(200);
      expect(res.body.command_lane).toMatchObject({
        version: "helix.voice.command_lane.v1",
        decision: "none",
        action: null,
        confirm_required: false,
      });
    }

    const commandCases: Array<{ text: string; action: "retry" | "cancel" }> = [
      { text: "retry", action: "retry" },
      { text: "retry that", action: "retry" },
      { text: "cancel", action: "cancel" },
      { text: "stop", action: "cancel" },
    ];

    for (const [index, { text, action }] of commandCases.entries()) {
      sttHttpHandlerMock.mockResolvedValueOnce({
        text,
        language: "en",
        duration_ms: 500,
        segments: [],
      });

      const res = await request(buildApp())
        .post("/api/voice/transcribe")
        .field("traceId", `trace-retry-cancel-command-${index}`)
        .field("snr_db", "20")
        .field("speech_probability", "0.95")
        .attach("audio", Buffer.from("voice"), {
          filename: "input.webm",
          contentType: "audio/webm",
        });

      expect(res.status).toBe(200);
      expect(res.body.command_lane).toMatchObject({
        version: "helix.voice.command_lane.v1",
        decision: "accepted",
        action,
        source: "parser",
        confirm_required: true,
      });
    }
  });

  it("accepts trailing cancel control in mixed dictation utterances", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "Okay, explain what a warp bubble is. Cancel that. Keep listening.",
      language: "en",
      duration_ms: 900,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-trailing-cancel-control")
      .field("snr_db", "20")
      .field("speech_probability", "0.95")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "accepted",
      action: "cancel",
      source: "parser",
      confirm_required: true,
    });
  });

  it("accepts trailing cancel control in no-punctuation STT variants", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "okay explain what a warp bubble is cancel that keep listening",
      language: "en",
      duration_ms: 900,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-trailing-cancel-no-punctuation")
      .field("snr_db", "20")
      .field("speech_probability", "0.95")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "accepted",
      action: "cancel",
      source: "parser",
      confirm_required: true,
    });
  });

  it("accepts direct negative-send phrasing as cancel control", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "Don't send that yet",
      language: "en",
      duration_ms: 700,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-negative-send-cancel")
      .field("snr_db", "20")
      .field("speech_probability", "0.95")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "accepted",
      action: "cancel",
      source: "parser",
      confirm_required: true,
    });
  });

  it("keeps explicit negation of cancel and semantic stop comparisons in dictation flow", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    const dictationCases = [
      "not cancel keep going",
      "stop talking not stop processing",
    ];

    for (const [index, text] of dictationCases.entries()) {
      sttHttpHandlerMock.mockResolvedValueOnce({
        text,
        language: "en",
        duration_ms: 700,
        segments: [],
      });

      const res = await request(buildApp())
        .post("/api/voice/transcribe")
        .field("traceId", `trace-negation-dictation-${index}`)
        .field("snr_db", "20")
        .field("speech_probability", "0.95")
        .attach("audio", Buffer.from("voice"), {
          filename: "input.webm",
          contentType: "audio/webm",
        });

      expect(res.status).toBe(200);
      expect(res.body.command_lane).toMatchObject({
        version: "helix.voice.command_lane.v1",
        decision: "none",
        action: null,
        confirm_required: false,
      });
    }
  });

  it("supports mixed control wording: send-keep-listening and cancel-then-retry", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "send this part then keep listening",
      language: "en",
      duration_ms: 700,
      segments: [],
    });
    const sendKeepListeningRes = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-send-keep-listening")
      .field("snr_db", "20")
      .field("speech_probability", "0.95")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });
    expect(sendKeepListeningRes.status).toBe(200);
    expect(sendKeepListeningRes.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "accepted",
      action: "send",
      source: "parser",
      confirm_required: true,
    });

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "cancel that. actually retry.",
      language: "en",
      duration_ms: 700,
      segments: [],
    });
    const cancelRetryRes = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-cancel-then-retry")
      .field("snr_db", "20")
      .field("speech_probability", "0.95")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });
    expect(cancelRetryRes.status).toBe(200);
    expect(cancelRetryRes.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "accepted",
      action: "retry",
      source: "parser",
      confirm_required: true,
    });
  });

  it("accepts prefixed cancel control in noisy adaptive strict-prefix mode", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "okay helix cancel that",
      language: "en",
      duration_ms: 500,
      segments: [],
    });
    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-noisy-prefixed-cancel")
      .field("snr_db", "6")
      .field("speech_probability", "0.42")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });
    expect(res.status).toBe(200);
    expect(res.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "accepted",
      action: "cancel",
      source: "parser",
      strict_prefix_applied: true,
      confirm_required: true,
    });
  });

  it("keeps noisy-mode safety: retry requires prefix while cancel does not", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "retry",
      language: "en",
      duration_ms: 500,
      segments: [],
    });
    const noisyRetryRes = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-noisy-retry-unprefixed")
      .field("snr_db", "6")
      .field("speech_probability", "0.42")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });
    expect(noisyRetryRes.status).toBe(200);
    expect(noisyRetryRes.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "suppressed",
      action: "retry",
      source: "parser",
      suppression_reason: "strict_prefix_required",
      strict_prefix_applied: true,
      confirm_required: false,
    });

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "cancel",
      language: "en",
      duration_ms: 500,
      segments: [],
    });
    const noisyCancelRes = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-noisy-cancel-unprefixed")
      .field("snr_db", "6")
      .field("speech_probability", "0.42")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });
    expect(noisyCancelRes.status).toBe(200);
    expect(noisyCancelRes.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "accepted",
      action: "cancel",
      source: "parser",
      strict_prefix_applied: true,
      confirm_required: true,
    });
  });

  it("keeps mixed social utterances with command words in dictation flow", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    const mixedDictationCases = [
      "Explain retry then send?",
      "At the bar we said send but keep explaining the code path.",
      "Can you compare cancel versus retry behavior in this queue?",
      "I want the meaning of send in this system, not a command.",
    ];

    for (const [index, text] of mixedDictationCases.entries()) {
      sttHttpHandlerMock.mockResolvedValueOnce({
        text,
        language: "en",
        duration_ms: 800,
        segments: [],
      });

      const res = await request(buildApp())
        .post("/api/voice/transcribe")
        .field("traceId", `trace-mixed-social-${index}`)
        .field("snr_db", "8")
        .field("speech_probability", "0.48")
        .attach("audio", Buffer.from("voice"), {
          filename: "input.webm",
          contentType: "audio/webm",
        });

      expect(res.status).toBe(200);
      expect(res.body.command_lane).toMatchObject({
        version: "helix.voice.command_lane.v1",
        decision: "none",
        action: null,
        confirm_required: false,
      });
    }
  });

  it("suppresses command lane for non-mic display audio sources", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "send it",
      language: "en",
      duration_ms: 500,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-display-audio")
      .field("room_id", "room-1")
      .field("thread_id", "thread-1")
      .field("capture_session_id", "capture-1")
      .field("chunk_index", "2")
      .field("capture_source", "display_tab_audio")
      .field("command_lane_enabled", "1")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      text: "send it",
      room_id: "room-1",
      thread_id: "thread-1",
      capture_session_id: "capture-1",
      chunk_index: 2,
      capture_source: "display_tab_audio",
      command_lane: {
        version: "helix.voice.command_lane.v1",
        decision: "none",
        action: null,
        source: "none",
        suppression_reason: "non_user_audio_source",
        confirm_required: false,
      },
    });
  });

  it("accepts explicit prefixed retry command in noisy social conditions", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.HELIX_VOICE_COMMAND_LANE_ENABLED = "1";
    process.env.HELIX_VOICE_COMMAND_LANE_ACTIVE_PERCENT = "100";
    process.env.HELIX_VOICE_COMMAND_LANE_STRICT_PREFIX_MODE = "adaptive";

    sttHttpHandlerMock.mockResolvedValueOnce({
      text: "helix retry",
      language: "en",
      duration_ms: 500,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-noisy-prefixed-retry")
      .field("snr_db", "6")
      .field("speech_probability", "0.42")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.command_lane).toMatchObject({
      version: "helix.voice.command_lane.v1",
      decision: "accepted",
      action: "retry",
      source: "parser",
      strict_prefix_applied: true,
      confirm_required: true,
    });
  });

  it("uses OPENAI_API_KEY first for OpenAI STT backend auth", async () => {
    process.env.WHISPER_HTTP_API_KEY = "stt-key";
    process.env.OPENAI_API_KEY = "openai-key";
    sttHttpHandlerMock.mockResolvedValue({
      text: "Key precedence check",
      language: "en",
      duration_ms: 500,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(sttHttpHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        api_key: "openai-key",
      }),
      expect.anything(),
    );
  });

  it("keeps OpenAI-first backend pinned to OpenAI base even when WHISPER_HTTP_URL is set", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.WHISPER_HTTP_URL = "http://127.0.0.1:9999";
    sttHttpHandlerMock.mockResolvedValue({
      text: "Pinned OpenAI backend",
      language: "en",
      duration_ms: 500,
      segments: [],
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(sttHttpHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backend_mode: "openai",
        backend_url: "https://api.openai.com",
        api_key: "openai-key",
      }),
      expect.anything(),
    );
  });

  it("fails closed when audio is missing", async () => {
    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-missing");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("voice_invalid_request");
    expect(res.body.message).toBe("Audio upload is required.");
    expect(res.body.details).toEqual({ field: "audio" });
    expect(res.body.traceId).toBe("trace-missing");
    expect(sttHttpHandlerMock).not.toHaveBeenCalled();
  });

  it("returns voice_unavailable when transcription is disabled", async () => {
    process.env.ENABLE_VOICE_TRANSCRIBE = "0";

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-disabled")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("voice_unavailable");
    expect(res.body.traceId).toBe("trace-disabled");
    expect(res.body.details).toEqual({ transcriptionEnabled: false });
    expect(sttHttpHandlerMock).not.toHaveBeenCalled();
  });

  it("returns voice_unavailable when policy backend is unconfigured", async () => {
    process.env.STT_POLICY_MODE = "local_only";
    process.env.STT_LOCAL_EMBEDDED_ENABLED = "0";
    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-unconfigured")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("voice_unavailable");
    expect(res.body.message).toBe("Voice transcription backend is not configured.");
    expect(res.body.traceId).toBe("trace-unconfigured");
    expect(res.body.details.policyMode).toBe("local_only");
    expect(sttHttpHandlerMock).not.toHaveBeenCalled();
    expect(sttWhisperHandlerMock).not.toHaveBeenCalled();
  });

  it("translates non-English transcription to English by default", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    sttHttpHandlerMock
      .mockResolvedValueOnce({
        text: "Hola, sistema.",
        language: "es",
        duration_ms: 900,
        segments: [{ text: "Hola, sistema.", start_ms: 0, end_ms: 900, confidence: 0.94 }],
      })
      .mockResolvedValueOnce({
        text: "Hello, system.",
        language: "en",
        duration_ms: 900,
        segments: [],
      });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-translate")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Hello, system.");
    expect(res.body.language).toBe("en");
    expect(res.body.source_text).toBe("Hola, sistema.");
    expect(res.body.source_language).toBe("es");
    expect(res.body.translated).toBe(true);
    expect(sttHttpHandlerMock).toHaveBeenCalledTimes(2);
    expect(sttHttpHandlerMock.mock.calls[1][0]).toMatchObject({
      task: "translate",
      model: "whisper-1",
    });
  });

  it("falls back to local backend when OpenAI-first transcription fails", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.STT_LOCAL_URL = "http://127.0.0.1:7777";
    process.env.STT_LOCAL_MODE = "generic";
    sttHttpHandlerMock
      .mockRejectedValueOnce(new Error("STT HTTP 503"))
      .mockResolvedValueOnce({
        text: "Fallback transcript",
        language: "en",
        duration_ms: 400,
        segments: [],
      });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-fallback")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Fallback transcript");
    expect(res.body.engine).toBe("faster_whisper_local");
    expect(sttHttpHandlerMock).toHaveBeenCalledTimes(2);
    expect(sttHttpHandlerMock.mock.calls[1][0]).toMatchObject({
      backend_url: "http://127.0.0.1:7777",
      backend_mode: "generic",
      task: "transcribe",
    });
  });

  it("returns stable backend errors when all configured backends fail", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    sttHttpHandlerMock.mockRejectedValue(new Error("STT HTTP 503"));

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-backend")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("voice_backend_error");
    expect(res.body.message).toBe("Voice transcription failed.");
    expect(res.body.traceId).toBe("trace-backend");
    expect(Array.isArray(res.body.details.attempts)).toBe(true);
    expect(res.body.details.attempts[0].engine).toBe("openai_transcribe");
    expect(sttHttpHandlerMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces provider STT rate limits as 429 with retry metadata", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    sttHttpHandlerMock.mockRejectedValue(
      new Error("STT HTTP 429: too many requests retry_after_ms=2500 rate_limit_source=provider_429"),
    );

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-rate-limit")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("voice_rate_limited");
    expect(res.body.message).toBe("Voice transcription rate limit exceeded.");
    expect(res.body.traceId).toBe("trace-rate-limit");
    expect(res.body.details.retryAfterMs).toBe(2500);
    expect(res.body.details.rateLimitSource).toBe("provider_429");
    expect(res.body.details.attempts[0]).toMatchObject({
      engine: "openai_transcribe",
      status: 429,
      retryAfterMs: 2500,
      rateLimitSource: "provider_429",
    });
  });

  it("opens a local cooldown after provider 429 and skips repeated openai STT hits", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.STT_LOCAL_EMBEDDED_ENABLED = "1";
    sttHttpHandlerMock.mockRejectedValueOnce(
      new Error("STT HTTP 429: too many requests retry_after_ms=2500 rate_limit_source=provider_429"),
    );
    sttWhisperHandlerMock.mockResolvedValue({
      text: "Local fallback transcript",
      language: "en",
      duration_ms: 400,
      segments: [],
    });

    const first = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-cooldown-1")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });
    const second = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-cooldown-2")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(first.status).toBe(200);
    expect(first.body.engine).toBe("faster_whisper_local");
    expect(second.status).toBe(200);
    expect(second.body.engine).toBe("faster_whisper_local");
    expect(sttHttpHandlerMock).toHaveBeenCalledTimes(1);
    expect(sttWhisperHandlerMock).toHaveBeenCalledTimes(2);
  });

  it("recovers invalid-format uploads with one ffmpeg wav retry", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    sttHttpHandlerMock
      .mockRejectedValueOnce(
        new Error(
          "STT HTTP 400: The audio file could not be decoded or its format is not supported.",
        ),
      )
      .mockResolvedValueOnce({
        text: "Recovered transcript",
        language: "en",
        duration_ms: 700,
        segments: [],
      });
    recoverSttInvalidFormatToPcmWavMock.mockResolvedValue({
      ok: true,
      buffer: Buffer.from("RIFF....WAVE"),
      mimeType: "audio/wav",
      fileName: "input.wav",
      ffmpegPath: "ffmpeg",
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-recover")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Recovered transcript");
    expect(res.body.engine).toBe("openai_transcribe");
    expect(sttHttpHandlerMock).toHaveBeenCalledTimes(2);
    expect(sttHttpHandlerMock.mock.calls[1][0]).toMatchObject({
      audio_url: expect.stringContaining("data:audio/wav;base64,"),
      task: "transcribe",
    });
    expect(recoverSttInvalidFormatToPcmWavMock).toHaveBeenCalledTimes(1);
  });

  it("fails deterministically when invalid-format recovery cannot run", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    sttHttpHandlerMock.mockRejectedValue(
      new Error(
        "STT HTTP 400: The audio file could not be decoded or its format is not supported.",
      ),
    );
    recoverSttInvalidFormatToPcmWavMock.mockResolvedValue({
      ok: false,
      reason: "ffmpeg_unavailable",
      ffmpegPath: "ffmpeg",
    });

    const res = await request(buildApp())
      .post("/api/voice/transcribe")
      .field("traceId", "trace-recover-fail")
      .attach("audio", Buffer.from("voice"), {
        filename: "input.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("voice_backend_error");
    expect(res.body.message).toBe("Voice transcription failed.");
    expect(res.body.traceId).toBe("trace-recover-fail");
    expect(Array.isArray(res.body.details.attempts)).toBe(true);
    expect(
      res.body.details.attempts.some(
        (attempt: { stage?: string; message?: string }) =>
          attempt.stage === "format_recovery" &&
          String(attempt.message ?? "").includes("ffmpeg_unavailable"),
      ),
    ).toBe(true);
    expect(res.body.details.formatRecovery).toMatchObject({
      attempted: true,
      succeeded: false,
      reason: "ffmpeg_unavailable",
    });
  });
});
