import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRouter } from "../server/routes/agi.plan";
import { appendToolLog, __resetToolLogStore } from "../server/services/observability/tool-log-store";

process.env.ENABLE_AGI = "1";
process.env.ENABLE_TRACE_API = "1";

describe("Tool log SSE replay", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
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
    __resetToolLogStore();
  });

  it("replays entries newer than Last-Event-ID", async () => {
    __resetToolLogStore();
    const first = appendToolLog({
      tool: "llm.local.generate",
      version: "v1",
      paramsHash: "a",
      durationMs: 10,
      ok: true,
    });
    const second = appendToolLog({
      tool: "llm.local.generate",
      version: "v1",
      paramsHash: "b",
      durationMs: 11,
      ok: true,
    });
    appendToolLog({
      tool: "llm.local.generate",
      version: "v1",
      paramsHash: "c",
      durationMs: 9,
      ok: true,
    });
    appendToolLog({
      tool: "llm.local.generate",
      version: "v1",
      paramsHash: "d",
      durationMs: 8,
      ok: true,
    });

    expect(first.id).not.toBe(second.id);

    const controller = new AbortController();
    const response = await fetch(
      `${baseUrl}/api/agi/tools/logs/stream?limit=5`,
      {
        headers: { "Last-Event-ID": second.id },
        signal: controller.signal,
      },
    );

    const received: number[] = [];
    const decoder = new TextDecoder();
    const reader = response.body as unknown as AsyncIterable<Uint8Array>;
    try {
      for await (const chunk of reader) {
        const text = decoder.decode(chunk);
        const events = text.split("\n\n").filter(Boolean);
        for (const event of events) {
          const dataLine = event
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice(5));
          received.push(payload.seq);
          if (received.length === 2) {
            controller.abort();
            break;
          }
        }
        if (received.length === 2) {
          break;
        }
      }
    } catch (error) {
      const name = (error as any)?.name;
      if (name !== "AbortError") {
        throw error;
      }
    }

    expect(received.length).toBe(2);
    expect(received[0]).toBeGreaterThan(Number(second.id));
    expect(received[1]).toBeGreaterThan(received[0]);
  });
});
