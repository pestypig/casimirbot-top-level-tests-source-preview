import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type AskRow = {
  question: string;
  seed: number;
  status: number;
  latencyMs: number;
  text: string;
  failReason: string | null;
  debug: Record<string, unknown>;
  beforeText: string;
};

type GateMetric = {
  name: string;
  threshold: string;
  measured: number;
  pass: boolean;
};

const PS2_QUESTIONS = [
  "How does the universe produce life",
  "How can a Human protect itself from an AI financial hack",
] as const;
const PS2_SEEDS = [7, 11, 13] as const;
const PS2_TEMPERATURE = 0.2;
const STRICT_FAIL_PROBE = "STRICT FAIL CHECK: cite repo evidence for ZXQJ-404 impossible symbol";

const hasClaimCitationLinkage = (row: AskRow): boolean => {
  const semanticRate =
    ((row.debug.semantic_quality as { claim_citation_link_rate?: number } | undefined)?.claim_citation_link_rate ?? 0);
  if (semanticRate >= 0.9) return true;
  const hasSources = /Sources:/i.test(row.text);
  const body = row.text.replace(/\n\nSources:[\s\S]*$/i, " ").trim();
  const claimCount = body
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 20).length;
  return hasSources && claimCount >= 2;
};

const parsePreviousReportMetrics = (reportPath: string): Record<string, number> => {
  if (!fs.existsSync(reportPath)) return {};
  const out: Record<string, number> = {};
  for (const line of fs.readFileSync(reportPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\|\s*([a-z0-9_]+)\s*\|\s*[^|]+\|\s*(?:n\/a|([0-9.]+))\s*\|\s*([0-9.]+)\s*\|/i);
    if (!match) continue;
    out[match[1]] = Number(match[2] ?? match[3]);
  }
  return out;
};

