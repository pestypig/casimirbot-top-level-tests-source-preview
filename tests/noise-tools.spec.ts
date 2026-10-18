import { beforeEach, describe, expect, it } from "vitest";
import { noiseGenCoverHandler } from "../server/skills/noise.gen.cover";
import { noiseGenFingerprintHandler } from "../server/skills/noise.gen.fingerprint";
import { getEnvelope, resetEnvelopeStore } from "../server/services/essence/store";

describe("noise tools", () => {
  beforeEach(async () => {
    await resetEnvelopeStore();
  });

  it("collapses cover audio to Essence with provenance metadata", async () => {
    const result = await noiseGenCoverHandler(
      {
        duration_ms: 900,
        sample_rate: 16_000,
        channels: 1,
        seed: 1234,
        tone_hz: 330,
        noise_mix: 0.55,
      },
      { personaId: "dj-noise" },
    );

    expect(result.essence_id).toMatch(/[a-f0-9-]{36}/i);
    expect(result.preview_url).toMatch(/^data:audio\/wav;base64,/);

    const envelope = await getEnvelope(result.essence_id);
    expect(envelope).not.toBeNull();
    if (!envelope) return;
    expect(envelope.header.modality).toBe("audio");
    expect(envelope.header.source.sample_rate).toBe(16_000);
    expect(envelope.header.source.channels).toBe(1);
    expect(envelope.header.source.uri).toMatch(/^storage:\/\/(fs|s3)\//);
    expect(envelope.features.audio?.duration_ms).toBeGreaterThan(0);
    expect(envelope.provenance.pipeline[0]?.name).toBe("noisegen.cover");
    expect(envelope.provenance.information_boundary?.inputs_hash).toMatch(/^sha256:/);
  });

  it("writes a noise fingerprint envelope", async () => {
    const result = await noiseGenFingerprintHandler(
      { label: "Helix texture", seed: 777, peaks: 3 },
      { personaId: "dj-noise" },
    );

    expect(result.essence_id).toMatch(/[a-f0-9-]{36}/i);
    expect(result.fingerprint_id).toMatch(/^[a-f0-9]{64}$/i);
    expect(result.fingerprint.eq).toHaveLength(3);

    const envelope = await getEnvelope(result.essence_id);
    expect(envelope).not.toBeNull();
    if (!envelope) return;
    expect(envelope.header.modality).toBe("text");
    expect(envelope.header.source.mime).toBe("application/json");
    expect(envelope.features.text?.summary).toContain("Noise fingerprint");
    expect(envelope.provenance.pipeline[0]?.name).toBe("noisegen.fingerprint");
  });
});
