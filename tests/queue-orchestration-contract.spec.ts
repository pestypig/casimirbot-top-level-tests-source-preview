import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { jobsRouter } from "../server/routes/jobs";
import { __resetQueueForTest, enqueueMediaJob, getQueueSnapshot, registerMediaWorker } from "../server/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("queue orchestration runtime contract", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    __resetQueueForTest({ concurrency: 1 });
  });

  it("returns deterministic queue provenance metadata with local fallback surfaced", async () => {
    let releaseFirst: (() => void) | null = null;
    let firstJob = true;
    registerMediaWorker(
      () => {
        if (!firstJob) {
          return Promise.resolve();
        }
        firstJob = false;
        return new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      },
    );

    const first = enqueueMediaJob({
      input: { id: "first" },
      ctx: { runId: "run-b", contextId: "ctx-z" },
    });
    await wait(5);

    const second = enqueueMediaJob({
      input: { id: "second" },
      ctx: { run_id: "run-a", context_id: "ctx-a" },
    });
    await wait(5);

    const snapshot = getQueueSnapshot();
    expect(snapshot.backend).toBe("local");
    expect(snapshot.provenance).toEqual({
      backendMode: "local",
      queuePolicyClass: "in-memory.fifo",
      maturity: "diagnostic",
      certifying: false,
      localFallback: {
        active: true,
        reason: "redis_unconfigured_or_unavailable",
      },
      context: {
        runIds: ["run-a", "run-b"],
        contextIds: ["ctx-a", "ctx-z"],
      },
    });

    if (releaseFirst) {
      releaseFirst();
      releaseFirst = null;
    }
    await Promise.all([first, second]);
  });

  it("exposes queue contract on jobs route", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/jobs", jobsRouter);

    const response = await request(app).get("/api/jobs/queue").expect(200);
    expect(response.body.backend).toBe("local");
    expect(response.body.provenance).toMatchObject({
      backendMode: "local",
      queuePolicyClass: "in-memory.fifo",
      maturity: "diagnostic",
      certifying: false,
      localFallback: {
        active: true,
        reason: "redis_unconfigured_or_unavailable",
      },
      context: {
        runIds: [],
        contextIds: [],
      },
    });
  });
});
