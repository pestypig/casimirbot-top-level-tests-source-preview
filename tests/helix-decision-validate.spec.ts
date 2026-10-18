import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, "tests/fixtures/helix-decision/base");
const tempDirs: string[] = [];
const req = createRequire(import.meta.url);
const tsxCli = path.join(path.dirname(req.resolve("tsx")), "cli.mjs");

function mk(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-decision-"));
  tempDirs.push(dir);
  for (const file of fs.readdirSync(fixtureRoot)) {
    fs.copyFileSync(path.join(fixtureRoot, file), path.join(dir, file));
  }
  fs.mkdirSync(path.join(dir, "reports"), { recursive: true });
  fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "schemas/helix-decision-package.schema.json"), path.join(dir, "schemas/helix-decision-package.schema.json"));
  writeJson(path.join(dir, "recommendation.json"), { decision_grade_ready: true });
  return dir;
}

function writeJson(filePath: string, value: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function basePackage() {
  return {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    evaluation_tier: "decision_grade",
    git: {
      branch: "main",
      head: "abc123",
      origin_main: "abc123",
      ahead_behind: { ahead: 0, behind: 0 },
    },
    runs: { narrow: "n", heavy: "h", ab_t02: "a", ab_t035: "b", casimir: "c" },
    gates: [
      { name: "provenance_gate_pass", value: true, threshold: true, comparator: "==", pass: true, source_path: "heavy-summary.json" },
      { name: "relation_packet_built_rate", value: 0.98, threshold: 0.95, comparator: ">=", pass: true, source_path: "heavy-summary.json" },
      { name: "runtime_fallback_answer", value: 0, threshold: 0, comparator: "==", pass: true, source_path: "narrow.json" },
      { name: "decision_grade_ready", value: true, threshold: true, comparator: "==", pass: true, source_path: "recommendation.json" },
    ],
    novelty: {
      t02: {
        overall: 0.9,
        by_family: { relation: 0.9, repo_technical: 0.9, ambiguous_general: 0.9 },
        target: 0.82,
        pass: true,
        source_path: "ab-t02-summary.json",
      },
      t035: {
        overall: 0.9,
        by_family: { relation: 0.9, repo_technical: 0.9, ambiguous_general: 0.9 },
        target: 0.82,
        pass: true,
        source_path: "ab-t035-summary.json",
      },
    },
    provenance: { pass: true, blocked_reason: null, warnings: [] },
    casimir: {
      verdict: "PASS",
      traceId: "t",
      runId: "r",
      certificateHash: "hash",
      integrityOk: true,
      source_path: "casimir.json",
    },
    artifacts: [
      { path: "heavy-summary.json", exists: true, sha256: "x", size_bytes: 1, mtime_iso: new Date().toISOString() },
      { path: "recommendation.json", exists: true, sha256: "x", size_bytes: 1, mtime_iso: new Date().toISOString() },
      { path: "ab-t02-summary.json", exists: true, sha256: "x", size_bytes: 1, mtime_iso: new Date().toISOString() },
      { path: "ab-t035-summary.json", exists: true, sha256: "x", size_bytes: 1, mtime_iso: new Date().toISOString() },
      { path: "casimir.json", exists: true, sha256: "x", size_bytes: 1, mtime_iso: new Date().toISOString() },
      { path: "narrow.json", exists: true, sha256: "x", size_bytes: 1, mtime_iso: new Date().toISOString() },
    ],
    decision: { value: "GO", hard_blockers: [], reasoning: [] },
    report_paths: { json: "reports/helix-decision-package.json", markdown: "reports/helix-decision-package.md" },
  };
}

function runTsx(cwd: string, scriptRel: string, args: string[] = [], env: NodeJS.ProcessEnv = {}): SpawnSyncReturns<string> {
  const out = spawnSync(process.execPath, [tsxCli, path.join(repoRoot, scriptRel), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (out.error) throw new Error(`failed_to_start_child:${scriptRel}:${out.error.message}\nstdout:${out.stdout}\nstderr:${out.stderr}`);
  return out;
}

function runValidator(cwd: string) {
  return runTsx(cwd, "scripts/helix-decision-validate.ts", ["--package", "pkg.json"]);
}

function readTimelineNdjson(filePath: string): Array<{ run_id: string; phase: string; event: string; details: Record<string, unknown>; ts_iso: string; path: string | null }> {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { run_id: string; phase: string; event: string; details: Record<string, unknown>; ts_iso: string; path: string | null });
}

function readTimelinePointer(root: string): { run_id: string; timeline_path: string; source: string } {
  return JSON.parse(fs.readFileSync(path.join(root, "reports/helix-decision-timeline.latest.json"), "utf8")) as {
    run_id: string;
    timeline_path: string;
    source: string;
  };
}

function writePackageFixtureSet(root: string) {
  writeJson(path.join(root, "reports/helix-self-tune-gate-summary.json"), {
    precheck_run_id: "narrow-run",
    strict_gates: {
      runtime_fallback_answer: 0,
      runtime_tdz_intentStrategy: 0,
      runtime_tdz_intentProfile: 0,
    },
  });

  writeJson(path.join(root, "reports/helix-self-tune-casimir.json"), {
    verdict: "PASS",
    integrityOk: true,
    traceId: "trace-1",
    runId: "run-1",
    certificateHash: "hash-1",
  });

  for (const run of ["run-new", "run-old"]) {
    writeJson(path.join(root, `artifacts/experiments/helix-step4-heavy-rerun/${run}/summary.json`), {
      run_id: `heavy-${run}`,
      run_complete: true,
      total_runs: 300,
      metrics: {
        relation_packet_built_rate: 0.98,
        relation_dual_domain_ok_rate: 0.98,
        report_mode_correct_rate: 0.99,
        citation_presence_rate: 1,
        stub_text_detected_rate: 0,
      },
      provenance: {
        gate_pass: true,
        branch: "unknown",
        head: "unknown",
        originMain: null,
        aheadBehind: null,
        warnings: [],
      },
    });
    writeJson(path.join(root, `artifacts/experiments/helix-step4-heavy-rerun/${run}/recommendation.json`), { decision_grade_ready: true });
  }

  writeJson(path.join(root, "artifacts/experiments/helix-step4-ab-rerun/t02/run/summary.json"), {
    summary_schema_version: 2,
    variant: "helix_t02_run",
    run_id: "ab-t02-run",
    novel_response_rate: 0.9,
    novel_response_rate_by_family: { relation: 0.9, repo_technical: 0.9, ambiguous_general: 0.9 },
  });

  writeJson(path.join(root, "artifacts/experiments/helix-step4-ab-rerun/t035/run/summary.json"), {
    summary_schema_version: 2,
    variant: "helix_t035_run",
    run_id: "ab-t035-run",
    novel_response_rate: 0.9,
    novel_response_rate_by_family: { relation: 0.9, repo_technical: 0.9, ambiguous_general: 0.9 },
  });
}

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("helix decision validate", () => {
  it("portable tsx invocation starts child process", () => {
    const dir = mk();
    fs.writeFileSync(path.join(dir, "pkg.json"), JSON.stringify(basePackage(), null, 2));
    const out = runValidator(dir);
    expect(typeof out.status).toBe("number");
    expect(out.error).toBeUndefined();
  });

  it("valid package passes", () => {
    const dir = mk();
    fs.writeFileSync(path.join(dir, "pkg.json"), JSON.stringify(basePackage(), null, 2));
    const out = runValidator(dir);
    expect(out.status).toBe(0);
  });

  it("schema failure path is machine-readable", () => {
    const dir = mk();
    const pkg = basePackage();
    // @ts-expect-error test invalid payload
    delete pkg.report_paths;
    fs.writeFileSync(path.join(dir, "pkg.json"), JSON.stringify(pkg, null, 2));
    const out = runValidator(dir);
    expect(out.status).not.toBe(0);
    expect(`${out.stdout}${out.stderr}`).toContain("schema_validation_failed");
  });

  it("provenance mismatch fails in decision_grade", () => {
    const dir = mk();
    const pkg = basePackage();
    pkg.git.branch = "feature/other";
    fs.writeFileSync(path.join(dir, "pkg.json"), JSON.stringify(pkg, null, 2));
    const out = runValidator(dir);
    expect(out.status).not.toBe(0);
    expect(`${out.stdout}${out.stderr}`).toContain("decision_grade_git_provenance_mismatch");
  });

  it("validator fails when package source diverges from manifest", () => {
    const dir = mk();
    const pkg = basePackage();
    fs.writeFileSync(path.join(dir, "pkg.json"), JSON.stringify(pkg, null, 2));
    writeJson(path.join(dir, "reports/helix-decision-inputs.json"), {
      selected_paths: {
        narrow: "narrow.json",
        heavy: "heavy-summary.json",
        recommendation: "other-recommendation.json",
        ab_t02: "ab-t02-summary.json",
        ab_t035: "ab-t035-summary.json",
        casimir: "casimir.json",
      },
    });
    const out = runValidator(dir);
    expect(out.status).not.toBe(0);
    expect(`${out.stdout}${out.stderr}`).toContain("decision_inputs_manifest_mismatch:recommendation");
  });

  it("validator passes when manifest and package align", () => {
    const dir = mk();
    const pkg = basePackage();
    fs.writeFileSync(path.join(dir, "pkg.json"), JSON.stringify(pkg, null, 2));
    writeJson(path.join(dir, "reports/helix-decision-inputs.json"), {
      selected_paths: {
        narrow: "narrow.json",
        heavy: "heavy-summary.json",
        recommendation: "recommendation.json",
        ab_t02: "ab-t02-summary.json",
        ab_t035: "ab-t035-summary.json",
        casimir: "casimir.json",
      },
    });
    const out = runValidator(dir);
    expect(out.status).toBe(0);
  });

  it("validator rejects artifact exists=true when file is missing", () => {
    const dir = mk();
    const pkg = basePackage();
    pkg.artifacts = [{ path: "ghost.json", exists: true, sha256: "x", size_bytes: 1, mtime_iso: new Date().toISOString() }];
    fs.writeFileSync(path.join(dir, "pkg.json"), JSON.stringify(pkg, null, 2));
    const out = runValidator(dir);
    expect(out.status).not.toBe(0);
    expect(`${out.stdout}${out.stderr}`).toContain("artifact_exists_true_but_missing:ghost.json");

    const pointer = readTimelinePointer(dir);
    const timeline = readTimelineNdjson(path.join(dir, pointer.timeline_path));
    const blocker = timeline.find((event) => event.event === "validator_first_blocker");
    expect(blocker?.phase).toBe("decision_validate");
    expect(String(blocker?.details?.blocker ?? "")).toContain("artifact_exists_true_but_missing");
  });
});

describe("helix decision package", () => {
  it("heavy role lock rejects embedded precheck marker candidate", () => {
    const dir = mk();
    writePackageFixtureSet(dir);
    writeJson(path.join(dir, "custom/heavy-precheck-run/summary.json"), {
      run_id: "bad-heavy",
      run_complete: true,
      total_runs: 300,
      metrics: {
        relation_packet_built_rate: 0.98,
        relation_dual_domain_ok_rate: 0.98,
        report_mode_correct_rate: 0.99,
        citation_presence_rate: 1,
        stub_text_detected_rate: 0,
      },
      provenance: { gate_pass: true, branch: "unknown", head: "unknown", originMain: null, aheadBehind: null, warnings: [] },
    });
    const out = runTsx(dir, "scripts/helix-decision-package.ts", ["--heavy", "custom/heavy-precheck-run/summary.json"]);
    expect(out.status).not.toBe(0);
    expect(`${out.stdout}${out.stderr}`).toContain("required_source_invalid_role:heavy:custom/heavy-precheck-run/summary.json");
  });

  it("removes stale package outputs when package generation fails", () => {
    const dir = mk();
    writePackageFixtureSet(dir);
    for (const name of ["helix-decision-package.json", "helix-decision-package.md", "helix-decision-inputs.json"]) {
      fs.writeFileSync(path.join(dir, "reports", name), "stale");
      expect(fs.existsSync(path.join(dir, "reports", name))).toBe(true);
    }
    const out = runTsx(dir, "scripts/helix-decision-package.ts", ["--heavy", "custom/heavy-precheck-run/summary.json"]);
    expect(out.status).not.toBe(0);
    for (const name of ["helix-decision-package.json", "helix-decision-package.md", "helix-decision-inputs.json"]) {
      expect(fs.existsSync(path.join(dir, "reports", name))).toBe(false);
    }
    const pointer = readTimelinePointer(dir);
    const timeline = readTimelineNdjson(path.join(dir, pointer.timeline_path));
    expect(timeline.some((event) => event.event === "fail_path_cleanup_complete")).toBe(true);
  });

  it("fails when source snapshot changes before write", () => {
    const dir = mk();
    writePackageFixtureSet(dir);
    const out = runTsx(dir, "scripts/helix-decision-package.ts", [], {
      HELIX_DECISION_TEST_DELETE_SOURCE_BEFORE_WRITE: "heavy",
    });
    expect(out.status).not.toBe(0);
    expect(`${out.stdout}${out.stderr}`).toContain("source_snapshot_mismatch:heavy");
    expect(fs.existsSync(path.join(dir, "reports/helix-decision-package.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "reports/helix-decision-package.md"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "reports/helix-decision-inputs.json"))).toBe(false);
  });

  it("fails on provenance mismatch before writing package", () => {
    const dir = mk();
    writePackageFixtureSet(dir);
    writeJson(path.join(dir, "custom-heavy-summary.json"), {
      run_id: "custom-heavy",
      run_complete: true,
      total_runs: 300,
      metrics: {
        relation_packet_built_rate: 0.98,
        relation_dual_domain_ok_rate: 0.98,
        report_mode_correct_rate: 0.99,
        citation_presence_rate: 1,
        stub_text_detected_rate: 0,
      },
      provenance: { gate_pass: true, branch: "other", head: "deadbeef", originMain: null, aheadBehind: "0\t1", warnings: [] },
    });
    writeJson(path.join(dir, "custom-heavy-recommendation.json"), { decision_grade_ready: true });
    const out = runTsx(dir, "scripts/helix-decision-package.ts", ["--heavy", "custom-heavy-summary.json", "--heavy-recommendation", "custom-heavy-recommendation.json"]);
    expect(out.status).not.toBe(0);
    expect(`${out.stdout}${out.stderr}`).toContain("required_source_provenance_mismatch");
    expect(fs.existsSync(path.join(dir, "reports/helix-decision-package.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "reports/helix-decision-package.md"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "reports/helix-decision-inputs.json"))).toBe(false);
  });

  it("writes decision inputs manifest with resolved paths and hashes", () => {
    const dir = mk();
    writePackageFixtureSet(dir);
    const out = runTsx(dir, "scripts/helix-decision-package.ts");
    expect(out.status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "reports/helix-decision-inputs.json"), "utf8"));
    expect(manifest.selected_paths.heavy).toContain("summary.json");
    expect(manifest.run_ids.heavy).toContain("heavy-");
    expect(manifest.inputs.heavy.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.inputs.heavy.size_bytes).toBeGreaterThan(0);

    const pointer = readTimelinePointer(dir);
    const timeline = readTimelineNdjson(path.join(dir, pointer.timeline_path));
    expect(timeline.some((event) => event.event === "package_start")).toBe(true);
    expect(timeline.some((event) => event.event === "source_selected_before_read")).toBe(true);
    expect(timeline.some((event) => event.event === "source_read_parse_complete")).toBe(true);
    expect(timeline.some((event) => event.event === "artifact_metadata_captured")).toBe(true);
    expect(timeline.some((event) => event.event === "before_write")).toBe(true);
    expect(timeline.some((event) => event.event === "after_write")).toBe(true);
    expect(timeline.some((event) => event.event === "package_end")).toBe(true);
    expect(typeof timeline[0]?.ts_iso).toBe("string");
  });

  it("standalone package creates run-scoped timeline and pointer", () => {
    const dir = mk();
    writePackageFixtureSet(dir);
    const out = runTsx(dir, "scripts/helix-decision-package.ts");
    expect(out.status).toBe(0);

    const pointer = readTimelinePointer(dir);
    expect(pointer.source).toBe("standalone_package");
    expect(pointer.run_id).not.toBe("standalone");
    expect(pointer.timeline_path).toContain(`helix-decision-timeline-${pointer.run_id}.jsonl`);
    expect(pointer.timeline_path).not.toContain("standalone");
    expect(fs.existsSync(path.join(dir, pointer.timeline_path))).toBe(true);
  });

  it("standalone validate creates run-scoped timeline and pointer", () => {
    const dir = mk();
    fs.writeFileSync(path.join(dir, "pkg.json"), JSON.stringify(basePackage(), null, 2));
    const out = runValidator(dir);
    expect(out.status).toBe(0);

    const pointer = readTimelinePointer(dir);
    expect(pointer.source).toBe("standalone_validate");
    expect(pointer.run_id).not.toBe("standalone");
    expect(pointer.timeline_path).toContain(`helix-decision-timeline-${pointer.run_id}.jsonl`);
    expect(pointer.timeline_path).not.toContain("standalone");
    expect(fs.existsSync(path.join(dir, pointer.timeline_path))).toBe(true);
  });

  it("env-provided run id and timeline path are honored exactly", () => {
    const dir = mk();
    writePackageFixtureSet(dir);
    const runId = "run-explicit";
    const timelinePath = "reports/helix-decision-timeline-explicit.jsonl";

    const packageOut = runTsx(dir, "scripts/helix-decision-package.ts", [], {
      HELIX_DECISION_RUN_ID: runId,
      HELIX_DECISION_TIMELINE_PATH: timelinePath,
    });
    expect(packageOut.status).toBe(0);

    const validateOut = runTsx(dir, "scripts/helix-decision-validate.ts", ["--package", "reports/helix-decision-package.json"], {
      HELIX_DECISION_RUN_ID: runId,
      HELIX_DECISION_TIMELINE_PATH: timelinePath,
    });
    expect(validateOut.status).toBe(0);

    const timeline = readTimelineNdjson(path.join(dir, timelinePath));
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.every((event) => event.run_id === runId)).toBe(true);
  });

  it("append-only shared timeline keeps package+validate events without loss", () => {
    const dir = mk();
    writePackageFixtureSet(dir);
    const runId = "run-concurrency-check";
    const timelinePath = "reports/helix-decision-timeline-run-concurrency-check.jsonl";

    const packageOut = runTsx(dir, "scripts/helix-decision-package.ts", [], {
      HELIX_DECISION_RUN_ID: runId,
      HELIX_DECISION_TIMELINE_PATH: timelinePath,
    });
    expect(packageOut.status).toBe(0);

    const validateOut = runTsx(dir, "scripts/helix-decision-validate.ts", ["--package", "reports/helix-decision-package.json"], {
      HELIX_DECISION_RUN_ID: runId,
      HELIX_DECISION_TIMELINE_PATH: timelinePath,
    });
    expect(validateOut.status).toBe(0);

    const timeline = readTimelineNdjson(path.join(dir, timelinePath));
    expect(timeline.length).toBeGreaterThanOrEqual(12);
    expect(timeline.every((event) => event.run_id === runId)).toBe(true);
    expect(timeline.some((event) => event.phase === "decision_package" && event.event === "package_start")).toBe(true);
    expect(timeline.some((event) => event.phase === "decision_package" && event.event === "package_end")).toBe(true);
    expect(timeline.some((event) => event.phase === "decision_validate" && event.event === "validate_start")).toBe(true);
    expect(timeline.some((event) => event.phase === "decision_validate" && event.event === "validate_end")).toBe(true);
  });
});

describe("helix decision validate workflow trigger policy", () => {
  it("requires explicit opt-in for PR decision-grade runs", () => {
    const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/helix-decision-validate.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("run_decision_grade");
    expect(workflow).toContain("run-decision-grade");
    expect(workflow).toContain("if: >-");
    expect(workflow).toContain("contains(github.event.pull_request.labels.*.name, 'run-decision-grade')");
  });
});
