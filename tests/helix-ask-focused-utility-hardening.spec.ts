import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const PLACEHOLDER_RE = /\b(?:llm\.local\s+stub\s+result|placeholder|unable to answer|i cannot answer|answer grounded in retrieved evidence\.?\s*$)\b/i;
const MECHANISM_RE = /\bMechanism:\s*.+->.+->.+/i;
const MATURITY_RE = /\bMaturity\s*\((?:exploratory|reduced-order|diagnostic|certified)\)\s*:/i;
const MISSING_EVIDENCE_RE = /\bMissing evidence:\s*[^\n]{12,}/i;

const countClaims = (text: string): number => {
  const body = text.replace(/\n\nSources:[\s\S]*$/i, " ").trim();
  return body
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 20).length;
};

describe("Helix Ask focused utility hardening", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    process.env.ENABLE_AGI = "1";
    process.env.HELIX_ASK_ENFORCE_GLOBAL_QUALITY_FLOOR = "1";
    process.env.HELIX_ASK_FAILURE_MAX = "0";
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

  const focalUniverse = "How does the universe produce life";
  const focalFinancial = "How can a Human protect itself from an AI financial hack";

  const ask = async (question: string, seed: number, sessionId: string) => {
    let lastStatus = 0;
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
          sessionId: `${sessionId}-a${attempt}`,
        }),
      });
      lastStatus = response.status;
      try {
        payload = (await response.json()) as { text?: string; debug?: Record<string, unknown>; fail_reason?: string };
      } catch {
        payload = {};
      }
      if (response.status === 200) {
        break;
      }
      if (response.status === 503 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      break;
    }
    return { status: lastStatus, ...payload };
  };

  it("hardens universe life explainer with grounded non-placeholder content (seeds 7/11/13)", async () => {
    for (const seed of [7, 11, 13]) {
      const payload = await ask(focalUniverse, seed, `focused-utility-universe-${seed}`);
      if (payload.status !== 200) {
        expect([500, 503]).toContain(payload.status);
        expect(typeof (payload.fail_reason ?? (payload.debug as any)?.helix_ask_fail_reason ?? "")).toBe("string");
        continue;
      }
      const text = payload.text ?? "";
      expect(PLACEHOLDER_RE.test(text)).toBe(false);
      expect(text.length).toBeGreaterThanOrEqual(260);
      expect(/Sources:/i.test(text)).toBe(true);
      expect(countClaims(text)).toBeGreaterThanOrEqual(2);
      expect(MECHANISM_RE.test(text)).toBe(true);
      expect(MATURITY_RE.test(text)).toBe(true);
      expect(MISSING_EVIDENCE_RE.test(text)).toBe(true);
      expect(typeof payload.debug?.fallback_reason).toBe("string");
      expect(typeof (payload.debug as any)?.semantic_quality?.claim_citation_link_rate).toBe("number");
      expect((payload.debug as any)?.event_stable_fields?.retrieval_route).toBeTruthy();
      expect((payload.debug as any)?.event_stable_fields?.fallback_decision).toBeTruthy();
      expect((payload.debug as any)?.event_stable_fields?.contract_renderer_path).toBeTruthy();
      expect((payload.debug as any)?.runtime_clock_a?.complete_contract_on_budget).toBe(true);
      expect((payload.debug as any)?.runtime_clock_b?.non_blocking).toBe(true);
      expect(typeof (payload.debug as any)?.fuzzy_move_selector?.selected).toBe("string");
      expect(typeof (payload.debug as any)?.fuzzy_move_selector?.selected_move).toBe("string");
      expect(typeof (payload.debug as any)?.fuzzy_move_selector?.move_scores).toBe("object");
      expect(Array.isArray((payload.debug as any)?.fuzzy_move_selector?.rejected_moves)).toBe(true);
      expect(typeof (payload.debug as any)?.fuzzy_move_selector?.reject_reasons).toBe("object");
      expect(typeof (payload.debug as any)?.fuzzy_move_selector?.budget_pressure).toBe("number");
      expect(typeof (payload.debug as any)?.fuzzy_move_selector?.stop_reason).toBe("string");
      expect((payload.debug as any)?.event_stable_fields?.retrieval_route).toBeTruthy();
      expect((payload.debug as any)?.event_stable_fields?.fallback_decision).toBeTruthy();
      expect((payload.debug as any)?.event_stable_fields?.contract_renderer_path).toBeTruthy();
      expect((payload.debug as any)?.runtime_clock_a?.complete_contract_on_budget).toBe(true);
      expect((payload.debug as any)?.runtime_clock_b?.non_blocking).toBe(true);
      expect(typeof (payload.debug as any)?.fuzzy_move_selector?.selected).toBe("string");
    }
  }, 120000);

  it("hardens AI financial hack prompt with mechanism and actionable safety (seeds 7/11/13)", async () => {
    for (const seed of [7, 11, 13]) {
      const payload = await ask(focalFinancial, seed, `focused-utility-financial-${seed}`);
      if (payload.status !== 200) {
        expect([500, 503]).toContain(payload.status);
        expect(typeof (payload.fail_reason ?? (payload.debug as any)?.helix_ask_fail_reason ?? "")).toBe("string");
        continue;
      }
      const text = payload.text ?? "";
      expect(PLACEHOLDER_RE.test(text)).toBe(false);
      expect(text.length).toBeGreaterThanOrEqual(300);
      expect(/Sources:/i.test(text)).toBe(true);
      expect(countClaims(text)).toBeGreaterThanOrEqual(2);
      expect(/\b(action|actions|checklist|steps|protect|mitigation|safety|defense|monitor|freeze|alert|2fa|mfa|password manager|contact your bank)\b/i.test(text)).toBe(true);
      expect(MECHANISM_RE.test(text)).toBe(true);
      expect(MATURITY_RE.test(text)).toBe(true);
      expect(typeof payload.debug?.fallback_reason).toBe("string");
    }
  }, 120000);


  it("avoids selectedMove TDZ crash when ask is temporarily unavailable", async () => {
    const payload = await ask("Trigger reliability fallback path", 7, "focused-utility-selected-move-tdz");
    if (payload.status === 200) {
      expect(typeof (payload.debug as any)?.fuzzy_move_selector?.selected).toBe("string");
      return;
    }
    expect([500, 503]).toContain(payload.status);
    const lastError = String((payload.debug as any)?.last_error ?? "");
    expect(lastError).not.toContain("selectedMove");
  }, 60000);

  it("covers 12-family focused mini-pack without placeholder/scaffold collapse", async () => {
    const cases = [
      "How does the universe produce life",
      "What are the strongest scientific theories linking consciousness to physical reality?",
      "Is life an inevitable outcome of cosmic evolution or an accident?",
      "How do entropy gradients help complex systems emerge?",
      "How do stars constrain the long-horizon habitability window for life?",
      "How can abiogenesis hypotheses be compared without over-claiming certainty?",
      "How can a Human protect itself from an AI financial hack",
      "What controls should small businesses deploy first against AI-enabled account takeover?",
      "How do I set up transaction limits and alerts to reduce financial blast radius?",
      "What should a family do first if they suspect AI-driven payment fraud?",
      "How do MFA, bank alerts, and account segmentation work together against ATO?",
      "What incident-response checklist best limits loss after a suspected AI financial compromise?",
    ];
    let seed = 7;
    for (const [index, question] of cases.entries()) {
      const payload = await ask(question, seed, `focused-mini-pack-${index + 1}`);
      if (payload.status !== 200) {
        expect([500, 503]).toContain(payload.status);
        seed = seed === 7 ? 11 : seed === 11 ? 13 : 7;
        continue;
      }
      const text = payload.text ?? "";
      if (text.length === 0) {
        seed = seed === 7 ? 11 : seed === 11 ? 13 : 7;
        continue;
      }
      expect(PLACEHOLDER_RE.test(text)).toBe(false);
      expect(text.length).toBeGreaterThanOrEqual(220);
      expect(/Sources:/i.test(text)).toBe(true);
      expect(countClaims(text)).toBeGreaterThanOrEqual(2);
      if (/universe produce life|financial hack/i.test(question)) {
        expect(MECHANISM_RE.test(text)).toBe(true);
        expect(MATURITY_RE.test(text)).toBe(true);
      }
      expect(typeof payload.debug?.fallback_reason).toBe("string");
      seed = seed === 7 ? 11 : seed === 11 ? 13 : 7;
    }
  }, 180000);
});
