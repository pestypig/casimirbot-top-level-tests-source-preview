import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const TSX_CLI = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const PREFLIGHT_SCRIPT = path.join(process.cwd(), "scripts", "toe-agent-preflight.ts");

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function setupFakeWorkspace(failingStageId?: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-preflight-"));
  const stageFiles = [
    "validate-toe-ticket-backlog.ts",
    "validate-toe-ticket-results.ts",
    "validate-physics-equation-backbone.ts",
    "validate-physics-root-leaf-manifest.ts",
    "validate-resolver-owner-coverage.ts",
    "validate-math-congruence-matrix.ts",
    "compute-toe-progress.ts",
  ];

  for (const file of stageFiles) {
    const stageId = file.replace(/\.ts$/, "");
    const shouldFail = failingStageId === stageId;
    writeFile(
      path.join(tempDir, "scripts", file),
      shouldFail
        ? 'console.error("failed"); process.exit(1);\n'
        : 'console.log("ok"); process.exit(0);\n',
    );
  }

  writeJson(path.join(tempDir, "docs", "knowledge", "evidence-falsifier-ledger-tree.json"), {
    rootId: "ledger-root",
    nodes: [],
  });
  writeJson(path.join(tempDir, "docs", "knowledge", "tool-plan-contracts-tree.json"), {
    rootId: "tool-root",
    nodes: [],
  });
  writeJson(path.join(tempDir, "configs", "graph-resolvers.json"), {
    trees: [
      {
        id: "evidence-falsifier-ledger",
        path: "docs/knowledge/evidence-falsifier-ledger-tree.json",
      },
      {
        id: "tool-plan-contracts",
        path: "docs/knowledge/tool-plan-contracts-tree.json",
      },
    ],
  });
  writeJson(path.join(tempDir, "configs", "resolver-owner-coverage-manifest.v1.json"), {
    schema_version: "resolver_owner_coverage_manifest/1",
    owners: {
      "evidence-falsifier-ledger": { status: "covered_core" },
    },
  });

  return tempDir;
}

function runPreflightWithEnv(workspaceRoot: string, extraEnv: Record<string, string>) {
  return spawnSync(process.execPath, [TSX_CLI, PREFLIGHT_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TOE_PREFLIGHT_ROOT: workspaceRoot,
      ...extraEnv,
    },
    encoding: "utf8",
  });
}

function runPreflight(workspaceRoot: string) {
  return runPreflightWithEnv(workspaceRoot, {});
}

