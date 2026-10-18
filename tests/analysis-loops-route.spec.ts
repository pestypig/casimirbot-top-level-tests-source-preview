import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { analysisLoopRouter } from "../server/routes/analysis-loops";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/analysis", analysisLoopRouter);
  return app;
};

describe("analysis loops route provenance fields", () => {
  it("adds default provenance contract fields and preserves response shape", async () => {
    const app = buildApp();

    const res = await request(app).post("/api/analysis/loops/noise-field").send({
      width: 8,
      height: 8,
      maxIterations: 2,
    });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("constraint-loop");
    expect(res.body.domain).toBe("noise-field");
    expect(res.body.provenance_class).toBe("inferred");
    expect(res.body.claim_tier).toBe("diagnostic");
    expect(res.body.certifying).toBe(false);
    expect(res.body).toHaveProperty("gate");
    expect(res.body).toHaveProperty("constraints");
  });

  it("tags strict provenance failures with deterministic fail_reason id", async () => {
    const app = buildApp();

    const res = await request(app).post("/api/analysis/loops/diffusion").send({
      width: 4,
      height: 4,
      channels: 1,
      strictProvenance: true,
      maxIterations: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.gate?.status).toBe("fail");
    expect(res.body.gate?.fail_reason).toBe("ANALYSIS_LOOP_PROVENANCE_MISSING");
  });

  it("uses caller-provided provenance contract fields", async () => {
    const app = buildApp();

    const res = await request(app).post("/api/analysis/loops/belief-graph").send({
      graph: {
        nodes: [{ id: "a", score: 0.4 }],
        edges: [],
      },
      provenance: {
        provenance_class: "measured",
        claim_tier: "reduced-order",
        certifying: false,
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.provenance_class).toBe("measured");
    expect(res.body.claim_tier).toBe("reduced-order");
    expect(res.body.certifying).toBe(false);
  });
});
