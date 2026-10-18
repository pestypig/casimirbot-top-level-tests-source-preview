import { beforeEach, describe, expect, it } from "vitest";
import type { TMemoryRecord } from "../shared/essence-persona";
import { putMemoryRecord, resetMemoryStore, searchMemories } from "../server/services/essence/memory-store";

const gate = process.env.ENABLE_DEBATE_SEARCH === "1";
const describeMaybe = gate ? describe : describe.skip;

const baseRecord: Omit<TMemoryRecord, "id"> = {
  owner_id: "persona:test",
  created_at: "2025-01-01T00:00:00.000Z",
  kind: "semantic",
  keys: [],
  visibility: "public",
};

const buildRecord = (record: Partial<TMemoryRecord> & Pick<TMemoryRecord, "id">): TMemoryRecord => ({
  ...baseRecord,
  ...record,
});

describeMaybe("debate search filter", () => {
  beforeEach(async () => {
    await resetMemoryStore();
  });

  it("returns only debate-tagged memories when debateOnly is on", async () => {
    await putMemoryRecord(
      buildRecord({
        id: "mem-debate",
        text: "Referee verdict affirms the proposal alignment.",
        keys: ["debate:alpha", "trace:omega", "verdict"],
      }),
    );
    await putMemoryRecord(
      buildRecord({
        id: "mem-verdict",
        text: "Verdict memo stored without debate id.",
        keys: ["verdict"],
      }),
    );
    await putMemoryRecord(
      buildRecord({
        id: "mem-general",
        text: "Verdict log without any special tags.",
      }),
    );

    const generalHits = await searchMemories("verdict", 5);
    const filteredHits = await searchMemories("verdict", 5, { debateOnly: true });

    expect(generalHits.map((hit) => hit.id).sort()).toEqual(
      ["mem-debate", "mem-verdict", "mem-general"].sort(),
    );
    expect(filteredHits.map((hit) => hit.id).sort()).toEqual(["mem-debate", "mem-verdict"].sort());
    expect(filteredHits.length).toBeLessThan(generalHits.length);
  });
});
