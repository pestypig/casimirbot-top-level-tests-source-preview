import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRouter } from "../server/routes/agi.plan";
import { traceRouter } from "../server/routes/agi.trace";
import { resetDbClient } from "../server/db/client";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pg-mem://trace-acl-tests";
process.env.ENABLE_ESSENCE = "1";
process.env.ENABLE_AGI = "1";
process.env.ENABLE_TRACE_API = "1";
process.env.ENABLE_AUTH = "1";
process.env.ALLOW_ADMIN = "0";

describe("Trace ACL enforcement", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const actor = req.get("x-test-auth") ?? "owner";
      if (actor === "owner") {
        (req as any).auth = { sub: "owner", personaAcl: [{ id: "default", scopes: ["plan"] }] };
      } else {
        (req as any).auth = { sub: "guest", personaAcl: [{ id: "guest", scopes: ["plan"] }] };
      }
      next();
    });
    app.use("/api/agi/trace", traceRouter);
    app.use("/api/agi", planRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
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
    await resetDbClient();
  });

  it("allows owners/admins to fetch traces and blocks other personas", async () => {
    const planResponse = await fetch(`${baseUrl}/api/agi/plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-auth": "owner",
      },
      body: JSON.stringify({ goal: "Calibrate nav sensors" }),
    });
    expect(planResponse.status).toBe(200);
    const planned = (await planResponse.json()) as { traceId: string };

    const ownerResponse = await fetch(`${baseUrl}/api/agi/trace/${planned.traceId}`, {
      headers: { "x-test-auth": "owner" },
    });
    expect(ownerResponse.status).toBe(200);

    const otherResponse = await fetch(`${baseUrl}/api/agi/trace/${planned.traceId}`, {
      headers: { "x-test-auth": "guest" },
    });
    expect(otherResponse.status).toBe(403);
  });
});
