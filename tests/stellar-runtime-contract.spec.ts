import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stellarRouter } from "../server/routes/stellar";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/stellar", stellarRouter);
  return app;
};

let tempDir = "";
let catalogPath = "";
const previousCatalog = process.env.LSR_CATALOG_PATH;

describe("stellar restoration runtime provenance contract", () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stellar-runtime-contract-"));
    catalogPath = path.join(tempDir, "nearby-stars.csv");
    fs.writeFileSync(
      catalogPath,
      [
        "id,ra_deg,dec_deg,plx_mas,pmra_masyr,pmdec_masyr,rv_kms,hr,source",
        "demo-star,15,20,200,5,-3,20,G,test-catalog",
      ].join("\n"),
      "utf8",
    );
    process.env.LSR_CATALOG_PATH = catalogPath;
    process.env.LSR_CACHE_TTL_MS = "0";
  });

  afterAll(() => {
    if (previousCatalog === undefined) {
      delete process.env.LSR_CATALOG_PATH;
    } else {
      process.env.LSR_CATALOG_PATH = previousCatalog;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("adds default provenance fields to stellar restoration and evolution responses", async () => {
    const app = buildApp();

    const rest = await request(app).get("/api/stellar/local-rest").query({ radius_pc: 50, per_page: 100 });
    expect(rest.status).toBe(200);
    expect(rest.body.provenance_class).toBe("inferred");
    expect(rest.body.claim_tier).toBe("diagnostic");
    expect(rest.body.certifying).toBe(false);

    const proofs = await request(app)
      .get("/api/stellar/evolution/proofs")
      .query({ T_K: 10, nH_cm3: 100, mass_Msun: 1, metallicity_Z: 0.0142, Y_He: 0.28 });
    expect(proofs.status).toBe(200);
    expect(proofs.body.provenance_class).toBe("inferred");
    expect(proofs.body.claim_tier).toBe("diagnostic");
    expect(proofs.body.certifying).toBe(false);
  });

  it("tags strict missing provenance with deterministic fail_reason while keeping response compatible", async () => {
    const app = buildApp();

    const res = await request(app)
      .get("/api/stellar/local-rest")
      .query({ radius_pc: 50, per_page: 100, strict_provenance: true });

    expect(res.status).toBe(200);
    expect(res.body.gate?.status).toBe("fail");
    expect(res.body.gate?.fail_reason).toBe("STELLAR_RESTORATION_PROVENANCE_MISSING");
    expect(Array.isArray(res.body.stars)).toBe(true);
    expect(res.body.meta).toBeTruthy();
  });

  it("uses caller-provided provenance when present", async () => {
    const app = buildApp();

    const res = await request(app).get("/api/stellar/local-rest").query({
      radius_pc: 50,
      per_page: 100,
      strict_provenance: true,
      provenance_class: "measured",
      claim_tier: "reduced-order",
      certifying: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.provenance_class).toBe("measured");
    expect(res.body.claim_tier).toBe("reduced-order");
    expect(res.body.certifying).toBe(false);
    expect(res.body.gate?.status).toBe("pass");
  });
});
