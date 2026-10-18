import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EssenceEnvelope } from "../shared/essence-schema";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;

async function resetDb(): Promise<void> {
  const { resetDbClient } = await import("../server/db/client");
  await resetDbClient();
}

const ZERO_HASH = "00".repeat(32);

const buildEnvelope = (id: string, creatorId: string, uri: string, createdAt: string) =>
  EssenceEnvelope.parse({
    header: {
      id,
      version: "essence/1.0",
      modality: "audio",
      created_at: createdAt,
      source: {
        uri,
        original_hash: { algo: "blake3", value: ZERO_HASH },
        creator_id: creatorId,
      },
      rights: { allow_mix: true, allow_remix: true, allow_commercial: false, attribution: true },
      acl: { visibility: "public", groups: [] },
    },
    features: {},
    embeddings: [],
    provenance: {
      pipeline: [],
      merkle_root: { algo: "blake3", value: ZERO_HASH },
      previous: null,
      signatures: [],
    },
  });

describe("Essence DAL persistence", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
    vi.resetModules();
    await resetDb();
  });

  it("persists envelopes and packets via pg-mem backend", async () => {
    process.env.DATABASE_URL = "pg-mem://essence-dal";
    vi.resetModules();
    const essenceStore = await import("../server/services/essence/store");
    const { listPacketsForEnvelope, persistEssencePacket } = await import("../server/db/essence");

    await essenceStore.resetEnvelopeStore();
    const alpha = buildEnvelope("env-alpha", "creator-one", "file://alpha.wav", "2024-01-01T00:00:00.000Z");
    const beta = buildEnvelope("env-beta", "creator-two", "file://beta.wav", "2024-01-02T00:00:00.000Z");

    await essenceStore.putEnvelope(alpha);
    await essenceStore.putEnvelope(beta);

    const fetched = await essenceStore.getEnvelope(alpha.header.id);
    expect(fetched?.header.source.uri).toBe("file://alpha.wav");

    await persistEssencePacket({
      id: "pkt-alpha",
      envelope_id: alpha.header.id,
      uri: "s3://test/alpha",
      cid: "cid-alpha",
      content_type: "audio/wav",
      bytes: 2048,
    });

    const packets = await listPacketsForEnvelope(alpha.header.id);
    expect(packets).toHaveLength(1);
    expect(packets[0]?.cid).toBe("cid-alpha");

    const creatorList = await essenceStore.listEnvelopeByCreator("creator-one", 5);
    expect(creatorList.map((env) => env.header.id)).toEqual(["env-alpha"]);

    const search = await essenceStore.searchEnvelopes("beta", 5);
    expect(search[0]?.header.id).toBe("env-beta");
  });
});
