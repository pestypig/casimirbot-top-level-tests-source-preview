import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Casimir verify for PS2 patch", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    process.env.ENABLE_AGI = "1";
    vi.resetModules();
    const { planRouter } = await import("../server/routes/agi.plan");
    const { adapterRouter } = await import("../server/routes/agi.adapter");
    const { trainingTraceRouter } = await import("../server/routes/training-trace");
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use("/api/agi", planRouter);
    app.use("/api/agi/adapter", adapterRouter);
    app.use("/api/agi", trainingTraceRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  }, 60000);

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });
  });

  it("runs adapter verification and training trace export", async () => {
    const verifyRes = await fetch(`${baseUrl}/api/agi/adapter/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: "ps2-casimir-verify",
        mode: "constraint-pack",
        pack: {
          id: "repo-convergence",
          telemetry: {
            build: { status: "pass", durationMs: 420000 },
            tests: { failed: 0, total: 24 },
            schema: { contracts: true },
            deps: { coherence: true },
          },
        },
      }),
    });
    const verifyRaw = await verifyRes.text();
    let verify: Record<string, unknown> = {};
    try { verify = JSON.parse(verifyRaw) as Record<string, unknown>; } catch { verify = { raw: verifyRaw }; }

    const traceRes = await fetch(`${baseUrl}/api/agi/training-trace/export`);
    const traceText = await traceRes.text();

    const out = {
      verifyStatus: verifyRes.status,
      verify,
      traceStatus: traceRes.status,
      traceBytes: Buffer.byteLength(traceText, "utf8"),
    };
    const outDir = path.join("artifacts", "experiments", "helix-ask-ps2");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "casimir-verify-latest.json"), JSON.stringify(out, null, 2));

    expect(verifyRes.status).toBe(200);
    expect((verify as { verdict?: string }).verdict).toBe("PASS");
    expect(((verify as { certificate?: { integrityOk?: boolean } }).certificate?.integrityOk) ?? false).toBe(true);
    expect(typeof ((verify as { certificate?: { certificateHash?: string | null } }).certificate?.certificateHash ?? "")).toBe("string");
    expect(traceRes.status).toBe(200);
  }, 120000);
});
