import { describe, expect, it } from "vitest";

describe("helix ask job store runtime counters", () => {
  it("tracks queued/running jobs as active", async () => {
    process.env.USE_INMEM_HELIX_ASK_JOB_STORE = "1";
    const store = await import("../server/services/helix-ask/job-store");
    const j1 = await store.createHelixAskJob({ question: "q1" });
    const j2 = await store.createHelixAskJob({ question: "q2" });
    expect(await store.getHelixAskActiveJobCount()).toBeGreaterThanOrEqual(2);
    await store.markHelixAskJobRunning(j1.id);
    expect(await store.getHelixAskActiveJobCount()).toBeGreaterThanOrEqual(2);
    await store.completeHelixAskJob(j2.id, { ok: true });
    expect(await store.getHelixAskActiveJobCount()).toBeGreaterThanOrEqual(1);
  });
});
