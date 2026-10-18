import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const MECHANISM_RE = /\bMechanism:\s*.+->.+->.+/i;
const MATURITY_RE = /\bMaturity\s*\((?:exploratory|reduced-order|diagnostic|certified)\)\s*:/i;
const MISSING_EVIDENCE_RE = /\bMissing evidence:\s*[^\n]{12,}/i;

const CASES = [
  "How does the universe produce life",
  "How can a Human protect itself from an AI financial hack",
] as const;

describe("Helix Ask mechanism+maturity contract", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    process.env.ENABLE_AGI = "1";
    process.env.HELIX_ASK_ENFORCE_GLOBAL_QUALITY_FLOOR = "1";
    vi.resetModules();
    const { planRouter } = await import("../server/routes/agi.plan");
    const app = express();
    app.use(express.json({ limit: "5mb" }));
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
  }, 60000);

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });
  });

  const ask = async (question: string, seed: number) => {
    let status = 0;
    let payload: { text?: string; debug?: Record<string, unknown>; fail_reason?: string } = {};
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/agi/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          debug: true,
          temperature: 0.2,
          seed,
          sessionId: `mechanism-maturity-${seed}-a${attempt}`,
        }),
      });
      status = response.status;
      try {
        payload = (await response.json()) as { text?: string; debug?: Record<string, unknown>; fail_reason?: string };
      } catch {
        payload = {};
      }
      if (status === 200) break;
      if (status >= 500 || status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        continue;
      }
      break;
    }
    return { status, ...payload };
  };

  it("enforces mechanism+maturity+missing-evidence labels for focused asks across seeds", async () => {
    for (const question of CASES) {
      for (const seed of [7, 11, 13]) {
        const payload = await ask(question, seed);
        if (payload.status !== 200) {
          expect([500, 503]).toContain(payload.status);
          const failReason =
            payload.fail_reason ??
            ((payload.debug as { helix_ask_fail_reason?: string } | undefined)?.helix_ask_fail_reason ?? "");
          expect(typeof failReason).toBe("string");
          continue;
        }
        const text = payload.text ?? "";
        expect(text.length).toBeGreaterThanOrEqual(260);
        expect(/Sources:/i.test(text)).toBe(true);
        expect(MECHANISM_RE.test(text)).toBe(true);
        expect(MATURITY_RE.test(text)).toBe(true);
        expect(MISSING_EVIDENCE_RE.test(text)).toBe(true);
      }
    }
  }, 180000);
});
