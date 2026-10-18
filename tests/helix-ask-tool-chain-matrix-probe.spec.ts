import fs from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { CODEX_PARITY_AGENT_SPINE_CLASSES } from "../server/services/helix-ask/codex-parity-agent-spine-contract";

const TSX_CLI = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const TOOL_CHAIN_MATRIX_SCRIPT = path.join(process.cwd(), "scripts", "helix-ask-tool-chain-matrix-probe.ts");

const runToolChainMatrix = (extraEnv: Record<string, string>, args: string[] = []) =>
  spawnSync(process.execPath, [TSX_CLI, TOOL_CHAIN_MATRIX_SCRIPT, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
    encoding: "utf8",
    timeout: 20_000,
  });

const runToolChainMatrixAsync = (
  extraEnv: Record<string, string>,
  args: string[] = [],
): Promise<{ status: number | null; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, TOOL_CHAIN_MATRIX_SCRIPT, ...args], {
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
      reject(new Error(`tool-chain matrix child timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
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

describe("helix-ask-tool-chain-matrix-probe", () => {
  it("dry-runs the tool-chain scenario pack without touching the live server", () => {
    const result = runToolChainMatrix({}, ["--dry-run"]);
    expect(result.status).toBe(0);

    const summary = JSON.parse(result.stdout);
    const scenarioIds = summary.scenarios.map((scenario: { id: string }) => scenario.id);
    const categories = new Set(summary.scenarios.map((scenario: { category: string }) => scenario.category));
    expect(summary.ok).toBe(true);
    expect(summary.dry_run).toBe(true);
    expect(scenarioIds).toEqual(
      expect.arrayContaining([
        "docs_open",
        "docs_loop_discipline_summary",
        "calculator_steps",
        "note_delete_guard",
        "note_create_receipt_quarantine",
        "dottie_minecraft_missing_source",
        "voice_readout_guard",
        "negated_docs_open",
        "auntie_dottie_repo",
      ]),
    );
    expect(categories).toEqual(
      new Set([
        "workstation_tool",
        "docs_source",
        "calculator_tool",
        "mutating_guard",
        "note_mutation",
        "situation_room",
        "voice_policy",
        "negated_tool",
        "repo_evidence",
      ]),
    );
  });

  it("fails closed as a preflight block when the Ask turn API is unreachable", () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "helix-tool-chain-matrix-"));
    const result = runToolChainMatrix({
      HELIX_ASK_BASE_URL: "http://127.0.0.1:1",
      HELIX_ASK_TOOL_CHAIN_OUT: outputRoot,
      HELIX_ASK_TOOL_CHAIN_SCENARIOS: "negated_docs_open",
      HELIX_ASK_TOOL_CHAIN_TIMEOUT_MS: "1000",
    });

    expect(result.status).toBe(1);
    const summary = JSON.parse(result.stdout);
    expect(summary).toMatchObject({
      schema: "helix.ask_tool_chain_matrix_probe_summary.v1",
      ok: false,
      blocked: true,
      blocked_reason: "ask_turn_api_unreachable",
      counts: {
        pass: 0,
        warn: 1,
        fail: 0,
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
    const prompt = "Do not open the docs viewer; just explain what the docs viewer is for.";
    const railTable = {
      schema: "helix.codex_parity_agent_spine_rail_table.v1",
      turn_id: "turn-tool-chain-rail",
      prompt,
      requested_capability: "model.direct_answer",
      visible_tool_surface: ["model.direct_answer"],
      visible_tool_surface_original_count: 1,
      visible_tool_surface_truncated: false,
      selected_capability: "model.direct_answer",
      admitted_capability: "model.direct_answer",
      admission_proof_source: "capability_contract_arbitration",
      admission_proven: true,
      executed_capability: "model.direct_answer",
      observation_kind: "direct_answer_text",
      observation_ref: "artifact:direct-answer",
      required_observation_kinds_for_requested_capability: ["direct_answer_text"],
      observed_artifact_supports_requested_capability: true,
      reentry_status: "reentered",
      reentry_proof_source: "model_answer_artifact_created",
      reentry_proven: true,
      goal_satisfaction: "satisfied",
      required_terminal_kind: "model_synthesized_answer",
      selected_terminal_kind: "model_synthesized_answer",
      terminal_authority_proof_source: "terminal_authority_single_writer",
      terminal_authority_proven: true,
      visible_terminal_kind: "model_synthesized_answer",
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
    const visibleText = "The docs viewer is for reading and navigating project documents.";
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && req.url?.includes("__helix_tool_chain_preflight__/debug-export")) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "debug_export_not_found" }));
        return;
      }
      if (req.method === "POST" && req.url === "/api/agi/ask/turn") {
        res.end(JSON.stringify({ turn_id: "turn-tool-chain-rail", terminal_artifact_kind: "model_synthesized_answer", answer: visibleText }));
        return;
      }
      if (req.method === "GET" && req.url === "/api/agi/ask/turn/turn-tool-chain-rail/debug-export") {
        res.end(
          JSON.stringify({
            payload: {
              codex_parity_agent_spine_rail_table: railTable,
              causal_turn_timeline: {
                events: [{ stage: "model_answer_artifact_created" }],
              },
              terminal_authority_single_writer: {
                applied: true,
                selected_terminal_artifact_kind: "model_synthesized_answer",
                visible_text: visibleText,
              },
              terminal_artifact_kind: "model_synthesized_answer",
              text: visibleText,
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
      const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "helix-tool-chain-matrix-"));
      const result = await runToolChainMatrixAsync({
        HELIX_ASK_BASE_URL: `http://127.0.0.1:${address.port}`,
        HELIX_ASK_TOOL_CHAIN_OUT: outputRoot,
        HELIX_ASK_TOOL_CHAIN_SCENARIOS: "negated_docs_open",
        HELIX_ASK_TOOL_CHAIN_TIMEOUT_MS: "5000",
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary.ok).toBe(true);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0].rail_table).toMatchObject({
        present: true,
        turn_id: "turn-tool-chain-rail",
        prompt,
        requested_capability: "model.direct_answer",
        visible_tool_surface: ["model.direct_answer"],
        visible_tool_surface_original_count: 1,
        visible_tool_surface_truncated: false,
        selected_capability: "model.direct_answer",
        admitted_capability: "model.direct_answer",
        admission_proof_source: "capability_contract_arbitration",
        admission_proven: true,
        executed_capability: "model.direct_answer",
        observation_kind: "direct_answer_text",
        observation_ref: "artifact:direct-answer",
        reentry_status: "reentered",
        goal_satisfaction: "satisfied",
        required_terminal_kind: "model_synthesized_answer",
        selected_terminal_kind: "model_synthesized_answer",
        visible_terminal_kind: "model_synthesized_answer",
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
