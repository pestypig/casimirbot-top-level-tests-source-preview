import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evolutionRouter } from "../server/routes/evolution";

describe("evolution route tenant policy", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/evolution", evolutionRouter);

  const originalTenantRequired = process.env.AGI_TENANT_REQUIRED;

  beforeEach(() => {
    process.env.AGI_TENANT_REQUIRED = "1";
  });

  afterEach(() => {
    if (originalTenantRequired === undefined) {
      delete process.env.AGI_TENANT_REQUIRED;
    } else {
      process.env.AGI_TENANT_REQUIRED = originalTenantRequired;
    }
  });

  it("requires tenant id for evolution writes when tenant mode is enabled", async () => {
    const res = await request(app)
      .post("/api/evolution/gate/run")
      .send({ indicators: { I: 1, A: 1, P: 1, E: 1, debt: 0 } });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("tenant-required");
  });

  it("accepts tenant id for evolution writes when tenant mode is enabled", async () => {
    const res = await request(app)
      .post("/api/evolution/gate/run")
      .set("X-Tenant-Id", "tenant-a")
      .send({ indicators: { I: 1, A: 1, P: 1, E: 1, debt: 0.2 } });
    expect(res.status).toBe(200);
    expect(res.body.verdict).toBeTruthy();
  });
});
