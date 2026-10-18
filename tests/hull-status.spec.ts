import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { hullStatusRouter } from "../server/routes/hull.status";
import {
  __resetToolLogStore,
  appendToolLog,
} from "../server/services/observability/tool-log-store";
import {
  __resetQueueForTest,
  enqueueMediaJob,
  registerMediaWorker,
} from "../server/queue";

describe("hull status route", () => {
  let app: express.Express;
  let releaseJob: (() => void) | null = null;

  beforeEach(() => {
    __resetToolLogStore();
    __resetQueueForTest({ concurrency: 1, dropHandlers: false });
    registerMediaWorker(
      () =>
        new Promise<void>((resolve) => {
          releaseJob = resolve;
        }),
    );
    app = express();
    app.use("/api/hull/status", hullStatusRouter);
  });

  afterEach(async () => {
    if (releaseJob) {
      releaseJob();
      releaseJob = null;
    }
    __resetToolLogStore();
    __resetQueueForTest({ concurrency: 1, dropHandlers: false });
  });

  it("reports queue depth and approval backlog", async () => {
    appendToolLog({
      tool: "demo.tool",
      version: "1.0.0",
      paramsHash: "hash",
      durationMs: 4,
      ok: false,
      policy: { approvalMissing: true },
    });

    const jobPromise = enqueueMediaJob({ input: { prompt: "test" }, ctx: {} });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const response = await request(app).get("/api/hull/status").expect(200);
    expect(typeof response.body.queue_depth).toBe("number");
    expect(response.body.queue_depth).toBeGreaterThan(0);
    expect(response.body.approvals_outstanding).toBeGreaterThanOrEqual(1);
    expect(response.body.llm_http_breaker).toMatchObject({
      open: false,
      threshold: expect.any(Number),
      cooldown_ms: expect.any(Number),
    });
    expect(typeof response.body.llm_http_breaker.consecutive_failures).toBe("number");
    expect(typeof response.body.llm_http_breaker.remaining_ms).toBe("number");

    if (releaseJob) {
      releaseJob();
      releaseJob = null;
    }
    await jobPromise;
  });
});
