import { beforeEach, describe, expect, it } from "vitest";
import { lumaGenerateHandler } from "../server/skills/luma.generate";
import { getEnvelope, resetEnvelopeStore } from "../server/services/essence/store";
import { withLumaGenerationProvenance } from "../server/services/luma";

describe("luma.generate tool", () => {
  beforeEach(async () => {
    await resetEnvelopeStore();
  });

  it("collapses outputs to Essence with provenance metadata", async () => {
    const result = await lumaGenerateHandler(
      { prompt: "Alpha warp bubble shimmering over the cradle" },
      { sessionId: "session-essence", personaId: "alice", goal: "illustrate alpha bubble" },
    );

    expect(result.essence_id).toMatch(/[a-f0-9-]{36}/i);
    expect(result.mime).toBe("image/svg+xml");
    expect(result.model).toBe("sd15-lcm");
    expect(result.version.length).toBeGreaterThan(0);
    expect(result.steps).toBe(4);
    expect(result.slicing).toBe(true);
    expect(result.lora_adapter).toContain("lcm");
    expect(result.data_url).toMatch(/^data:image\/svg\+xml;base64,/);

    const enriched = withLumaGenerationProvenance(result, {
      provenance_class: "synthetic",
      maturity: "certifying",
      certifying: true,
    });
    expect(enriched.essence_id).toBe(result.essence_id);
    expect(enriched.provenance.provenance_class).toBe("synthetic");
    expect(enriched.provenance.maturity).toBe("diagnostic");
    expect(enriched.provenance.certifying).toBe(false);

    const envelope = await getEnvelope(result.essence_id);
    expect(envelope).not.toBeNull();
    if (!envelope) {
      return;
    }
    expect(envelope.header.source.creator_id).toBe("alice");
    expect(envelope.header.modality).toBe("image");
    expect(envelope.header.source.uri).toMatch(/^storage:\/\/(fs|s3)\//);
    expect(envelope.header.source.cid).toMatch(/^cid:[a-f0-9]{64}$/i);
    expect(envelope.provenance.pipeline).toHaveLength(1);
    const step = envelope.provenance.pipeline[0];
    expect(step.seed).toBe(String(result.seed));
    expect(step.params.engine).toBe(result.model);
    expect(step.params.lora_adapter).toBe(result.lora_adapter);
    expect(step.output_hash.value.length).toBeGreaterThan(0);
  });
});
