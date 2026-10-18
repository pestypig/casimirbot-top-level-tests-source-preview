import { beforeEach, describe, expect, it } from "vitest";
import { sttWhisperHandler, __resetWhisperPool } from "../server/skills/stt.whisper";
import { getEnvelope, resetEnvelopeStore } from "../server/services/essence/store";

const baseCtx = { sessionId: "sess-stt", goal: "transcribe audio", personaId: "chat-e" };

describe("stt.whisper tool", () => {
  beforeEach(async () => {
    await resetEnvelopeStore();
    __resetWhisperPool();
    delete process.env.STT_GPU_CONCURRENCY;
    delete process.env.STT_FORCE_CPU;
  });

  it("collapses INT8 transcripts to Essence with provenance metadata", async () => {
    const audioText = "Alpha bubble is stable. Begin handoff now.";
    const payload = {
      audio_base64: Buffer.from(audioText, "utf8").toString("base64"),
      language: "en",
      duration_ms: 2400,
    };

    const result = await sttWhisperHandler(payload, baseCtx);

    expect(result.essence_id).toMatch(/[a-f0-9-]{36}/i);
    expect(result.essence_url).toContain(result.essence_id);
    expect(result.device).toBe("gpu");
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.partials.length).toBeGreaterThan(0);
    expect(result.text).toContain("Alpha bubble is stable");

    const envelope = await getEnvelope(result.essence_id);
    expect(envelope?.header.source.creator_id).toBe("chat-e");
    expect(envelope?.header.source.uri).toMatch(/^storage:\/\/(fs|s3)\//);
    expect(envelope?.header.source.cid).toMatch(/^cid:[a-f0-9]{64}$/i);
    expect(envelope?.features?.audio?.duration_ms).toBe(2400);
    expect(envelope?.provenance.pipeline[0].name).toBe("faster-whisper");
  });

  it("streams partials and falls back to CPU when the GPU pool is saturated", async () => {
    process.env.STT_GPU_CONCURRENCY = "1";
    const gpuChunks: any[] = [];
    const cpuChunks: any[] = [];

    const firstCall = sttWhisperHandler(
      { audio_base64: Buffer.from("Chart Casimir logs now.", "utf8").toString("base64"), language: "en" },
      { ...baseCtx, emitPartial: (chunk: unknown) => gpuChunks.push(chunk) },
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    const secondCall = sttWhisperHandler(
      { audio_base64: Buffer.from("Secondary capture path armed.", "utf8").toString("base64"), language: "en" },
      { ...baseCtx, emitPartial: (chunk: unknown) => cpuChunks.push(chunk) },
    );

    const [firstResult, secondResult] = await Promise.all([firstCall, secondCall]);

    expect(firstResult.device).toBe("gpu");
    expect(secondResult.device).toBe("cpu");
    expect(gpuChunks.length).toBeGreaterThan(0);
    expect(cpuChunks.length).toBeGreaterThan(0);
    expect((gpuChunks.at(-1) as any)?.final).toBe(true);
    expect((cpuChunks.at(-1) as any)?.device).toBe("cpu");

    delete process.env.STT_GPU_CONCURRENCY;
  });
});