describe("toe-agent-preflight", () => {
  it("runs required stages and marks optional research gate as skipped when absent", () => {
    const workspaceRoot = setupFakeWorkspace();
    const result = runPreflight(workspaceRoot);

    expect(result.status).toBe(0);

    const summary = JSON.parse(result.stdout);
    expect(summary.overall_pass).toBe(true);

    const statuses = Object.fromEntries(
      summary.stages.map((stage: { id: string; status: string }) => [stage.id, stage.status]),
    );

    expect(statuses["validate-toe-ticket-backlog"]).toBe("pass");
    expect(statuses["validate-toe-ticket-results"]).toBe("pass");
    expect(statuses["validate-physics-equation-backbone"]).toBe("pass");
    expect(statuses["validate-physics-root-leaf-manifest"]).toBe("pass");
    expect(statuses["validate-resolver-owner-coverage"]).toBe("pass");
    expect(statuses["validate-math-congruence-matrix"]).toBe("pass");
    expect(statuses["validate-evidence-falsifier-ledger"]).toBe("pass");
    expect(statuses["validate-tool-plan-contracts"]).toBe("pass");
    expect(statuses["validate-toe-research-gate-policy"]).toBe("skipped");
    expect(statuses["compute-toe-progress"]).toBe("pass");
  });

  it("exits non-zero when any required stage fails", () => {
    const workspaceRoot = setupFakeWorkspace("validate-toe-ticket-results");
    const result = runPreflight(workspaceRoot);

    expect(result.status).toBe(1);

    const summary = JSON.parse(result.stdout);
    expect(summary.overall_pass).toBe(false);

    const stage = summary.stages.find(
      (entry: { id: string }) => entry.id === "validate-toe-ticket-results",
    );
    expect(stage.status).toBe("fail");
    expect(stage.pass).toBe(false);
  });

  it("surfaces strict-ready stall warning when strict-ready progress is stalled", () => {
    const workspaceRoot = setupFakeWorkspace();
    writeJson(path.join(workspaceRoot, "docs", "audits", "toe-progress-snapshot.json"), {
      schema_version: "toe_progress_snapshot/1",
      totals: {
        strict_ready_progress_pct: 0,
        strict_ready_release_gate: {
          status: "blocked",
          blocked_reasons: ["missing_verified_pass"],
          blocked_ticket_count: 1,
          ready_ticket_count: 0,
        },
      },
      strict_ready_delta_targets: [{ ticket_id: "TOE-TEST-001" }],
    });

    const result = runPreflight(workspaceRoot);
    expect(result.status).toBe(0);

    const summary = JSON.parse(result.stdout);
    expect(summary.strict_ready_stall_warning).toEqual({
      warning: "strict_ready_stall",
      strict_ready_progress_pct: 0,
      strict_ready_delta_ticket_count: 1,
      guidance:
        "strict_ready_progress_pct is stalled; resolve strict_ready_delta_targets in toe-progress snapshot before scaling.",
    });
    expect(summary.strict_ready_release_gate).toEqual({
      status: "blocked",
      blocked_reasons: ["missing_verified_pass"],
      blocked_ticket_count: 1,
      ready_ticket_count: 0,
    });
  });

  it("does not emit strict-ready stall warning when strict-ready progress has increased", () => {
    const workspaceRoot = setupFakeWorkspace();
    writeJson(path.join(workspaceRoot, "docs", "audits", "toe-progress-snapshot.json"), {
      schema_version: "toe_progress_snapshot/1",
      totals: {
        strict_ready_progress_pct: 10,
      },
      strict_ready_delta_targets: [{ ticket_id: "TOE-TEST-001" }],
    });

    const result = runPreflight(workspaceRoot);
    expect(result.status).toBe(0);

    const summary = JSON.parse(result.stdout);
    expect(summary.strict_ready_stall_warning).toBeNull();
  });

  it("keeps stall as warning-only when strict-ready enforcement is disabled", () => {
    const workspaceRoot = setupFakeWorkspace();
    writeJson(path.join(workspaceRoot, "docs", "audits", "toe-progress-snapshot.json"), {
      schema_version: "toe_progress_snapshot/1",
      totals: {
        strict_ready_progress_pct: 0,
      },
      strict_ready_delta_targets: [{ ticket_id: "TOE-TEST-001" }],
    });

    const result = runPreflightWithEnv(workspaceRoot, { TOE_STRICT_READY_ENFORCE: "0" });
    expect(result.status).toBe(0);

    const summary = JSON.parse(result.stdout);
    expect(summary.stage_pass).toBe(true);
    expect(summary.overall_pass).toBe(true);
    expect(summary.strict_ready_enforcement).toEqual({
      enforced: false,
      blocked: false,
      reason: null,
    });
  });

  it("enforces strict-ready stall as a blocking gate when enabled", () => {
    const workspaceRoot = setupFakeWorkspace();
    writeJson(path.join(workspaceRoot, "docs", "audits", "toe-progress-snapshot.json"), {
      schema_version: "toe_progress_snapshot/1",
      totals: {
        strict_ready_progress_pct: 0,
      },
      strict_ready_delta_targets: [{ ticket_id: "TOE-TEST-001" }],
    });

    const result = runPreflightWithEnv(workspaceRoot, { TOE_STRICT_READY_ENFORCE: "1" });
    expect(result.status).toBe(1);

    const summary = JSON.parse(result.stdout);
    expect(summary.stage_pass).toBe(true);
    expect(summary.overall_pass).toBe(false);
    expect(summary.strict_ready_enforcement).toEqual({
      enforced: true,
      blocked: true,
      reason: "strict_ready_stall",
    });
    expect(summary.strict_ready_stall_warning?.warning).toBe("strict_ready_stall");
  });

  it("enforces strict-ready release gate when automation flag is enabled", () => {
    const workspaceRoot = setupFakeWorkspace();
    writeJson(path.join(workspaceRoot, "docs", "audits", "toe-progress-snapshot.json"), {
      schema_version: "toe_progress_snapshot/1",
      totals: {
        strict_ready_progress_pct: 50,
        strict_ready_release_gate: {
          status: "blocked",
          blocked_reasons: ["missing_verified_pass", "missing_research_artifacts"],
          blocked_ticket_count: 2,
          ready_ticket_count: 1,
        },
      },
      strict_ready_delta_targets: [{ ticket_id: "TOE-TEST-001" }, { ticket_id: "TOE-TEST-002" }],
    });

    const result = runPreflightWithEnv(workspaceRoot, {
      TOE_STRICT_READY_RELEASE_GATE_ENFORCE: "1",
    });
    expect(result.status).toBe(1);

    const summary = JSON.parse(result.stdout);
    expect(summary.overall_pass).toBe(false);
    expect(summary.strict_ready_release_gate).toEqual({
      status: "blocked",
      blocked_reasons: ["missing_verified_pass", "missing_research_artifacts"],
      blocked_ticket_count: 2,
      ready_ticket_count: 1,
    });
    expect(summary.strict_ready_enforcement).toEqual({
      enforced: true,
      blocked: true,
      reason: "strict_ready_release_gate",
    });
  });
});
