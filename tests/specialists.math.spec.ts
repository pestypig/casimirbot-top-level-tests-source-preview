import express from "express";
import type { Server } from "http";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { specialistsRouter } from "../server/routes/agi.specialists";
import { essenceRouter } from "../server/routes/essence";
import { ensureSpecialistsRegistered } from "../server/specialists/bootstrap";
import { resetEnvelopeStore } from "../server/services/essence/store";
import { resetDbClient } from "../server/db/client";

const tempDataDir = mkdtempSync(path.join(os.tmpdir(), "specialists-test-"));
process.env.DATA_DIR = tempDataDir;
process.env.ENABLE_SPECIALISTS = "1";
process.env.ENABLE_ESSENCE = "1";
process.env.ENABLE_AUTH = "0";
process.env.SPECIALISTS_MAX_REPAIR = "1";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pg-mem://specialists-tests";

describe("specialist math sum route", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await ensureSpecialistsRegistered();
    const app = express();
    app.use(express.json());
    app.use("/api/agi/specialists", specialistsRouter);
    app.use("/api/essence", essenceRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        } else {
          baseUrl = "http://127.0.0.1:0";
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    await resetEnvelopeStore();
    await resetDbClient();
    rmSync(tempDataDir, { recursive: true, force: true });
  });

  test("successful run persists an Essence artifact", async () => {
    const response = await fetch(`${baseUrl}/api/agi/specialists/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: "Add numbers",
        personaId: "persona:demo",
        solver: "math.sum",
        verifier: "math.sum.verify",
        params: { numbers: [1, 2, 3] },
        context: { numbers: [1, 2, 3] },
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as any;
    expect(payload.ok).toBe(true);
    expect(payload.solver_output?.data?.total).toBe(6);
    const essenceId = payload.solver_output?.essence_ids?.[0];
    expect(essenceId).toBeTruthy();
    const envelopeRes = await fetch(`${baseUrl}/api/essence/${essenceId}`);
    expect(envelopeRes.status).toBe(200);
    const envelope = await envelopeRes.json();
    expect(envelope?.header?.id).toBe(essenceId);
  });

  test("verifier mismatch triggers repair loop", async () => {
    const response = await fetch(`${baseUrl}/api/agi/specialists/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: "Detect mismatch",
        personaId: "persona:demo",
        solver: "math.sum",
        verifier: "math.sum.verify",
        params: { numbers: [2, 2] },
        context: { numbers: [5, 5] },
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as any;
    expect(payload.ok).toBe(false);
    expect(payload.repaired).toBe(true);
    expect(payload.check?.ok).toBe(false);
  });
});
