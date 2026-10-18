import { describe, expect, it } from "vitest";
import type { TEssenceEnvelope } from "@shared/essence-schema";
import { applyCollapseStrategy, collapseMix, MissingEssenceInputError } from "../server/services/mixer/collapse";

const now = new Date().toISOString();

const baseEnvelope = (id: string, features: TEssenceEnvelope["features"]): TEssenceEnvelope => ({
  header: {
    id,
    version: "essence/1.0",
    modality: "multimodal",
    created_at: now,
    source: {
      uri: `storage://fs/${id}`,
      original_hash: { algo: "sha256", value: "0".repeat(64) },
      creator_id: "tester",
    },
    rights: { allow_mix: true, allow_remix: true, allow_commercial: false, attribution: true },
    acl: { visibility: "public", groups: [] },
  },
  features,
  embeddings: [],
  provenance: {
    pipeline: [],
    merkle_root: { algo: "sha256", value: "0".repeat(64) },
    previous: null,
    signatures: [],
  },
});

describe("collapseMix", () => {
  const fixtures: Record<string, TEssenceEnvelope> = {
    env_text: baseEnvelope("env_text", {
      text: { transcript: "Hybrid essence transcript", lang: "en" },
    }),
    env_img: baseEnvelope("env_img", {
      image: { width: 512, height: 512, pHash: "abc123" },
    }),
    env_audio: baseEnvelope("env_audio", {
      audio: { sample_rate: 44100, duration_ms: 1234 },
    }),
  };

  it("produces deterministic fused vectors with recorded sources", async () => {
    const recipe = {
      kind: "collapse_mixer" as const,
      dim: 64,
      inputs: {
        text: ["env_text"],
        image: ["env_img"],
        audio: ["env_audio"],
      },
      knobs: {
        w_t: 0.4,
        w_i: 0.4,
        w_a: 0.2,
        lambda: 0.5,
        drive_norm: 0.9,
        conditioning: { beta_tilt: 0.1 },
      },
    };

    const fetchEnvelope = async (id: string) => fixtures[id] ?? null;

    const first = await collapseMix({ recipe, fetchEnvelope });
    const second = await collapseMix({ recipe, fetchEnvelope });

    expect(first.fused.length).toBe(64);
    expect(Array.from(first.fused)).toEqual(Array.from(second.fused));
    expect(first.feature.sources.text).toEqual(["env_text"]);
    expect(first.feature.sources.image).toEqual(["env_img"]);
    expect(first.feature.sources.audio).toEqual(["env_audio"]);
  });



  it("adds additive provenance contract fields for collapse feature", async () => {
    const recipe = {
      kind: "collapse_mixer" as const,
      dim: 16,
      inputs: { text: ["env_text"] },
      knobs: {},
    };

    const { feature } = await collapseMix({
      recipe,
      fetchEnvelope: async (id: string) => fixtures[id] ?? null,
    });

    const contract = feature as unknown as {
      provenance_class?: string;
      claim_tier?: string;
      certifying?: boolean;
      fail_reason?: string;
    };

    expect(contract.provenance_class).toBe("inferred");
    expect(contract.claim_tier).toBe("diagnostic");
    expect(contract.certifying).toBe(false);
    expect(contract.fail_reason).toBe("COLLAPSE_PROVENANCE_NON_ADMISSIBLE");
  });

  it("returns deterministic unknown fail_reason for unknown provenance strategy paths", async () => {
    const recipe = {
      kind: "collapse_mixer" as const,
      dim: 16,
      inputs: { text: ["env_text"] },
      knobs: {},
    };

    const { feature, strategy } = await applyCollapseStrategy(
      {
        recipe,
        fetchEnvelope: async (id: string) => fixtures[id] ?? null,
      },
      "unrecognized-strategy",
    );

    const contract = feature as unknown as { fail_reason?: string };
    expect(strategy).toBe("deterministic_hash_v1");
    expect(contract.fail_reason).toBe("COLLAPSE_PROVENANCE_UNKNOWN");
  });

  it("throws when an input envelope is missing", async () => {
    const recipe = {
      kind: "collapse_mixer" as const,
      dim: 32,
      inputs: { text: ["missing"] },
      knobs: {},
    };
    await expect(
      collapseMix({
        recipe,
        fetchEnvelope: async () => null,
      }),
    ).rejects.toBeInstanceOf(MissingEssenceInputError);
  });
});
