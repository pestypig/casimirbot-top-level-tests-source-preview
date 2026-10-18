import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { computeDecisionHash } from "../scripts/lib/helix-decision-bundle";

const repoRoot = process.cwd();
const req = createRequire(import.meta.url);
const tsxCli = path.join(path.dirname(req.resolve("tsx")), "cli.mjs");
const tempDirs: string[] = [];
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

type GitSnapshot = {
  branch: string | null;
  head: string | null;
  originMain: string | null;
  aheadBehind: { ahead: number; behind: number } | null;
};

function mkDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helix-bundle-"));
  tempDirs.push(dir);
  return dir;
}

function cpFixture(dir: string): void {
  const fixtureDir = path.join(repoRoot, "tests/fixtures/helix-decision-bundle");
  fs.mkdirSync(path.join(dir, "inputs"), { recursive: true });
  for (const name of ["narrow.json", "heavy-summary.json", "heavy-recommendation.json", "ab-t02.json", "ab-t035.json", "casimir.json"]) {
    fs.copyFileSync(path.join(fixtureDir, name), path.join(dir, "inputs", name));
  }
  fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "schemas/helix-decision-bundle.schema.json"), path.join(dir, "schemas/helix-decision-bundle.schema.json"));
  fs.mkdirSync(path.join(dir, "configs"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "configs/helix-decision-policy.v1.json"), path.join(dir, "configs/helix-decision-policy.v1.json"));
}

function writeNpmShim(dir: string): void {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  const shim = path.join(bin, "npm");
  fs.writeFileSync(
    shim,
    `#!/usr/bin/env node
const fs=require('node:fs');const path=require('node:path');
const args=process.argv.slice(2).join(' ');
if(args.includes('helix:decision:package')){
 const reports=path.join(process.cwd(),'reports'); fs.mkdirSync(reports,{recursive:true});
 const pkg={evaluation_tier:'decision_grade',git:{branch:'main',head:'abc',origin_main:'def',ahead_behind:{ahead:0,behind:0}},thresholds:{a:1},gates:[{name:'g',pass:true}],novelty:{t02:{pass:true},t035:{pass:true}},provenance:{pass:true},casimir:{verdict:'PASS',integrityOk:true},decision:{value:'GO',hard_blockers:[]}};
 fs.writeFileSync(path.join(reports,'helix-decision-package.json'), JSON.stringify(pkg,null,2)); process.exit(0);
}
process.exit(0);
`,
    { mode: 0o755 },
  );
}

