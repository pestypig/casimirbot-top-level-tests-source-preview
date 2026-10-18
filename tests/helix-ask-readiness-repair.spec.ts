import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const threadTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-ask-readiness-repair-"));
const threadLedgerPath = path.join(threadTempDir, "helix-thread-ledger.jsonl");
const threadIndexPath = path.join(threadTempDir, "helix-thread-index.json");

describe("Helix Ask readiness repair regressions", () => {
  let server: Server;
  let baseUrl = "http://127.0.0.1:0";

  beforeAll(async () => {
    process.env.ENABLE_AGI = "1";
    process.env.HELIX_ASK_MICRO_PASS = "0";
    process.env.HELIX_ASK_MICRO_PASS_AUTO = "0";
    process.env.HELIX_ASK_TWO_PASS = "0";
    process.env.HELIX_THREAD_LEDGER_PATH = threadLedgerPath;
    process.env.HELIX_THREAD_INDEX_PATH = threadIndexPath;
    process.env.HELIX_THREAD_PERSIST = "1";
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
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
    const { __resetHelixThreadLedgerStore } = await import(
      "../server/services/helix-thread/ledger"
    );
    const { __resetHelixThreadRegistryStore } = await import(
      "../server/services/helix-thread/registry"
    );
    __resetHelixThreadLedgerStore();
    __resetHelixThreadRegistryStore();
    fs.rmSync(threadTempDir, { recursive: true, force: true });
    delete process.env.HELIX_THREAD_LEDGER_PATH;
    delete process.env.HELIX_THREAD_INDEX_PATH;
    delete process.env.HELIX_THREAD_PERSIST;
  });

  it("keeps repo pipeline prompts above the stage05 slot-coverage floor", async () => {
    const response = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "How does the Helix Ask pipeline work in this repo?",
        debug: true,
        verbosity: "extended",
        sessionId: "test-pipeline-stage05-coverage",
        max_tokens: 256,
        temperature: 0.2,
      }),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      text: string;
      debug?: {
        intent_id?: string;
        stage05_used?: boolean;
        stage05_card_count?: number;
        stage05_slot_coverage?: { ratio?: number; required?: string[]; missing?: string[] };
      };
    };

    expect(payload.debug?.intent_id).toBe("repo.helix_ask_pipeline_explain");
    expect(payload.debug?.stage05_used).toBe(true);
    expect(payload.debug?.stage05_card_count ?? 0).toBeGreaterThan(0);
    expect(payload.debug?.stage05_slot_coverage?.ratio ?? 0).toBeGreaterThanOrEqual(0.6);
    expect(payload.text).toMatch(/\bRoute intent \+ topic\b/i);
    expect(payload.text).not.toMatch(/\bRuntime fallback:/i);
  }, 90000);

  it("keeps frontier continuity followups conversational without inline scaffold labels", async () => {
    const sessionId = "test-frontier-followup-readiness-repair";
    const firstResponse = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Is the sun conscious under Orch-OR style reasoning?",
        debug: true,
        verbosity: "extended",
        sessionId,
        max_tokens: 256,
        temperature: 0.2,
      }),
    });
    expect(firstResponse.status).toBe(200);

    const followupResponse = await fetch(`${baseUrl}/api/agi/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What in the reasoning ladder should we focus on since this is the case?",
        debug: true,
        verbosity: "extended",
        sessionId,
        max_tokens: 256,
        temperature: 0.2,
      }),
    });
    expect(followupResponse.status).toBe(200);
    const payload = (await followupResponse.json()) as {
      text: string;
      debug?: {
        frontier_theory_lens_active?: boolean;
        frontier_session_followup_requested?: boolean;
        answer_surface_mode?: string;
      };
    };

    expect(payload.debug?.frontier_theory_lens_active).toBe(true);
    expect(payload.debug?.frontier_session_followup_requested).toBe(true);
    expect(payload.debug?.answer_surface_mode).toBe("conversational");
    expect(payload.text).toMatch(/Focus on the falsifier step first/i);
    expect(payload.text).not.toMatch(/\bbaseline\s*:/i);
    expect(payload.text).not.toMatch(/^Definitions:/im);
    expect(payload.text).not.toMatch(/^Hypothesis:/im);
    expect(payload.text).not.toMatch(/^Anti-hypothesis:/im);
    expect(payload.text).not.toMatch(/^Claim tier:/im);
  }, 90000);
});
