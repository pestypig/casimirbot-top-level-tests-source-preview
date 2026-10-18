import { beforeEach, describe, expect, it } from "vitest";
import {
  enqueueMediaJob,
  registerMediaWorker,
  __resetQueueForTest,
  getQueueBackend,
  getQueueSnapshot,
} from "../server/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("queue stress harness", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    __resetQueueForTest({ concurrency: 2 });
  });

  it("serializes jobs when concurrency is 1", async () => {
    __resetQueueForTest({ concurrency: 1 });
    const startOrder: string[] = [];
    registerMediaWorker(async (payload) => {
      const id = (payload.input as { id: string }).id;
      startOrder.push(id);
      await wait(2);
      return id;
    });

    const ids = Array.from({ length: 6 }, (_, idx) => `job-${idx}`);
    const jobs = ids.map((id) => enqueueMediaJob({ input: { id }, ctx: {} }));
    const results = await Promise.all(jobs);

    expect(results).toEqual(ids);
    expect(startOrder).toEqual(ids);
    expect(getQueueBackend()).toBe("local");
  });

  it("caps active workers under burst load", async () => {
    const concurrency = 3;
    __resetQueueForTest({ concurrency });
    let inFlight = 0;
    let peakInflight = 0;
    registerMediaWorker(async (payload) => {
      const id = (payload.input as { id: number }).id;
      inFlight += 1;
      peakInflight = Math.max(peakInflight, inFlight);
      await wait(5 + (id % 3));
      inFlight = Math.max(0, inFlight - 1);
      return id;
    });

    const totalJobs = 24;
    const jobs = Array.from({ length: totalJobs }, (_, idx) => enqueueMediaJob({ input: { id: idx }, ctx: {} }));
    const results = await Promise.all(jobs);

    expect(results).toHaveLength(totalJobs);
    expect(new Set(results).size).toBe(totalJobs);
    expect(peakInflight).toBeLessThanOrEqual(concurrency);
    expect(getQueueSnapshot().provenance).toMatchObject({
      backendMode: "local",
      queuePolicyClass: "in-memory.fifo",
      maturity: "diagnostic",
      certifying: false,
      localFallback: {
        active: true,
        reason: "redis_unconfigured_or_unavailable",
      },
    });
  });
});
