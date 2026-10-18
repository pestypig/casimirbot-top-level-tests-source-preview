import { describe, expect, it } from "vitest";
import { EssenceEnvelope, type TEssenceEnvelope } from "@shared/essence-schema";
import { buildThemeDeckFromEnvelopes } from "../server/services/essence/themes";

const BASE_HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

type EnvelopeOptions = {
  tag?: string;
  modality?: TEssenceEnvelope["header"]["modality"];
  createdAt?: string;
  uri?: string;
};

const defaultHeader = {
  version: "essence/1.0" as const,
  modality: "text" as const,
  created_at: "2025-03-01T12:00:00Z",
  source: {
    uri: "file://notes.md",
    original_hash: { algo: "sha256" as const, value: BASE_HASH },
    creator_id: "persona:test",
  },
  rights: { allow_mix: true, allow_remix: true, allow_commercial: false, attribution: true },
  acl: { visibility: "private" as const, groups: [] as string[] },
};

function makeEnvelope(id: string, text: string, options?: EnvelopeOptions): TEssenceEnvelope {
  return EssenceEnvelope.parse({
    header: {
      ...defaultHeader,
      id,
      source: {
        ...defaultHeader.source,
        uri: options?.uri ?? `file://${id}.md`,
        creator_id: defaultHeader.source.creator_id,
        original_hash: defaultHeader.source.original_hash,
      },
      modality: options?.modality ?? defaultHeader.modality,
      created_at: options?.createdAt ?? defaultHeader.created_at,
    },
    features: {
      text: {
        summary: text,
        transcript: text,
        tags: options?.tag ? [options.tag] : undefined,
      },
    },
    embeddings: [],
    provenance: {
      pipeline: [],
      merkle_root: { algo: "sha256", value: BASE_HASH },
      previous: null,
      signatures: [],
    },
  });
}

describe("essence theme panels", () => {
  it("clusters envelopes into theme panels with physics + moral descriptors", () => {
    const creative = [
      makeEnvelope("creative-1", "Idea sketch about improvisational play and freedom. I want to explore soft systems.", {
        tag: "creative-flow",
      }),
      makeEnvelope("creative-2", "Another note to explore playful experiments and keep latency joyful.", {
        tag: "creative-flow",
      }),
      makeEnvelope("creative-3", "Draft describing idea to keep the flow playful yet structured later.", {
        tag: "creative-flow",
      }),
    ];
    const systems = [
      makeEnvelope("systems-1", "Optimization plan with latency guard and deadlines. Need reliable rollout.", {
        tag: "systems-engineering",
      }),
      makeEnvelope("systems-2", "Spec to reduce cost and improve stability before release.", {
        tag: "systems-engineering",
      }),
    ];

    const deck = buildThemeDeckFromEnvelopes("persona:test", [...creative, ...systems]);

    expect(deck.ownerId).toBe("persona:test");
    expect(deck.totalEnvelopes).toBe(5);
    expect(deck.themes.length).toBeGreaterThanOrEqual(2);

    const creativeTheme = deck.themes.find((theme) => theme.label.includes("Creative"));
    expect(creativeTheme).toBeDefined();
    expect(creativeTheme?.field.forces[0]?.label).toContain("Curiosity");
    expect(creativeTheme?.stateSpace.dominant).toBe("idea");
    expect(creativeTheme?.reframes.length).toBeGreaterThan(0);
    expect(creativeTheme?.evidence[0]?.envelopeId).toBe("creative-1");

    const systemsTheme = deck.themes.find((theme) => theme.label.includes("Systems"));
    expect(systemsTheme).toBeDefined();
    expect(systemsTheme?.field.constraints[0]?.label).toContain("Latency");
    expect(systemsTheme?.dualities.length).toBeGreaterThan(0);
    expect(systemsTheme?.field.forces.some((force) => force.label.includes("Optimization"))).toBe(true);
  });
});
