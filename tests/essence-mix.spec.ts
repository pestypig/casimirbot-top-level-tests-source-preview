import { createHash } from "node:crypto";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { EssenceEnvelope } from "@shared/essence-schema";
import { resetEnvelopeStore, putEnvelope, getEnvelope } from "../server/services/essence/store";
import { createEssenceMix } from "../server/services/essence/mix";
import { upsertProposal } from "../server/db/proposals";
import { resetDbClient } from "../server/db/client";

const NOW = new Date().toISOString();

const makeEnvelope = (id: string, creatorId: string, modality: "text" | "image", summary: string) => {
  const buffer = Buffer.from(summary, "utf8");
  const hash = createHash("sha256").update(buffer).digest("hex");
  return EssenceEnvelope.parse({
    header: {
      id,
      version: "essence/1.0",
      modality,
      created_at: NOW,
      source: {
        uri: `memory://${id}`,
        original_hash: { algo: "sha256", value: hash },
        creator_id: creatorId,
        license: "CC-BY-4.0",
      },
      rights: { allow_mix: true, allow_remix: true, allow_commercial: false, attribution: true },
      acl: { visibility: "private", groups: [] },
    },
    features:
      modality === "text"
        ? { text: { transcript: summary, summary } }
        : {
            image: { width: 64, height: 64, pHash: hash.slice(0, 32) },
          },
    embeddings: [],
    provenance: {
      pipeline: [],
      merkle_root: { algo: "sha256", value: hash },
      previous: null,
      signatures: [],
    },
  });
};

describe("createEssenceMix", () => {
  beforeEach(async () => {
    await resetEnvelopeStore();
  });

  afterAll(async () => {
    await resetDbClient();
  });

  it("mixes project assets by creator", async () => {
    await putEnvelope(makeEnvelope("alpha-text", "project:alpha", "text", "Warp shield brief"));
    await putEnvelope(makeEnvelope("alpha-image", "project:alpha", "image", "Shield render"));

    const result = await createEssenceMix({ mode: "project-assets", creatorId: "project:alpha" });

    expect(result.mixId).toMatch(/[a-f0-9-]{36}/i);
    expect(result.space).toBeDefined();
    const stored = await getEnvelope(result.mixId);
    expect(stored?.features?.mixer).toBeDefined();
    expect(stored?.features?.text?.summary).toMatch(/identity mix/i);
  });

  it("mixes approved proposals into identity", async () => {
    await upsertProposal({
      id: "proposal-1",
      kind: "panel",
      status: "approved",
      source: { kind: "manual", jobId: null, persona: null },
      title: "Apply nebula palette",
      summary: "Adopt magenta and teal gradients",
      explanation: "Gradients align with mission branding.",
      target: { type: "panel", panelId: "nebula" },
      patchKind: "ui-config",
      patch: "{}",
      rewardTokens: 0,
      ownerId: "artist",
      safetyStatus: "passed",
      safetyScore: 0.9,
      safetyReport: null,
      jobId: null,
      evalRunId: null,
      metadata: {},
      createdAt: NOW,
      updatedAt: NOW,
      createdForDay: "2025-01-01",
    });
    await upsertProposal({
      id: "proposal-2",
      kind: "theme",
      status: "applied",
      source: { kind: "manual", jobId: null, persona: null },
      title: "Add helix glass",
      summary: "Translucent helix overlays for desktop",
      explanation: "Provides continuity across panels.",
      target: { type: "panel", panelId: "desktop" },
      patchKind: "ui-config",
      patch: "{}",
      rewardTokens: 0,
      ownerId: "designer",
      safetyStatus: "passed",
      safetyScore: 0.8,
      safetyReport: null,
      jobId: null,
      evalRunId: null,
      metadata: {},
      createdAt: NOW,
      updatedAt: NOW,
      createdForDay: "2025-01-01",
    });

    const mix = await createEssenceMix({ mode: "proposal-identity", label: "Identity mix" });
    expect(mix.summary).toMatch(/identity mix/i);
    const stored = await getEnvelope(mix.mixId);
    expect(stored?.features?.mixer?.sources?.text?.length).toBeGreaterThan(0);
  });
});
