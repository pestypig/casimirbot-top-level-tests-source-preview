import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildApp = async () => {
  const { planRouter } = await import("../server/routes/agi.plan");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/agi", planRouter);
  return app;
};

describe("agi ancillary routes", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ENABLE_AGI = "1";
    process.env.HELIX_ASK_SESSION_MEMORY = "1";
    delete process.env.ENABLE_LOCAL_CALL_SPEC;
    delete process.env.VITE_ENABLE_LOCAL_CALL_SPEC;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ENABLE_AGI;
    delete process.env.HELIX_ASK_SESSION_MEMORY;
    delete process.env.ENABLE_LOCAL_CALL_SPEC;
    delete process.env.VITE_ENABLE_LOCAL_CALL_SPEC;
  });

  it("serves pipeline status snapshots", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/agi/pipeline/status").expect(200);

    expect(res.body.ok).toBe(true);
    expect(typeof res.body.capturedAt).toBe("string");
    expect(res.body).toHaveProperty("warp");
  }, 15000);

  it("round-trips helix ask graph lock state", async () => {
    const app = await buildApp();
    const sessionId = `graph-lock-${Date.now()}`;

    const setRes = await request(app)
      .post("/api/agi/helix-ask/graph-lock")
      .send({ sessionId, treeIds: ["tree-alpha"], mode: "replace" })
      .expect(200);
    expect(setRes.body.locked).toBe(true);
    expect(setRes.body.treeIds).toEqual(["tree-alpha"]);

    const getRes = await request(app)
      .get("/api/agi/helix-ask/graph-lock")
      .query({ sessionId })
      .expect(200);
    expect(getRes.body.locked).toBe(true);
    expect(getRes.body.treeIds).toEqual(["tree-alpha"]);

    const clearRes = await request(app)
      .delete("/api/agi/helix-ask/graph-lock")
      .send({ sessionId })
      .expect(200);
    expect(clearRes.body.locked).toBe(false);
    expect(clearRes.body.treeIds).toEqual([]);
  });

  it("rejects local call spec when the feature flag is disabled", async () => {
    const app = await buildApp();
    const res = await request(app).post("/api/agi/local-call-spec").send({}).expect(404);

    expect(res.body.error).toBe("local_call_spec_disabled");
  });
});