describe("Helix Ask PS2 runtime report", () => {
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

  const askWithRetries = async (question: string, seed: number, sessionId: string) => {
    let lastStatus = 0;
    let payload: { text?: string; debug?: Record<string, unknown>; fail_reason?: string } = {};
    let latencyMs = 0;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const start = Date.now();
      const response = await fetch(`${baseUrl}/api/agi/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          debug: true,
          temperature: PS2_TEMPERATURE,
          seed,
          sessionId: `${sessionId}-a${attempt}`,
        }),
      });
      latencyMs = Date.now() - start;
      lastStatus = response.status;
      try {
        payload = (await response.json()) as { text?: string; debug?: Record<string, unknown>; fail_reason?: string };
      } catch {
        payload = {};
      }
      if (response.status === 200) break;
      if (response.status === 503 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        continue;
      }
      break;
    }

    return { status: lastStatus, latencyMs, payload };
  };

  it("writes deterministic PS2 runtime report with enforced quality thresholds", async () => {
    const rows: AskRow[] = [];

    for (const question of PS2_QUESTIONS) {
      await askWithRetries(question, 7, `ps2-warmup-${question.slice(0, 16)}`);
    }

    for (const question of PS2_QUESTIONS) {
      for (const seed of PS2_SEEDS) {
        const result = await askWithRetries(question, seed, `ps2-runtime-${seed}`);
        const debug = result.payload.debug ?? {};
        const failReason =
          result.payload.fail_reason ??
          ((debug as { helix_ask_fail_reason?: string | null }).helix_ask_fail_reason ?? null);
        rows.push({
          question,
          seed,
          status: result.status,
          latencyMs: result.latencyMs,
          text: result.payload.text ?? "",
          failReason,
          debug,
          beforeText: String(
            (debug as { answer_before_fallback?: string; answer_raw_preview?: string }).answer_before_fallback ??
              (debug as { answer_raw_preview?: string }).answer_raw_preview ??
              "before unavailable",
          ),
        });
      }
    }

    const strictDeterminismRows: Array<{ seed: number; attempt: number; key: string }> = [];
    for (const seed of PS2_SEEDS) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const result = await askWithRetries(STRICT_FAIL_PROBE, seed, `ps2-strict-${seed}-${attempt}`);
        const debug = (result.payload.debug ?? {}) as Record<string, unknown>;
        const reason =
          result.payload.fail_reason ??
          (typeof debug.helix_ask_fail_reason === "string" ? debug.helix_ask_fail_reason : null) ??
          (typeof debug.fallback_reason === "string" ? debug.fallback_reason : null) ??
          "none";
        strictDeterminismRows.push({ seed, attempt, key: `${result.status}:${reason}` });
      }
    }

    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const baseDir = path.join("artifacts", "experiments", "helix-ask-ps2", runId);
    fs.mkdirSync(path.join(baseDir, "raw"), { recursive: true });
    fs.writeFileSync(path.join(baseDir, "raw", "responses.json"), JSON.stringify(rows, null, 2));
    fs.writeFileSync(path.join(baseDir, "raw", "strict-fail-determinism.json"), JSON.stringify(strictDeterminismRows, null, 2));

    const mechanismRe = /\bMechanism:\s*.+->.+->.+/i;
    const maturityRe = /\bMaturity\s*\((?:exploratory|reduced-order|diagnostic|certified)\)\s*:/i;
    const citationRe = /Sources:/i;

    const rate = (predicate: (row: AskRow) => boolean): number =>
      rows.length === 0 ? 0 : rows.filter(predicate).length / rows.length;

    const sortedLatency = [...rows.map((row) => row.latencyMs)].sort((a, b) => a - b);
    const p95LatencyMs = sortedLatency[Math.max(0, Math.ceil(sortedLatency.length * 0.95) - 1)] ?? 0;

    const strictConsistency = PS2_SEEDS.map((seed) => {
      const keys = strictDeterminismRows.filter((row) => row.seed === seed).map((row) => row.key);
      const [head, ...rest] = keys;
      return head ? rest.every((item) => item === head) : false;
    });

    const non200Rate = rows.length === 0 ? 1 : rows.filter((row) => row.status !== 200).length / rows.length;

    const metrics = {
      claim_citation_linkage_pass_rate: rate((row) => hasClaimCitationLinkage(row)),
      mechanism_sentence_present_rate: rate((row) => mechanismRe.test(row.text)),
      maturity_label_present_rate: rate((row) => maturityRe.test(row.text)),
      citation_presence_rate: rate((row) => citationRe.test(row.text)),
      strict_fail_determinism_rate:
        strictConsistency.length === 0 ? 0 : strictConsistency.filter(Boolean).length / strictConsistency.length,
      p95_latency_ms: p95LatencyMs,
      non_200_rate: non200Rate,
    };

    const previousReports = fs
      .readdirSync("reports", { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^helix-ask-ps2-runtime-contract-.*\.md$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const previousPath = previousReports.length
      ? path.join("reports", previousReports[previousReports.length - 1])
      : "";
    const beforeMetrics = previousPath ? parsePreviousReportMetrics(previousPath) : {};

    const thresholds: Record<string, { threshold: string; pass: (value: number) => boolean }> = {
      claim_citation_linkage_pass_rate: { threshold: ">= 0.90", pass: (value) => value >= 0.9 },
      mechanism_sentence_present_rate: { threshold: ">= 0.95", pass: (value) => value >= 0.95 },
      maturity_label_present_rate: { threshold: ">= 0.95", pass: (value) => value >= 0.95 },
      citation_presence_rate: { threshold: ">= 0.95", pass: (value) => value >= 0.95 },
      strict_fail_determinism_rate: { threshold: "== 1.00", pass: (value) => value === 1 },
      p95_latency_ms: { threshold: "<= 2500", pass: (value) => value <= 2500 },
      non_200_rate: { threshold: "<= 0.02", pass: (value) => value <= 0.02 },
    };

    const gateRows: GateMetric[] = Object.entries(metrics).map(([name, measured]) => ({
      name,
      threshold: thresholds[name].threshold,
      measured,
      pass: thresholds[name].pass(measured),
    }));

    const summary = {
      runId,
      fixed_pack: {
        questions: PS2_QUESTIONS,
        seeds: PS2_SEEDS,
        temperature: PS2_TEMPERATURE,
      },
      before_report: previousPath || null,
      before_metrics: beforeMetrics,
      metrics,
      thresholds: Object.fromEntries(Object.entries(thresholds).map(([name, value]) => [name, value.threshold])),
      pass: gateRows.every((entry) => entry.pass),
    };
    fs.writeFileSync(path.join(baseDir, "summary.json"), JSON.stringify(summary, null, 2));

    const focusedQa = rows.map((row) => ({
      question: row.question,
      seed: row.seed,
      status: row.status,
      failReason: row.failReason,
      beforeSnippet: row.beforeText.slice(0, 280),
      afterSnippet: row.text.slice(0, 420),
      citations: (row.text.match(/Sources:\s*([^\n]+)/i)?.[1] ?? "not-present").slice(0, 220),
    }));
    fs.writeFileSync(path.join(baseDir, "focused-qa.json"), JSON.stringify(focusedQa, null, 2));

    const reportPath = path.join("reports", `helix-ask-ps2-runtime-contract-${runId}.md`);
    fs.mkdirSync("reports", { recursive: true });

    const lines = [
      `# Helix Ask PS2 Runtime Contract (${runId})`,
      "",
      "Run config: fixed prompt set, seeds=7,11,13; temperature=0.2; debug=true.",
      previousPath ? `Baseline report: ${previousPath}` : "Baseline report: unavailable",
      "",
      "| Metric | Threshold | Before | After | Delta | Pass |",
      "|---|---:|---:|---:|---:|:--:|",
      ...gateRows.map((entry) => {
        const before = beforeMetrics[entry.name] ?? Number.NaN;
        const delta = Number.isFinite(before) ? entry.measured - before : Number.NaN;
        const beforeText = Number.isFinite(before) ? before.toFixed(3) : "n/a";
        const deltaText = Number.isFinite(delta) ? `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}` : "n/a";
        return `| ${entry.name} | ${entry.threshold} | ${beforeText} | ${entry.measured.toFixed(3)} | ${deltaText} | ${entry.pass ? "PASS" : "FAIL"} |`;
      }),
      "",
      "## Strict fail determinism probe",
      "",
      "| Seed | Attempt | Key |",
      "|---:|---:|---|",
      ...strictDeterminismRows.map((row) => `| ${row.seed} | ${row.attempt} | ${row.key} |`),
      "",
      "## Before/after snippets",
      ...focusedQa.flatMap((entry) => [
        `- Q: ${entry.question} (seed ${entry.seed}, status ${entry.status})`,
        `  - Fail reason: ${entry.failReason ?? "none"}`,
        `  - Before: ${entry.beforeSnippet.replace(/\n+/g, " ")}`,
        `  - After: ${entry.afterSnippet.replace(/\n+/g, " ")}`,
        `  - Citations: ${entry.citations}`,
      ]),
      "",
      `Artifacts: ${baseDir}`,
    ];
    fs.writeFileSync(reportPath, lines.join("\n"));

    expect(rows).toHaveLength(PS2_QUESTIONS.length * PS2_SEEDS.length);
    expect(gateRows.every((entry) => entry.pass)).toBe(true);
    expect(fs.existsSync(path.join(baseDir, "summary.json"))).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);
  }, 240000);
});
