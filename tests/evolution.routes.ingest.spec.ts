import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { evolutionRouter } from "../server/routes/evolution";
import { getPatchesPath } from "../server/services/evolution/patch-store";

describe("evolution ingest route", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/evolution", evolutionRouter);
  const originalTenantRequired = process.env.AGI_TENANT_REQUIRED;

  beforeEach(() => {
    const p = getPatchesPath();
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    process.env.AGI_TENANT_REQUIRED = "0";
  });

  afterEach(() => {
    if (originalTenantRequired === undefined) {
      delete process.env.AGI_TENANT_REQUIRED;
    } else {
      process.env.AGI_TENANT_REQUIRED = originalTenantRequired;
    }
  });

  it("returns deterministic patch id", async () => {
    const payload = { title: "A", touchedPaths: ["b", "a"], intentTags: ["x"] };
    const a = await request(app).post("/api/evolution/patches/ingest").send(payload);
    const b = await request(app).post("/api/evolution/patches/ingest").send(payload);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.patchId).toBe(b.body.patchId);
  });

  it("returns deterministic error envelope", async () => {
    const res = await request(app).post("/api/evolution/patches/ingest").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("EVOLUTION_INVALID_REQUEST");
  });

  it("returns payload-too-large envelope for oversized writes", async () => {
    const bigTitle = "x".repeat(70_000);
    const res = await request(app).post("/api/evolution/patches/ingest").send({ title: bigTitle });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("EVOLUTION_PAYLOAD_TOO_LARGE");
  });
});
