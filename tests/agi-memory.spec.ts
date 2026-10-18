import { beforeEach, describe, expect, it } from "vitest";
import type { TMemoryRecord } from "../shared/essence-persona";
import { putMemoryRecord, resetMemoryStore, searchMemories } from "../server/services/essence/memory-store";

const baseRecord = {
  owner_id: "alice",
  created_at: "2025-11-09T00:00:00Z",
  kind: "semantic" as const,
  keys: [] as string[],
  visibility: "public" as const,
};

const makeRecord = (record: Partial<TMemoryRecord> & Pick<TMemoryRecord, "id">): TMemoryRecord => ({
  ...baseRecord,
  ...record,
});

describe("Essence memory store", () => {
beforeEach(async () => {
  await resetMemoryStore();
});

  it("returns snippets and envelope ids for the highest scoring memories", async () => {
    await putMemoryRecord(
      makeRecord({
        id: "m-alpha",
        text: "Alpha warp bubble is holding steady across the bridge segment.",
        essence_id: "env-alpha",
      }),
    );
    await putMemoryRecord(
      makeRecord({
        id: "m-beta",
        text: "Beta diagnostics remain inconclusive after the bakeout window.",
      }),
    );

    const hits = await searchMemories("Alpha bubble status", 3);
    expect(hits[0]?.id).toBe("m-alpha");
    expect(hits[0]?.snippet).toContain("Alpha warp bubble");
    expect(hits[0]?.envelope_id).toBe("env-alpha");
    expect(hits[0]?.embedding_space).toBe("hash/v1");
    expect(hits[0]?.embedding_cid).toMatch(/^mem:/);
  });

  it("uses keyword matches from keys when text is missing", async () => {
    await putMemoryRecord(
      makeRecord({
        id: "m-keys",
        keys: ["drive cadence delta shift"],
      }),
    );
    await putMemoryRecord(
      makeRecord({
        id: "m-noise",
        text: "Noise floor calibration sequence",
      }),
    );

    const hits = await searchMemories("delta shift", 2);
    expect(hits[0]?.id).toBe("m-keys");
    expect(hits[0]?.snippet).toBe("");
  });

  it("honors top-k and ignores empty queries", async () => {
    await putMemoryRecord(makeRecord({ id: "m1", text: "Alpha node status nominal" }));
    await putMemoryRecord(makeRecord({ id: "m2", text: "Gamma node needs fuel" }));
    const hits = await searchMemories("node", 1);
    expect(hits).toHaveLength(1);
    expect(await searchMemories("   ", 5)).toEqual([]);
  });
});
