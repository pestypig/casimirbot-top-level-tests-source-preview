import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRouter } from "../server/routes/agi.plan";
import { memoryTraceRouter } from "../server/routes/agi.memory.trace";
import { resetDbClient } from "../server/db/client";
import { putMemoryRecord } from "../server/services/essence/memory-store";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pg-mem://memory-trace-tests";
process.env.ENABLE_ESSENCE = "1";
process.env.ENABLE_AGI = "1";
process.env.ENABLE_TRACE_API = "1";
process.env.ENABLE_MEMORY_UI = "1";

describe("Memory lookup by trace", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/agi/memory", memoryTraceRouter);
    app.use("/api/agi", planRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    await resetDbClient();
  });

  it("returns session memories and reflections keyed by trace id", async () => {
    const planResponse = await fetch(`${baseUrl}/api/agi/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Log metric checkpoints" }),
    });
    expect(planResponse.status).toBe(200);
    const planned = (await planResponse.json()) as { traceId: string; personaId: string };
    const traceId = planned.traceId;
    expect(traceId).toBeDefined();

    await putMemoryRecord({
      id: `mem-${traceId}`,
      owner_id: planned.personaId,
      created_at: new Date().toISOString(),
      kind: "episodic",
      keys: [`session:${traceId}`],
      text: "Session memory snapshot",
      visibility: "private",
    });
    await putMemoryRecord({
      id: `reflection-${traceId}`,
      owner_id: planned.personaId,
      created_at: new Date().toISOString(),
      kind: "procedural",
      keys: [`task:${traceId}`, "reflection"],
      text: "Task reflection summary",
      visibility: "private",
    });

    const memoryResponse = await fetch(`${baseUrl}/api/agi/memory/by-trace/${traceId}?k=5`);
    expect(memoryResponse.status).toBe(200);
    const payload = (await memoryResponse.json()) as {
      memories: Array<{ snippet: string }>;
      reflections: Array<{ snippet: string }>;
    };
    expect(payload.memories.length).toBeGreaterThan(0);
    expect(payload.reflections.length).toBeGreaterThan(0);
    expect(payload.memories[0]?.snippet).toContain("Session memory");
    expect(payload.reflections[0]?.snippet).toContain("Task reflection");
  });
});
