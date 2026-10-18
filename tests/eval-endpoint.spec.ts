import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evalRouter } from "../server/routes/agi.eval";
import { registerMetricsEndpoint } from "../server/metrics";

process.env.ENABLE_AGI = "1";
process.env.ENABLE_ESSENCE = "1";
process.env.ENABLE_TRACE_API = "1";

describe("Eval API", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/agi/eval", evalRouter);
    registerMetricsEndpoint(app);
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
  });

  it("returns JSON summary and updates metrics counters", async () => {
    const response = await fetch(`${baseUrl}/api/agi/eval/smoke`, { method: "POST" });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { skipped: boolean; outcome?: string };
    expect(payload.skipped).toBe(true);
    expect(payload.outcome).toBe("skipped");

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    expect(metricsResponse.status).toBe(200);
    const text = await metricsResponse.text();
    expect(text).toContain('agi_eval_runs_total{result="skipped"} 1');
  });
});
