import fs from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { CODEX_PARITY_AGENT_SPINE_CLASSES } from "../server/services/helix-ask/codex-parity-agent-spine-contract";

const TSX_CLI = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const LIVE_SPINE_SMOKE_SCRIPT = path.join(process.cwd(), "scripts", "helix-ask-live-spine-smoke.ts");

const runLiveSpineSmoke = (extraEnv: Record<string, string>, args: string[] = []) =>
  spawnSync(process.execPath, [TSX_CLI, LIVE_SPINE_SMOKE_SCRIPT, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
    encoding: "utf8",
    timeout: 20_000,
  });

const runLiveSpineSmokeAsync = (
  extraEnv: Record<string, string>,
  args: string[] = [],
): Promise<{ status: number | null; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, LIVE_SPINE_SMOKE_SCRIPT, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`live-spine smoke child timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 20_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
  });

describe("helix-ask-live-spine-smoke", () => {
  it("dry-runs the required convergence scenario pack without touching the live server", () => {
    const result = runLiveSpineSmoke({}, ["--dry-run"]);
    expect(result.status).toBe(0);

    const summary = JSON.parse(result.stdout);
    const scenarioIds = summary.scenarios.map((scenario: { id: string }) => scenario.id);
    const coverage = new Set(summary.scenarios.flatMap((scenario: { coverage?: string[] }) => scenario.coverage ?? []));
    expect(summary.ok).toBe(true);
    expect(summary.dry_run).toBe(true);
    expect(scenarioIds).toEqual(
      expect.arrayContaining([
        "calculator_explicit",
        "workspace_status_explicit",
        "docs_locate_explicit",
        "repo_search_explicit",
        "internet_search_config_or_complete",
        "live_source_mail_observation_or_fail_closed",
        "capability_catalog_runtime",
        "negated_calculator_context",
        "visual_capture_current_screen",
        "image_lens_alias",
      ]),
    );
    expect(coverage).toEqual(
      new Set([
        "calculator",
        "docs",
        "repo_code",
        "workspace_status",
        "live_source_mail",
        "internet_search",
        "visual_capture",
        "image_lens",
        "capability_catalog",
        "negated_contextual_tool_mentions",
      ]),
    );
    for (const scenario of summary.scenarios) {
      expect(scenario.coverage.length).toBeGreaterThan(0);
    }
  });

  it("fails closed as a preflight block when the Ask turn API is unreachable", () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "helix-live-spine-smoke-"));
    const result = runLiveSpineSmoke({
      HELIX_ASK_BASE_URL: "http://127.0.0.1:1",
      HELIX_ASK_LIVE_SPINE_OUT: outputRoot,
      HELIX_ASK_LIVE_SPINE_SCENARIOS: "capability_catalog_runtime",
      HELIX_ASK_LIVE_SPINE_TIMEOUT_MS: "1000",
    });

    expect(result.status).toBe(1);
    const summary = JSON.parse(result.stdout);
    expect(summary).toMatchObject({
      schema: "helix.ask_live_spine_smoke_summary.v1",
      ok: false,
      blocked: true,
      blocked_reason: "ask_turn_api_unreachable",
      counts: {
        pass: 0,
        fail: 0,
        warn: 1,
      },
      preflight: {
        ok: false,
        status: 0,
        reason: "ask_turn_api_unreachable",
      },
      results: [],
    });

    const summaryPath = path.join(summary.output_dir, "summary.json");
    const markdownPath = path.join(summary.output_dir, "summary.md");
    expect(fs.existsSync(summaryPath)).toBe(true);
    expect(fs.existsSync(markdownPath)).toBe(true);

    const persisted = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
    expect(persisted.blocked_reason).toBe("ask_turn_api_unreachable");
    expect(fs.readFileSync(markdownPath, "utf8")).toContain("preflight: blocked (ask_turn_api_unreachable)");
  });

  it("persists the full normalized rail summary from a live-style Ask/debug response", async () => {
    const prompt = "What tools are available for the helix ask to use?";
    const visibleText = "Helix Ask can inspect its runtime capability catalog for this turn.";
    const railTable = {
      schema: "helix.codex_parity_agent_spine_rail_table.v1",
      turn_id: "turn-live-spine-rail",
      prompt,
      requested_capability: null,
      visible_tool_surface: ["helix_ask.inspect_capability_catalog"],
      visible_tool_surface_original_count: 1,
      visible_tool_surface_truncated: false,
      selected_capability: "helix_ask.inspect_capability_catalog",
      admitted_capability: "helix_ask.inspect_capability_catalog",
      admission_proof_source: "capability_contract_arbitration",
      admission_proven: true,
      executed_capability: "helix_ask.inspect_capability_catalog",
      observation_kind: "capability_registry",
      observation_ref: "artifact:capability-registry",
      required_observation_kinds_for_requested_capability: [],
      observed_artifact_supports_requested_capability: true,
      reentry_status: "reentered",
      reentry_proof_source: "capability_registry_observation",
      reentry_proven: true,
      goal_satisfaction: "satisfied",
      required_terminal_kind: "capability_help_summary",
      selected_terminal_kind: "capability_help_summary",
      terminal_authority_proof_source: "terminal_authority_single_writer",
      terminal_authority_proven: true,
      visible_terminal_kind: "capability_help_summary",
      visible_projection_source: "terminal_authority_single_writer.visible_text",
      visible_projection_proven: true,
      first_broken_rail: null,
      repair_target: null,
      codex_parity_class: "complete",
      normalized_codex_parity_classes: [...CODEX_PARITY_AGENT_SPINE_CLASSES],
      rail_status: "complete",
      rail_failure_code: null,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && req.url?.includes("__helix_live_spine_preflight__/debug-export")) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "debug_export_not_found" }));
        return;
      }
      if (req.method === "POST" && req.url === "/api/agi/ask/turn") {
        res.end(
          JSON.stringify({
            turn_id: "turn-live-spine-rail",
            terminal_artifact_kind: "capability_help_summary",
            final_status: "final_answer",
            response_type: "final_answer",
            final_answer_source: "capability_help_summary",
            answer: visibleText,
          }),
        );
        return;
      }
      if (req.method === "GET" && req.url === "/api/agi/ask/turn/turn-live-spine-rail/debug-export") {
        res.end(
          JSON.stringify({
            payload: {
              codex_parity_agent_spine_rail_table: railTable,
              terminal_artifact_kind: "capability_help_summary",
              final_status: "final_answer",
              response_type: "final_answer",
              final_answer_source: "capability_help_summary",
              answer: visibleText,
            },
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not_found" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as AddressInfo;
      const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "helix-live-spine-smoke-"));
      const result = await runLiveSpineSmokeAsync({
        HELIX_ASK_BASE_URL: `http://127.0.0.1:${address.port}`,
        HELIX_ASK_LIVE_SPINE_OUT: outputRoot,
        HELIX_ASK_LIVE_SPINE_SCENARIOS: "capability_catalog_runtime",
        HELIX_ASK_LIVE_SPINE_TIMEOUT_MS: "5000",
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary.ok).toBe(true);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toMatchObject({
        scenario_id: "capability_catalog_runtime",
        coverage: ["capability_catalog"],
        verdict: "PASS",
      });
      expect(summary.results[0].rail_table).toMatchObject({
        prompt,
        requested_capability: null,
        visible_tool_surface: ["helix_ask.inspect_capability_catalog"],
        visible_tool_surface_original_count: 1,
        visible_tool_surface_truncated: false,
        selected_capability: "helix_ask.inspect_capability_catalog",
        admitted_capability: "helix_ask.inspect_capability_catalog",
        admission_proof_source: "capability_contract_arbitration",
        admission_proven: true,
        executed_capability: "helix_ask.inspect_capability_catalog",
        observation_kind: "capability_registry",
        observation_ref: "artifact:capability-registry",
        reentry_status: "reentered",
        goal_satisfaction: "satisfied",
        required_terminal_kind: "capability_help_summary",
        selected_terminal_kind: "capability_help_summary",
        visible_terminal_kind: "capability_help_summary",
        first_broken_rail: null,
        repair_target: null,
        codex_parity_class: "complete",
        normalized_codex_parity_classes: [...CODEX_PARITY_AGENT_SPINE_CLASSES],
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
    }
  });
});