function run(dir: string, script: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [tsxCli, path.join(repoRoot, script), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, PATH: `${path.join(dir, "bin")}${path.delimiter}${process.env.PATH ?? ""}` },
  });
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function gitOutput(args: string[]): string | null {
  const out = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (out.status !== 0) return null;
  const trimmed = out.stdout.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getGitSnapshot(): GitSnapshot {
  const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = gitOutput(["rev-parse", "--short", "HEAD"]);
  const originMain = gitOutput(["rev-parse", "--short", "origin/main"]);
  const aheadBehindRaw = gitOutput(["rev-list", "--left-right", "--count", "origin/main...HEAD"]);
  let aheadBehind: { ahead: number; behind: number } | null = null;
  if (aheadBehindRaw) {
    const match = aheadBehindRaw.match(/^(\d+)\s+(\d+)$/);
    if (match) {
      aheadBehind = { ahead: Number(match[2]), behind: Number(match[1]) };
    }
  }

  return { branch, head, originMain, aheadBehind };
}

function prepareIntegrationFixtures(): {
  narrow: string;
  heavy: string;
  heavyRecommendation: string;
  abT02: string;
  abT035: string;
  casimir: string;
} {
  const dir = mkDir();
  cpFixture(dir);

  const heavyPath = path.join(dir, "inputs", "heavy-summary.json");
  const heavy = readJson(heavyPath);
  const provenance = (heavy.provenance ?? {}) as Record<string, unknown>;
  const git = getGitSnapshot();

  provenance.branch = git.branch;
  provenance.head = git.head;
  provenance.origin_main = git.originMain;
  provenance.ahead_behind = git.aheadBehind;

  heavy.provenance = provenance;
  fs.writeFileSync(heavyPath, `${JSON.stringify(heavy, null, 2)}\n`);

  return {
    narrow: path.relative(repoRoot, path.join(dir, "inputs", "narrow.json")),
    heavy: path.relative(repoRoot, heavyPath),
    heavyRecommendation: path.relative(repoRoot, path.join(dir, "inputs", "heavy-recommendation.json")),
    abT02: path.relative(repoRoot, path.join(dir, "inputs", "ab-t02.json")),
    abT035: path.relative(repoRoot, path.join(dir, "inputs", "ab-t035.json")),
    casimir: path.relative(repoRoot, path.join(dir, "inputs", "casimir.json")),
  };
}

function expectSuccess(result: ReturnType<typeof spawnSync>, context: string): void {
  expect(result.status, `${context}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`).toBe(0);
}

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("helix decision bundle", () => {
  it("passes schema+verify for generated bundle", () => {
    const dir = mkDir();
    cpFixture(dir);
    writeNpmShim(dir);

    const gen = run(dir, "scripts/helix-decision-bundle.ts", [
      "--narrow", "inputs/narrow.json", "--heavy", "inputs/heavy-summary.json", "--heavy-recommendation", "inputs/heavy-recommendation.json", "--ab-t02", "inputs/ab-t02.json", "--ab-t035", "inputs/ab-t035.json", "--casimir", "inputs/casimir.json",
    ]);
    expect(gen.status).toBe(0);

    const verify = run(dir, "scripts/helix-decision-bundle-verify.ts", ["--bundle", "reports/helix-decision-bundle.json"]);
    expect(verify.status).toBe(0);

    const report = JSON.parse(fs.readFileSync(path.join(dir, "reports/helix-decision-bundle-verify.json"), "utf8"));
    expect(report.ok).toBe(true);
  });

  it("runs real npm integration path against temporary fixtures with dynamic provenance", () => {
    const fixtures = prepareIntegrationFixtures();

    const gen = spawnSync(npmCommand, [
      "run",
      "helix:decision:bundle",
      "--",
      "--narrow",
      fixtures.narrow,
      "--heavy",
      fixtures.heavy,
      "--heavy-recommendation",
      fixtures.heavyRecommendation,
      "--ab-t02",
      fixtures.abT02,
      "--ab-t035",
      fixtures.abT035,
      "--casimir",
      fixtures.casimir,
      "--evaluation-tier",
      "decision_grade",
    ], { cwd: repoRoot, encoding: "utf8" });
    expectSuccess(gen, "helix:decision:bundle failed");

    const verify = spawnSync(npmCommand, ["run", "helix:decision:bundle:verify", "--", "--bundle", "reports/helix-decision-bundle.json"], { cwd: repoRoot, encoding: "utf8" });
    expectSuccess(verify, "helix:decision:bundle:verify failed");
  });

  it("allows exploratory bundle generation when provenance does not match git", () => {
    const fixtures = prepareIntegrationFixtures();
    const heavyPath = path.resolve(repoRoot, fixtures.heavy);
    const heavy = readJson(heavyPath);
    (heavy.provenance as Record<string, unknown>).branch = "intentionally-mismatched";
    fs.writeFileSync(heavyPath, `${JSON.stringify(heavy, null, 2)}\n`);

    const gen = spawnSync(npmCommand, [
      "run", "helix:decision:bundle", "--",
      "--narrow", fixtures.narrow,
      "--heavy", fixtures.heavy,
      "--heavy-recommendation", fixtures.heavyRecommendation,
      "--ab-t02", fixtures.abT02,
      "--ab-t035", fixtures.abT035,
      "--casimir", fixtures.casimir,
      "--evaluation-tier", "exploratory",
    ], { cwd: repoRoot, encoding: "utf8" });
    expectSuccess(gen, "exploratory helix:decision:bundle failed");

    const bundle = readJson(path.join(repoRoot, "reports/helix-decision-bundle.json"));
    expect(bundle?.decision).toBeTruthy();
  });

  it("fails on digest mismatch", () => {
    const dir = mkDir();
    cpFixture(dir);
    writeNpmShim(dir);
    run(dir, "scripts/helix-decision-bundle.ts", ["--narrow", "inputs/narrow.json", "--heavy", "inputs/heavy-summary.json", "--heavy-recommendation", "inputs/heavy-recommendation.json", "--ab-t02", "inputs/ab-t02.json", "--ab-t035", "inputs/ab-t035.json", "--casimir", "inputs/casimir.json"]);
    fs.writeFileSync(path.join(dir, "inputs", "narrow.json"), "{\"tampered\":true}\n");
    const verify = run(dir, "scripts/helix-decision-bundle-verify.ts", ["--bundle", "reports/helix-decision-bundle.json"]);
    expect(verify.status).toBe(1);
    expect(verify.stdout).toContain("evidence_digest_mismatch");
  });

  it("fails on missing evidence", () => {
    const dir = mkDir();
    cpFixture(dir);
    writeNpmShim(dir);
    run(dir, "scripts/helix-decision-bundle.ts", ["--narrow", "inputs/narrow.json", "--heavy", "inputs/heavy-summary.json", "--heavy-recommendation", "inputs/heavy-recommendation.json", "--ab-t02", "inputs/ab-t02.json", "--ab-t035", "inputs/ab-t035.json", "--casimir", "inputs/casimir.json"]);
    fs.rmSync(path.join(dir, "inputs", "ab-t02.json"));
    const verify = run(dir, "scripts/helix-decision-bundle-verify.ts", ["--bundle", "reports/helix-decision-bundle.json"]);
    expect(verify.status).toBe(1);
    expect(verify.stdout).toContain("evidence_missing");
  });

  it("fails on decision hash mismatch", () => {
    const dir = mkDir();
    cpFixture(dir);
    writeNpmShim(dir);
    run(dir, "scripts/helix-decision-bundle.ts", ["--narrow", "inputs/narrow.json", "--heavy", "inputs/heavy-summary.json", "--heavy-recommendation", "inputs/heavy-recommendation.json", "--ab-t02", "inputs/ab-t02.json", "--ab-t035", "inputs/ab-t035.json", "--casimir", "inputs/casimir.json"]);
    const bundlePath = path.join(dir, "reports/helix-decision-bundle.json");
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    bundle.decision.decision_hash = "0".repeat(64);
    fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
    const verify = run(dir, "scripts/helix-decision-bundle-verify.ts", ["--bundle", "reports/helix-decision-bundle.json"]);
    expect(verify.status).toBe(1);
    expect(verify.stdout).toContain("decision_hash_mismatch");
  });

  it("fails when top-level sections diverge from normalized payload", () => {
    const dir = mkDir();
    cpFixture(dir);
    writeNpmShim(dir);
    run(dir, "scripts/helix-decision-bundle.ts", ["--narrow", "inputs/narrow.json", "--heavy", "inputs/heavy-summary.json", "--heavy-recommendation", "inputs/heavy-recommendation.json", "--ab-t02", "inputs/ab-t02.json", "--ab-t035", "inputs/ab-t035.json", "--casimir", "inputs/casimir.json"]);
    const bundlePath = path.join(dir, "reports/helix-decision-bundle.json");
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    bundle.provenance.branch = "tampered";
    fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
    const verify = run(dir, "scripts/helix-decision-bundle-verify.ts", ["--bundle", "reports/helix-decision-bundle.json"]);
    expect(verify.status).toBe(1);
    expect(verify.stdout).toContain("payload_section_mismatch:provenance");
  });

  it("passes parity checks when normalized payload mirrors top-level sections", () => {
    const dir = mkDir();
    cpFixture(dir);
    writeNpmShim(dir);
    run(dir, "scripts/helix-decision-bundle.ts", ["--narrow", "inputs/narrow.json", "--heavy", "inputs/heavy-summary.json", "--heavy-recommendation", "inputs/heavy-recommendation.json", "--ab-t02", "inputs/ab-t02.json", "--ab-t035", "inputs/ab-t035.json", "--casimir", "inputs/casimir.json"]);
    const verify = run(dir, "scripts/helix-decision-bundle-verify.ts", ["--bundle", "reports/helix-decision-bundle.json"]);
    expect(verify.status).toBe(0);
    expect(verify.stdout).not.toContain("payload_section_mismatch");
  });

  it("hash is deterministic", () => {
    const payload = { b: 1, a: [2, { z: true, y: null }] };
    expect(computeDecisionHash(payload)).toBe(computeDecisionHash({ a: [2, { y: null, z: true }], b: 1 }));
  });
});
