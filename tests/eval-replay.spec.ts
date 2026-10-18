import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { evalRouter } from "../server/routes/agi.eval";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pg-mem://eval-replay-tests";
process.env.ENABLE_ESSENCE = "1";

const mockExeca = vi.fn(async () => ({
  stdout: '{"ok":true}',
  stderr: "",
  exitCode: 0,
  timedOut: false,
}));

const capturedEnvelopes: any[] = [];

vi.mock("../server/utils/execute-command", () => ({
  runCommand: (...args: unknown[]) => mockExeca(...args),
}));

vi.mock("../server/services/essence/store", () => ({
  putEnvelope: vi.fn(async (env: unknown) => {
    capturedEnvelopes.push(env);
  }),
}));

describe("eval replay route", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/agi/eval", evalRouter);
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

  beforeEach(() => {
    capturedEnvelopes.length = 0;
    mockExeca.mockClear();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  it("404s when replay gate is disabled", async () => {
    process.env.ENABLE_EVAL_REPLAY = "0";
    const response = await fetch(`${baseUrl}/api/agi/eval/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(404);
  });

  it("returns envelope id when replay succeeds", async () => {
    process.env.ENABLE_EVAL_REPLAY = "1";
    const response = await fetch(`${baseUrl}/api/agi/eval/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traceId: "trace:test" }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { essence_id?: string; ok: boolean };
    expect(payload.ok).toBe(true);
    expect(payload.essence_id).toBeDefined();
    expect(mockExeca).toHaveBeenCalled();
    expect(capturedEnvelopes.length).toBeGreaterThan(0);
  });

  it("records essence targets in replay envelopes", async () => {
    process.env.ENABLE_EVAL_REPLAY = "1";
    const response = await fetch(`${baseUrl}/api/agi/eval/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ essenceId: "essence-test-123" }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { essenceId?: string };
    expect(payload.essenceId).toBe("essence-test-123");
    const envelope = capturedEnvelopes[0];
    expect(envelope?.header?.source?.uri).toBe("eval://replay/essence/essence-test-123");
  });
});
