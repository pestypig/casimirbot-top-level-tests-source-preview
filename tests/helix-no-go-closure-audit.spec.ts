import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const req = createRequire(import.meta.url);
const tsxCli = path.join(path.dirname(req.resolve("tsx")), "cli.mjs");
const auditScriptPath = path.join(repoRoot, "scripts/helix-no-go-closure-audit.ts");
const validateScriptPath = path.join(repoRoot, "scripts/helix-decision-validate.ts");
const schemaPath = path.join(repoRoot, "schemas/helix-decision-package.schema.json");
const tempDirs: string[] = [];

type ValidateResult = {
  ok: boolean;
  failure_count: number;
  failures: string[];
};

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runCmd(cwd: string, command: string, args: string[]) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function runTsx(cwd: string, scriptAbs: string, args: string[] = []) {
  return runCmd(cwd, process.execPath, [tsxCli, scriptAbs, ...args]);
}

function initGitRepo(cwd: string) {
  const init = runCmd(cwd, "git", ["init"]);
  if (init.status !== 0) throw new Error(`git_init_failed:${init.stderr}`);
  const userName = runCmd(cwd, "git", ["config", "user.name", "Helix Test"]);
  if (userName.status !== 0) throw new Error(`git_config_name_failed:${userName.stderr}`);
  const userEmail = runCmd(cwd, "git", ["config", "user.email", "helix-test@example.com"]);
  if (userEmail.status !== 0) throw new Error(`git_config_email_failed:${userEmail.stderr}`);
  const add = runCmd(cwd, "git", ["add", "."]);
  if (add.status !== 0) throw new Error(`git_add_failed:${add.stderr}`);
  const commit = runCmd(cwd, "git", ["commit", "-m", "init"]);
  if (commit.status !== 0) throw new Error(`git_commit_failed:${commit.stderr}`);
}

function buildNoGoPackage() {
  return {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    evaluation_tier: "exploratory",
    git: {
      branch: "main",
      head: "abc123",
      origin_main: null,
      ahead_behind: { ahead: 0, behind: 0 },
    },
    runs: {
      narrow: "run-narrow",
      heavy: "run-heavy",
      ab_t02: "run-ab-t02",
      ab_t035: "run-ab-t035",
      casimir: "run-casimir",
    },
    gates: [
      {
        name: "relation_packet_built_rate",
        value: 0,
        threshold: 0.95,
        comparator: ">=",
        pass: false,
        source_path: "artifacts/heavy/missing-summary.json",
      },
      {
        name: "relation_dual_domain_ok_rate",
        value: 0,
        threshold: 0.95,
        comparator: ">=",
        pass: false,
        source_path: "artifacts/heavy/missing-summary.json",
      },
      {
        name: "report_mode_correct_rate",
        value: 0,
        threshold: 0.98,
        comparator: ">=",
        pass: false,
        source_path: "artifacts/heavy/missing-summary.json",
      },
      {
        name: "runtime_fallback_answer",
        value: 1,
        threshold: 0,
        comparator: "==",
        pass: false,
        source_path: "artifacts/narrow/missing-summary.json",
      },
    ],
    novelty: {
      t02: {
        overall: 0,
        by_family: { relation: 0, repo_technical: 0, ambiguous_general: 0 },
        target: 0.82,
        pass: false,
        source_path: "artifacts/ab/t02/missing-summary.json",
      },
      t035: {
        overall: 0,
        by_family: { relation: 0, repo_technical: 0, ambiguous_general: 0 },
        target: 0.82,
        pass: false,
        source_path: "artifacts/ab/t035/missing-summary.json",
      },
    },
    provenance: {
      pass: false,
      blocked_reason: "source_missing",
      warnings: [],
    },
    casimir: {
      verdict: "PASS",
      traceId: "trace",
      runId: "run",
      certificateHash: "hash",
      integrityOk: true,
      source_path: "artifacts/casimir/missing-casimir.json",
    },
    artifacts: [
      {
        path: "artifacts/heavy/missing-summary.json",
        exists: true,
        sha256: "x",
        size_bytes: 1,
        mtime_iso: new Date().toISOString(),
      },
      {
        path: "artifacts/narrow/missing-summary.json",
        exists: true,
        sha256: "x",
        size_bytes: 1,
        mtime_iso: new Date().toISOString(),
      },
      {
        path: "artifacts/ab/t02/missing-summary.json",
        exists: true,
        sha256: "x",
        size_bytes: 1,
        mtime_iso: new Date().toISOString(),
      },
      {
        path: "artifacts/ab/t035/missing-summary.json",
        exists: true,
        sha256: "x",
        size_bytes: 1,
        mtime_iso: new Date().toISOString(),
      },
      {
        path: "artifacts/casimir/missing-casimir.json",
        exists: true,
        sha256: "x",
        size_bytes: 1,
        mtime_iso: new Date().toISOString(),
      },
    ],
    decision: {
      value: "NO-GO",
      hard_blockers: ["source_missing"],
      reasoning: ["source paths unresolved"],
    },
    report_paths: {
      json: "reports/helix-decision-package.json",
      markdown: "reports/helix-decision-package.md",
    },
  };
}

function mkRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-no-go-audit-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, "reports"), { recursive: true });
  fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
  fs.copyFileSync(schemaPath, path.join(dir, "schemas/helix-decision-package.schema.json"));
  writeJson(path.join(dir, "reports/helix-decision-package.json"), buildNoGoPackage());
  writeJson(path.join(dir, "reports/helix-decision-validate.json"), { ok: false, failure_count: 0, failures: [] });
  initGitRepo(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("helix no-go closure audit script", () => {
  it("runs in a git repo and emits ASCII-safe command status markers", () => {
    const dir = mkRepo();
    const out = runTsx(dir, auditScriptPath);
    expect(out.status).toBe(0);
    const report = fs.readFileSync(path.join(dir, "reports/helix-no-go-closure-audit.md"), "utf8");
    expect(report).toContain("## Command log");
    expect(report).toMatch(/\[(OK|FAIL|WARN)\]/);
    expect(/[^\x00-\x7F]/.test(report)).toBe(false);
  });

  it("detects drift when failures change after index 3", () => {
    const dir = mkRepo();

    const firstValidate = runTsx(dir, validateScriptPath, ["--package", "reports/helix-decision-package.json"]);
    expect(firstValidate.status).not.toBe(0);

    const fresh = JSON.parse(
      fs.readFileSync(path.join(dir, "reports/helix-decision-validate.json"), "utf8"),
    ) as ValidateResult;
    expect(fresh.failures.length).toBeGreaterThan(3);

    const committed = {
      ...fresh,
      failures: [...fresh.failures],
      failure_count: fresh.failures.length,
    };
    committed.failures[3] = `${committed.failures[3]}::mutated`;
    writeJson(path.join(dir, "reports/helix-decision-validate.json"), committed);

    const audit = runTsx(dir, auditScriptPath);
    expect(audit.status).toBe(0);

    const report = fs.readFileSync(path.join(dir, "reports/helix-no-go-closure-audit.md"), "utf8");
    expect(report).toContain("Drift status: **DRIFT");
    expect(report).toContain("failure_list_changed");
    expect(report.includes("first_3_failures changed")).toBe(false);
  });
});


