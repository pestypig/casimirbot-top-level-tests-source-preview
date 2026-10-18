import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { hullCapsules } from "../server/routes/hull.capsules";

describe("hull capsules route", () => {
  let app: express.Express;
  let tmpDir: string;
  let privateKey: crypto.KeyObject;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "hull-capsule-"));
    const dataDir = path.join(tmpDir, "data");
    mkdirSync(dataDir, { recursive: true });
    process.env.DATA_DIR = dataDir;
    process.env.ENABLE_CAPSULE_IMPORT = "1";
    process.env.HULL_MODE = "1";
    const { publicKey, privateKey: priv } = crypto.generateKeyPairSync("ed25519");
    privateKey = priv;
    const pubPath = path.join(tmpDir, "hull-ca.pub");
    writeFileSync(pubPath, publicKey.export({ type: "spki", format: "pem" }));
    process.env.HULL_CA_PUBKEY_PATH = pubPath;
    app = express();
    app.use("/api/hull/capsules", hullCapsules);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.ENABLE_CAPSULE_IMPORT;
    delete process.env.HULL_CA_PUBKEY_PATH;
    delete process.env.HULL_MODE;
  });

  it("accepts capsule with valid signature", async () => {
    const manifest = JSON.stringify({ files: [{ path: "model.bin", sha256: "abc" }] });
    const signature = crypto.sign(null, Buffer.from(manifest, "utf8"), privateKey);
    const response = await request(app)
      .post("/api/hull/capsules/import")
      .field("manifest", manifest)
      .field("signature", signature.toString("base64"))
      .attach("capsule", Buffer.from("capsule"), "capsule.bin")
      .expect(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.capsule_uri).toMatch(/^storage:\/\//);
  });

  it("rejects capsule with invalid signature", async () => {
    const manifest = JSON.stringify({ files: [] });
    await request(app)
      .post("/api/hull/capsules/import")
      .field("manifest", manifest)
      .field("signature", Buffer.from("bad").toString("base64"))
      .attach("capsule", Buffer.from("capsule"), "capsule.bin")
      .expect(400);
  });
});
