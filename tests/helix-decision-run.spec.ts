import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { buildSummaryShape, resolveSourcesForTest } from "../scripts/helix-decision-run";

const tempDirs: string[] = [];
const repoRoot = process.cwd();
const req = createRequire(import.meta.url);
const tsxCli = path.join(path.dirname(req.resolve("tsx")), "cli.mjs");

function mkDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-decision-run-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(root: string, relPath: string, value: Record<string, unknown>): void {
  const filePath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function createNpmShim(
  binDir: string,
  rootDir: string,
  options: { packageStatus?: number; validateStatus?: number; writePackage?: boolean; writeValidate?: boolean } = {},
): void {
  const shimScriptPath = path.join(binDir, "npm-shim.js");
  const shimScript = [
    '#!/usr/bin/env node',
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const args = process.argv.slice(2).join(" ");',
    `const rootDir = ${JSON.stringify(rootDir)};`,
    'const logPath = path.join(rootDir, "npm-invocations.log");',
    'fs.appendFileSync(logPath, `${args}\n`);',
    `const packageStatus = ${options.packageStatus ?? 0};`,
    `const validateStatus = ${options.validateStatus ?? 0};`,
    `const writePackage = ${options.writePackage ?? true};`,
    `const writeValidate = ${options.writeValidate ?? true};`,
    'if (args.includes("helix:decision:package")) {',
    '  if (writePackage) {',
    '    const reportsDir = path.join(rootDir, "reports");',
    '    fs.mkdirSync(reportsDir, { recursive: true });',
    '    fs.writeFileSync(path.join(reportsDir, "helix-decision-package.json"), JSON.stringify({ decision: { value: "GO", hard_blockers: [] } }));',
    '  }',
    '  process.exit(packageStatus);',
    '}',
    'if (args.includes("helix:decision:validate")) {',
    '  if (writeValidate) {',
    '    const reportsDir = path.join(rootDir, "reports");',
    '    fs.mkdirSync(reportsDir, { recursive: true });',
    '    fs.writeFileSync(path.join(reportsDir, "helix-decision-validate.json"), JSON.stringify({ ok: true }));',
    '  }',
    '  process.exit(validateStatus);',
    '}',
    'process.exit(0);',
    '',
  ].join("\n");

  fs.writeFileSync(shimScriptPath, shimScript, { mode: 0o755 });

  if (process.platform === "win32") {
    const cmdPath = path.join(binDir, "npm.cmd");
    const cmd = `@echo off
"${process.execPath}" "${shimScriptPath}" %*
`;
    fs.writeFileSync(cmdPath, cmd);
    return;
  }

  const shimPath = path.join(binDir, "npm");
  const launcher = `#!/usr/bin/env sh
"${process.execPath}" "${shimScriptPath}" "$@"
`;
  fs.writeFileSync(shimPath, launcher, { mode: 0o755 });
}

function pathWithShim(binDir: string): string {
  return `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
}

function readTimelineNdjson(filePath: string): Array<{ run_id: string; phase: string; event: string; details: Record<string, unknown>; ts_iso: string; pid: number }> {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { run_id: string; phase: string; event: string; details: Record<string, unknown>; ts_iso: string; pid: number });
}

afterEach(() => {
  delete process.env.HELIX_DECISION_ROOT;
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("helix decision run source resolution", () => {
  it("resolves recommendation from the same run dir as heavy", () => {
    const dir = mkDir();
    process.env.HELIX_DECISION_ROOT = dir;

    writeJson(dir, "reports/helix-self-tune-gate-summary.json", { strict_gates: { runtime_fallback_answer: 0 } });
    writeJson(dir, "reports/helix-self-tune-casimir.json", { verdict: "PASS", integrityOk: true });

    writeJson(dir, "artifacts/experiments/helix-step4-heavy-rerun/run-a/summary.json", {
      metrics: { relation_packet_built_rate: 0.97 },
      provenance: { gate_pass: true },
    });
    writeJson(dir, "artifacts/experiments/helix-step4-heavy-rerun/run-a/recommendation.json", { decision_grade_ready: true });

    writeJson(dir, "artifacts/experiments/helix-step4-heavy-rerun/run-b/recommendation.json", { decision_grade_ready: true });

    writeJson(dir, "artifacts/experiments/helix-step4-ab-rerun/t02/run/summary.json", {
      summary_schema_version: 2,
      variant: "helix_t02_run",
    });
    writeJson(dir, "artifacts/experiments/helix-step4-ab-rerun/t035/run/summary.json", {
      summary_schema_version: 2,
      variant: "helix_t035_run",
    });

    const runBReco = path.join(dir, "artifacts/experiments/helix-step4-heavy-rerun/run-b/recommendation.json");
    const newer = new Date(Date.now() + 1000);
    fs.utimesSync(runBReco, newer, newer);

    const resolved = resolveSourcesForTest({});
    expect(resolved.heavy).toContain("helix-step4-heavy-rerun/run-a/summary.json");
    expect(resolved.recommendation).toContain("helix-step4-heavy-rerun/run-a/recommendation.json");
  });

  it("resolves newest discovered artifacts when overrides are absent", () => {
    const dir = mkDir();
    process.env.HELIX_DECISION_ROOT = dir;

    writeJson(dir, "reports/helix-self-tune-gate-summary.json", { strict_gates: { runtime_fallback_answer: 0 } });
    writeJson(dir, "reports/helix-self-tune-casimir.json", { verdict: "PASS", integrityOk: true });
    writeJson(dir, "artifacts/experiments/helix-step4-heavy-rerun/new/summary.json", {
      metrics: { relation_packet_built_rate: 0.97 },
      provenance: { gate_pass: true },
    });
    writeJson(dir, "artifacts/experiments/helix-step4-heavy-rerun/new/recommendation.json", { decision_grade_ready: true });
    writeJson(dir, "artifacts/experiments/helix-step4-ab-rerun/t02/run/summary.json", {
      summary_schema_version: 2,
      variant: "helix_t02_run",
    });
    writeJson(dir, "artifacts/experiments/helix-step4-ab-rerun/t035/run/summary.json", {
      summary_schema_version: 2,
      variant: "helix_t035_run",
    });

    const resolved = resolveSourcesForTest({});
    expect(resolved.heavy).toContain("helix-step4-heavy-rerun/new/summary.json");
    expect(resolved.recommendation).toContain("helix-step4-heavy-rerun/new/recommendation.json");
    expect(resolved.ab_t02).toContain("helix-step4-ab-rerun/t02/run/summary.json");
    expect(resolved.ab_t035).toContain("helix-step4-ab-rerun/t035/run/summary.json");
  });

  it("fails when heavy and recommendation are from different run dirs", () => {
    const dir = mkDir();
    process.env.HELIX_DECISION_ROOT = dir;

    writeJson(dir, "reports/helix-self-tune-gate-summary.json", { strict_gates: { runtime_fallback_answer: 0 } });
    writeJson(dir, "reports/helix-self-tune-casimir.json", { verdict: "PASS", integrityOk: true });
    writeJson(dir, "custom/heavy/summary.json", { metrics: { relation_packet_built_rate: 0.99 }, provenance: { gate_pass: true } });
    writeJson(dir, "custom/reco/recommendation.json", { decision_grade_ready: true });
    writeJson(dir, "custom/t02/summary.json", { summary_schema_version: 2, variant: "helix_t02_override" });
    writeJson(dir, "custom/t035/summary.json", { summary_schema_version: 2, variant: "helix_t035_override" });

    expect(() =>
      resolveSourcesForTest({
        heavy: "custom/heavy/summary.json",
        recommendation: "custom/reco/recommendation.json",
        narrow: "reports/helix-self-tune-gate-summary.json",
        ab_t02: "custom/t02/summary.json",
        ab_t035: "custom/t035/summary.json",
        casimir: "reports/helix-self-tune-casimir.json",
      }),
    ).toThrow(/source_pair_mismatch:heavy_recommendation/);
  });

  it("uses explicit source overrides with highest precedence", () => {
    const dir = mkDir();
    process.env.HELIX_DECISION_ROOT = dir;

    writeJson(dir, "custom/narrow.json", { strict_gates: { runtime_fallback_answer: 0 } });
    writeJson(dir, "custom/heavy/heavy.json", { metrics: { relation_packet_built_rate: 0.99 }, provenance: { gate_pass: true } });
    writeJson(dir, "custom/heavy/recommendation.json", { decision_grade_ready: true });
    writeJson(dir, "custom/t02/ab-t02.json", { summary_schema_version: 2, variant: "helix_t02_override" });
    writeJson(dir, "custom/t035/ab-t035.json", { summary_schema_version: 2, variant: "helix_t035_override" });
    writeJson(dir, "custom/casimir.json", { verdict: "PASS", integrityOk: true });

    const resolved = resolveSourcesForTest({
      narrow: "custom/narrow.json",
      heavy: "custom/heavy/heavy.json",
      recommendation: "custom/heavy/recommendation.json",
      ab_t02: "custom/t02/ab-t02.json",
      ab_t035: "custom/t035/ab-t035.json",
      casimir: "custom/casimir.json",
    });

    expect(resolved).toEqual({
      narrow: "custom/narrow.json",
      heavy: "custom/heavy/heavy.json",
      recommendation: "custom/heavy/recommendation.json",
      ab_t02: "custom/t02/ab-t02.json",
      ab_t035: "custom/t035/ab-t035.json",
      casimir: "custom/casimir.json",
    });
  });
});

describe("helix decision run summary", () => {
  it("returns stable machine-readable summary shape", () => {
    const summary = buildSummaryShape({
      ok: true,
      decision: "GO",
      blockers: [],
      selected_sources: {
        narrow: "reports/helix-self-tune-gate-summary.json",
        heavy: "artifacts/heavy/summary.json",
        recommendation: "artifacts/heavy/recommendation.json",
        ab_t02: "artifacts/ab/t02/summary.json",
        ab_t035: "artifacts/ab/t035/summary.json",
        casimir: "reports/helix-self-tune-casimir.json",
      },
      commands: [{ name: "decision:package", cmd: "npm run helix:decision:package", status: 0 }],
    });

    expect(summary.ok).toBe(true);
    expect(summary.decision).toBe("GO");
    expect(Array.isArray(summary.blockers)).toBe(true);
    expect(summary.selected_sources.heavy).toContain("summary.json");
    expect(summary.commands[0].status).toBe(0);
  });



  it("writes summary on successful package+validate path", () => {
    const dir = mkDir();
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    createNpmShim(binDir, dir);

    writeJson(dir, "custom/narrow.json", { strict_gates: { runtime_fallback_answer: 0 } });
    writeJson(dir, "custom/heavy/summary.json", { metrics: { relation_packet_built_rate: 0.99 }, provenance: { gate_pass: true } });
    writeJson(dir, "custom/heavy/recommendation.json", { decision_grade_ready: true });
    writeJson(dir, "custom/t02/summary.json", { summary_schema_version: 2, variant: "helix_t02_override" });
    writeJson(dir, "custom/t035/summary.json", { summary_schema_version: 2, variant: "helix_t035_override" });
    writeJson(dir, "custom/casimir.json", { verdict: "PASS", integrityOk: true });

    const out = spawnSync(
      process.execPath,
      [
        tsxCli,
        path.join(repoRoot, "scripts/helix-decision-run.ts"),
        "--fresh",
        "false",
        "--narrow",
        "custom/narrow.json",
        "--heavy",
        "custom/heavy/summary.json",
        "--recommendation",
        "custom/heavy/recommendation.json",
        "--ab-t02",
        "custom/t02/summary.json",
        "--ab-t035",
        "custom/t035/summary.json",
        "--casimir",
        "custom/casimir.json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          HELIX_DECISION_ROOT: dir,
          PATH: pathWithShim(binDir),
        },
      },
    );

    expect(out.status).toBe(0);
    const summaryPath = path.join(dir, "reports/helix-decision-run-summary.json");
    expect(fs.existsSync(summaryPath)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as {
      ok: boolean;
      decision: string;
      commands: Array<{ name: string; cmd: string }>;
      selected_sources: Record<string, string>;
    };
    expect(summary.ok).toBe(true);
    expect(summary.decision).toBe("GO");
    expect(summary.commands.some((command) => command.name === "decision:package")).toBe(true);
    expect(summary.commands.some((command) => command.name === "decision:validate")).toBe(true);

    const pointerPath = path.join(dir, "reports/helix-decision-timeline.latest.json");
    expect(fs.existsSync(pointerPath)).toBe(true);
    const pointer = JSON.parse(fs.readFileSync(pointerPath, "utf8")) as { run_id: string; timeline_path: string };
    expect(pointer.timeline_path).toContain(`helix-decision-timeline-${pointer.run_id}.jsonl`);

    const timelinePath = path.join(dir, pointer.timeline_path);
    expect(fs.existsSync(timelinePath)).toBe(true);
    const timeline = readTimelineNdjson(timelinePath);
    expect(timeline.length).toBeGreaterThanOrEqual(10);
    const phaseEvents = timeline.map((event) => `${event.phase}:${event.event}`);
    expect(phaseEvents).toContain("decision_run:run_start");
    expect(phaseEvents).toContain("resolve_sources:resolve_sources_start");
    expect(phaseEvents).toContain("resolve_sources:resolve_sources_end");
    expect(phaseEvents).toContain("decision_package:decision_package_start");
    expect(phaseEvents).toContain("decision_package:decision_package_end");
    expect(phaseEvents).toContain("decision_validate:decision_validate_start");
    expect(phaseEvents).toContain("decision_validate:decision_validate_end");
    expect(phaseEvents).toContain("decision_run:run_end");

    const packageCmd = summary.commands.find((command) => command.name === "decision:package")?.cmd ?? "";
    expect(packageCmd).toContain(summary.selected_sources.narrow);
    expect(packageCmd).toContain(summary.selected_sources.heavy);
    expect(packageCmd).toContain(summary.selected_sources.recommendation);
    expect(packageCmd).toContain(summary.selected_sources.ab_t02);
    expect(packageCmd).toContain(summary.selected_sources.ab_t035);
    expect(packageCmd).toContain(summary.selected_sources.casimir);
  });
  it("stops on package failure with machine-readable blocker and no validate fallback", () => {
    const dir = mkDir();
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    createNpmShim(binDir, dir, { packageStatus: 11, validateStatus: 99, writePackage: false, writeValidate: false });

    writeJson(dir, "custom/narrow.json", { strict_gates: { runtime_fallback_answer: 0 } });
    writeJson(dir, "custom/heavy/summary.json", { metrics: { relation_packet_built_rate: 0.99 }, provenance: { gate_pass: true } });
    writeJson(dir, "custom/heavy/recommendation.json", { decision_grade_ready: true });
    writeJson(dir, "custom/t02/summary.json", { summary_schema_version: 2, variant: "helix_t02_override" });
    writeJson(dir, "custom/t035/summary.json", { summary_schema_version: 2, variant: "helix_t035_override" });
    writeJson(dir, "custom/casimir.json", { verdict: "PASS", integrityOk: true });

    const out = spawnSync(
      process.execPath,
      [
        tsxCli,
        path.join(repoRoot, "scripts/helix-decision-run.ts"),
        "--fresh",
        "false",
        "--narrow",
        "custom/narrow.json",
        "--heavy",
        "custom/heavy/summary.json",
        "--recommendation",
        "custom/heavy/recommendation.json",
        "--ab-t02",
        "custom/t02/summary.json",
        "--ab-t035",
        "custom/t035/summary.json",
        "--casimir",
        "custom/casimir.json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          HELIX_DECISION_ROOT: dir,
          PATH: pathWithShim(binDir),
        },
      },
    );

    expect(out.status).toBe(1);
    const summary = JSON.parse(fs.readFileSync(path.join(dir, "reports/helix-decision-run-summary.json"), "utf8")) as {
      blockers: string[];
      commands: Array<{ name: string }>;
    };
    expect(summary.blockers).toContain("decision_package_blocker:package_generation_failed");
    expect(summary.commands.some((command) => command.name === "decision:validate")).toBe(false);

    const calls = fs.readFileSync(path.join(dir, "npm-invocations.log"), "utf8");
    expect(calls).toContain("run helix:decision:package --");
    expect(calls).not.toContain("run helix:decision:validate -- --package reports/helix-decision-package.json");
  });

  it("bundle mode rejects mtime discovery fallback without explicit sources", () => {
    const dir = mkDir();
    const out = spawnSync(process.execPath, [tsxCli, path.join(repoRoot, "scripts/helix-decision-run.ts"), "--bundle-mode", "true", "--fresh", "false"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        HELIX_DECISION_ROOT: dir,
      },
    });

    expect(out.status).toBe(1);
    const summary = JSON.parse(fs.readFileSync(path.join(dir, "reports/helix-decision-run-summary.json"), "utf8")) as {
      mode_used: string;
      first_blocker: string;
    };
    expect(summary.mode_used).toBe("bundle");
    expect(summary.first_blocker).toContain("bundle_mode_requires_explicit_source");
  });
});
