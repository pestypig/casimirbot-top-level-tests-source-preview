import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const ORIGINAL_INMEM = process.env.USE_INMEM_MEMORY;

async function resetDb(): Promise<void> {
  const { resetDbClient } = await import("../server/db/client");
  await resetDbClient();
}

describe("Memory DAL persistence", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
    process.env.USE_INMEM_MEMORY = ORIGINAL_INMEM;
    vi.resetModules();
    await resetDb();
  });

  it("stores and searches memories via pg-mem backend", async () => {
    process.env.DATABASE_URL = "pg-mem://memory-dal";
    process.env.USE_INMEM_MEMORY = "0";
    vi.resetModules();
    const memoryStore = await import("../server/services/essence/memory-store");

    await memoryStore.resetMemoryStore();
    await memoryStore.putMemoryRecord({
      id: "dal-alpha",
      owner_id: "tester",
      created_at: new Date().toISOString(),
      kind: "semantic",
      text: "Alpha bubble is nominal from pg-mem backend.",
      keys: ["alpha", "bubble", "pgmem"],
      visibility: "public",
    });
    await memoryStore.putMemoryRecord({
      id: "dal-beta",
      owner_id: "tester",
      created_at: new Date().toISOString(),
      kind: "semantic",
      text: "Beta diagnostics pending.",
      keys: ["beta"],
      visibility: "public",
    });

    const hits = await memoryStore.searchMemories("Alpha bubble pg", 3);
    expect(hits[0]?.id).toBe("dal-alpha");

    const fetched = await memoryStore.getMemoryRecord("dal-alpha");
    expect(fetched?.text).toContain("pg-mem backend");

    const all = await memoryStore.listMemoryRecords();
    expect(all.map((record) => record.id)).toEqual(expect.arrayContaining(["dal-alpha", "dal-beta"]));
  });
});
