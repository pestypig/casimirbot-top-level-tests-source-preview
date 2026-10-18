import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const TSX_CLI = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

function runTsxScript(scriptPath: string, env: NodeJS.ProcessEnv) {
  execFileSync(process.execPath, [TSX_CLI, scriptPath], {
    cwd: process.cwd(),
    env,
    stdio: "pipe",
  });
}

function runTsxScriptExpectFailure(scriptPath: string, env: NodeJS.ProcessEnv): string {
  try {
    runTsxScript(scriptPath, env);
    throw new Error("expected script to fail");
  } catch (error) {
    const output = String((error as { stderr?: Buffer }).stderr ?? "");
    return output;
  }
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

describe("TOE progress tooling", () => {
  it("reports combined toe progress across core and extension backlogs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-progress-"));
    const backlogPath = path.join(tempDir, "core.json");
    const extensionBacklogPath = path.join(tempDir, "extension.json");
    const resultsDir = path.join(tempDir, "results");
    const snapshotPath = path.join(tempDir, "snapshot.json");
    const manifestPath = path.join(tempDir, "manifest.json");

    writeJson(backlogPath, {
      schema_version: "toe_cloud_ticket_backlog/1",
      tickets: [{ id: "TOE-TEST-001" }, { id: "TOE-TEST-002" }],
    });

    writeJson(extensionBacklogPath, {
      schema_version: "toe_coverage_extension_backlog/1",
      tickets: [{ id: "TOE-TEST-002" }, { id: "TOE-TEST-003" }],
    });

    writeJson(path.join(resultsDir, "TOE-TEST-001.20260218-000000.json"), {
      schema_version: "toe_agent_ticket_result/1",
      ticket_id: "TOE-TEST-001",
      claim_tier: "certified",
      casimir: { verdict: "PASS", integrity_ok: true },
    });

    writeJson(manifestPath, {
      schema_version: "resolver_owner_coverage_manifest/1",
      high_priority_owners: ["owner-a"],
      owners: {
        "owner-a": { status: "covered_core" },
        "owner-b": { status: "unmapped" },
      },
    });

    runTsxScript("scripts/compute-toe-progress.ts", {
      ...process.env,
      TOE_BACKLOG_PATH: backlogPath,
      TOE_EXTENSION_BACKLOG_PATH: extensionBacklogPath,
      TOE_RESULTS_DIR: resultsDir,
      TOE_PROGRESS_SNAPSHOT_PATH: snapshotPath,
      RESOLVER_OWNER_COVERAGE_MANIFEST_PATH: manifestPath,
    });

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    expect(snapshot.totals.tickets_total).toBe(3);
    expect(snapshot.totals.toe_progress_pct).toBe(33.3);
    expect(snapshot.totals.forest_owner_coverage_pct).toBe(50);
    expect(snapshot.segments.core.tickets_total).toBe(2);
    expect(snapshot.segments.extension.tickets_total).toBe(2);
    expect(snapshot.segments.combined.tickets_total).toBe(3);
    expect(snapshot.segments.extension.toe_progress_pct).toBe(0);
  });

  it("falls back to core-only behavior when extension backlog is absent", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-progress-core-only-"));
    const backlogPath = path.join(tempDir, "core.json");
    const missingExtensionBacklogPath = path.join(tempDir, "missing-extension.json");
    const resultsDir = path.join(tempDir, "results");
    const snapshotPath = path.join(tempDir, "snapshot.json");
    const manifestPath = path.join(tempDir, "manifest.json");

    writeJson(backlogPath, {
      schema_version: "toe_cloud_ticket_backlog/1",
      tickets: [{ id: "TOE-TEST-001" }, { id: "TOE-TEST-002" }],
    });

    writeJson(path.join(resultsDir, "TOE-TEST-001.20260218-000000.json"), {
      schema_version: "toe_agent_ticket_result/1",
      ticket_id: "TOE-TEST-001",
      claim_tier: "certified",
      casimir: { verdict: "PASS", integrity_ok: true },
    });

    writeJson(manifestPath, {
      schema_version: "resolver_owner_coverage_manifest/1",
      high_priority_owners: ["owner-a"],
      owners: {
        "owner-a": { status: "covered_core" },
      },
    });

    runTsxScript("scripts/compute-toe-progress.ts", {
      ...process.env,
      TOE_BACKLOG_PATH: backlogPath,
      TOE_EXTENSION_BACKLOG_PATH: missingExtensionBacklogPath,
      TOE_RESULTS_DIR: resultsDir,
      TOE_PROGRESS_SNAPSHOT_PATH: snapshotPath,
      RESOLVER_OWNER_COVERAGE_MANIFEST_PATH: manifestPath,
    });

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    expect(snapshot.source.extension_backlog).toBeNull();
    expect(snapshot.totals.tickets_total).toBe(2);
    expect(snapshot.segments.extension.tickets_total).toBe(0);
    expect(snapshot.segments.combined.tickets_total).toBe(2);
  });



  it("reports strict-ready delta targets for the next execution batch", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-progress-strict-ready-"));
    const backlogPath = path.join(tempDir, "core.json");
    const extensionBacklogPath = path.join(tempDir, "extension.json");
    const resultsDir = path.join(tempDir, "results");
    const snapshotPath = path.join(tempDir, "snapshot.json");
    const manifestPath = path.join(tempDir, "manifest.json");

    writeJson(backlogPath, {
      schema_version: "toe_cloud_ticket_backlog/1",
      tickets: [
        { id: "TOE-TEST-001" },
        {
          id: "TOE-TEST-002",
          research_gate: { required_artifacts: ["runtime-contract-audit"] },
        },
      ],
    });

    writeJson(extensionBacklogPath, {
      schema_version: "toe_coverage_extension_backlog/1",
      tickets: [{ id: "TOE-TEST-003" }],
    });

    writeJson(path.join(resultsDir, "TOE-TEST-001.20260218-000000.json"), {
      schema_version: "toe_agent_ticket_result/1",
      ticket_id: "TOE-TEST-001",
      claim_tier: "reduced-order",
      casimir: { verdict: "PASS", integrity_ok: true },
    });

    writeJson(path.join(resultsDir, "TOE-TEST-002.20260218-000000.json"), {
      schema_version: "toe_agent_ticket_result/1",
      ticket_id: "TOE-TEST-002",
      claim_tier: "diagnostic",
      casimir: { verdict: "PASS", integrity_ok: true },
      research_artifacts: [],
    });

    writeJson(path.join(resultsDir, "TOE-TEST-003.20260218-000000.json"), {
      schema_version: "toe_agent_ticket_result/1",
      ticket_id: "TOE-TEST-003",
      claim_tier: "certified",
      casimir: { verdict: "FAIL", integrity_ok: true },
    });

    writeJson(manifestPath, {
      schema_version: "resolver_owner_coverage_manifest/1",
      high_priority_owners: ["owner-a"],
      owners: {
        "owner-a": { status: "covered_core" },
      },
    });

    runTsxScript("scripts/compute-toe-progress.ts", {
      ...process.env,
      TOE_BACKLOG_PATH: backlogPath,
      TOE_EXTENSION_BACKLOG_PATH: extensionBacklogPath,
      TOE_RESULTS_DIR: resultsDir,
      TOE_PROGRESS_SNAPSHOT_PATH: snapshotPath,
      RESOLVER_OWNER_COVERAGE_MANIFEST_PATH: manifestPath,
    });

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    expect(snapshot.totals.strict_ready_progress_pct).toBe(33.3);
    expect(snapshot.totals.strict_ready_delta_ticket_count).toBe(2);
    expect(snapshot.totals.strict_ready_release_gate).toEqual({
      status: "blocked",
      blocked_reasons: ["missing_verified_pass", "missing_research_artifacts"],
      blocked_ticket_count: 2,
      ready_ticket_count: 1,
      blocker_counts: {
        missing_verified_pass: 1,
        missing_research_artifacts: 1,
        missing_math_congruence: 0,
      },
    });
    expect(snapshot.segments.combined.strict_ready_delta_ticket_count).toBe(2);
    expect(snapshot.segments.combined.strict_ready_release_gate).toEqual({
      status: "blocked",
      blocked_reasons: ["missing_verified_pass", "missing_research_artifacts"],
      blocked_ticket_count: 2,
      ready_ticket_count: 1,
      blocker_counts: {
        missing_verified_pass: 1,
        missing_research_artifacts: 1,
        missing_math_congruence: 0,
      },
    });
    expect(snapshot.strict_ready_delta_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ticket_id: "TOE-TEST-002",
          next_strict_ready_claim_tier: "reduced-order",
          requires_verified_pass: true,
          requires_research_artifact_completion: true,
        }),
        expect.objectContaining({
          ticket_id: "TOE-TEST-003",
          next_strict_ready_claim_tier: "certified",
          requires_verified_pass: true,
          requires_research_artifact_completion: false,
        }),
      ]),
    );
  });


  it("tracks research-gated and artifact-complete ticket counts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-progress-research-"));
    const backlogPath = path.join(tempDir, "core.json");
    const extensionBacklogPath = path.join(tempDir, "extension.json");
    const resultsDir = path.join(tempDir, "results");
    const snapshotPath = path.join(tempDir, "snapshot.json");
    const manifestPath = path.join(tempDir, "manifest.json");

    writeJson(backlogPath, {
      schema_version: "toe_cloud_ticket_backlog/1",
      tickets: [
        { id: "TOE-TEST-001" },
        {
          id: "TOE-TEST-002",
          research_gate: { required_artifacts: ["runtime-contract-audit"] },
        },
      ],
    });

    writeJson(extensionBacklogPath, {
      schema_version: "toe_coverage_extension_backlog/1",
      tickets: [
        {
          id: "TOE-TEST-003",
          research_gate: { required_artifacts: ["runtime-contract-audit", "extra-proof"] },
        },
      ],
    });

    writeJson(path.join(resultsDir, "TOE-TEST-002.20260218-000000.json"), {
      schema_version: "toe_agent_ticket_result/1",
      ticket_id: "TOE-TEST-002",
      claim_tier: "diagnostic",
      casimir: { verdict: "PASS", integrity_ok: true },
      research_artifacts: ["runtime-contract-audit"],
    });

    writeJson(path.join(resultsDir, "TOE-TEST-003.20260218-000000.json"), {
      schema_version: "toe_agent_ticket_result/1",
      ticket_id: "TOE-TEST-003",
      claim_tier: "diagnostic",
      casimir: { verdict: "PASS", integrity_ok: true },
      research_artifacts: ["runtime-contract-audit"],
    });

    writeJson(manifestPath, {
      schema_version: "resolver_owner_coverage_manifest/1",
      high_priority_owners: ["owner-a"],
      owners: {
        "owner-a": { status: "covered_core" },
      },
    });

    runTsxScript("scripts/compute-toe-progress.ts", {
      ...process.env,
      TOE_BACKLOG_PATH: backlogPath,
      TOE_EXTENSION_BACKLOG_PATH: extensionBacklogPath,
      TOE_RESULTS_DIR: resultsDir,
      TOE_PROGRESS_SNAPSHOT_PATH: snapshotPath,
      RESOLVER_OWNER_COVERAGE_MANIFEST_PATH: manifestPath,
    });

    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    expect(snapshot.totals.research_gated_tickets_total).toBe(2);
    expect(snapshot.totals.research_artifact_complete_tickets_total).toBe(1);
    expect(snapshot.segments.core.research_gated_tickets_total).toBe(1);
    expect(snapshot.segments.extension.research_artifact_complete_tickets_total).toBe(0);
    const toe2 = snapshot.tickets.find((ticket: { ticket_id: string }) => ticket.ticket_id === "TOE-TEST-002");
    const toe3 = snapshot.tickets.find((ticket: { ticket_id: string }) => ticket.ticket_id === "TOE-TEST-003");
    expect(toe2?.research_artifact_complete).toBe(true);
    expect(toe3?.research_artifact_complete).toBe(false);
  });

  it("validates required research artifacts for research-gated tickets", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toe-results-research-"));
    const backlogPath = path.join(tempDir, "core.json");
    const extensionBacklogPath = path.join(tempDir, "extension.json");
    const resultsDir = path.join(tempDir, "results");

    writeJson(backlogPath, {
      schema_version: "toe_cloud_ticket_backlog/1",
      tickets: [
        {
          id: "TOE-TEST-RESEARCH",
          allowed_paths: ["scripts/compute-toe-progress.ts"],
          required_tests: ["tests/toe-progress.spec.ts"],
          research_gate: { required_artifacts: ["runtime-contract-audit"] },
        },
      ],
    });

    writeJson(extensionBacklogPath, {
      schema_version: "toe_coverage_extension_backlog/1",
      tickets: [],
    });

    writeJson(path.join(resultsDir, "TOE-TEST-RESEARCH.20260218-000000.json"), {
      schema_version: "toe_agent_ticket_result/1",
      ticket_id: "TOE-TEST-RESEARCH",
      files_changed: ["scripts/compute-toe-progress.ts"],
      tests_run: ["tests/toe-progress.spec.ts"],
      claim_tier: "diagnostic",
      casimir: {
        verdict: "PASS",
        trace_id: "adapter:test",
        run_id: "1",
        certificate_hash: "abcdef12345678",
        integrity_ok: true,
      },
      research_artifacts: [],
    });

    const stderr = runTsxScriptExpectFailure("scripts/validate-toe-ticket-results.ts", {
      ...process.env,
      TOE_TICKET_BACKLOG_PATH: backlogPath,
      TOE_TICKET_EXTENSION_BACKLOG_PATH: extensionBacklogPath,
      TOE_TICKET_RESULTS_DIR: resultsDir,
    });

    expect(stderr).toContain(
      "required research artifact missing from research_artifacts: runtime-contract-audit",
    );
  });
  it("fails validation when high-priority owners are unmapped", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "owner-coverage-"));
    const graphResolversPath = path.join(tempDir, "graph.json");
    const manifestPath = path.join(tempDir, "manifest.json");

    writeJson(graphResolversPath, {
      trees: [{ id: "owner-a" }, { id: "owner-b" }],
    });

    writeJson(manifestPath, {
      schema_version: "resolver_owner_coverage_manifest/1",
      high_priority_owners: ["owner-a"],
      owners: {
        "owner-a": { status: "unmapped" },
        "owner-b": { status: "covered_extension" },
      },
    });

    expect(() => {
      runTsxScript("scripts/validate-resolver-owner-coverage.ts", {
        ...process.env,
        RESOLVER_OWNER_COVERAGE_MANIFEST_PATH: manifestPath,
        GRAPH_RESOLVERS_PATH: graphResolversPath,
      });
    }).toThrow(/high-priority owners cannot be unmapped/);
  });
});
