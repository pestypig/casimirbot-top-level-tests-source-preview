import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runStarSimMesaRuntimeAdapter } from "../server/modules/starsim/external/mesa-runtime-adapter";
import { sha256Buffer } from "../server/modules/starsim/external/mesa-hash-manifest";

const basePolicy = {
  runtimeKind: "local" as const,
  mesaCommand: "import-declared-mesa-output",
  outputDirectory: "reports",
  allowFixtureFallback: false as const,
  requireInlistHash: true,
  requireProfileHash: true,
  requireHistoryHash: true,
  requireRunLogHash: true,
  integrationTestMode: true,
  importOnly: true,
  inputs: {
    inlistProjectPath: "ops/mesa/solar-reference/inlist_project",
    inlistSolarPath: "ops/mesa/solar-reference/inlist_solar_reference",
  },
  outputs: {
    profilePath: "ops/mesa/solar-reference/profile_solar_reference.data",
    historyPath: "ops/mesa/solar-reference/history_solar_reference.data",
  },
};

describe("MESA runtime adapter", () => {
  it("disabled runtime returns unavailable by throwing", () => {
    expect(() =>
      runStarSimMesaRuntimeAdapter(
        { ...basePolicy, runtimeKind: "disabled" as const },
        join(tmpdir(), "mesa-disabled.json"),
      ),
    ).toThrow(/disabled/);
  });

  it("fixture_only is rejected by the MESA repro tool", () => {
    expect(() =>
      runStarSimMesaRuntimeAdapter(
        { ...basePolicy, runtimeKind: "fixture_only" as const },
        join(tmpdir(), "mesa-fixture.json"),
      ),
    ).toThrow(/fixture_only/);
  });

  it("local runtime fails clearly when declared output is unavailable", () => {
    expect(() =>
      runStarSimMesaRuntimeAdapter(
        {
          ...basePolicy,
          outputs: { ...basePolicy.outputs, profilePath: "missing/profile.data" },
        },
        join(tmpdir(), "mesa-missing.json"),
      ),
    ).toThrow(/profile output/);
  });

  it("docker runtime fails clearly when declared Docker output is unavailable", () => {
    expect(() =>
      runStarSimMesaRuntimeAdapter(
        {
          ...basePolicy,
          runtimeKind: "docker" as const,
          outputs: { profilePath: "missing/profile.data", historyPath: "missing/history.data" },
        },
        join(tmpdir(), "mesa-docker-missing.json"),
      ),
    ).toThrow(/profile output/);
  });

  it("imports declared outputs without fixture fallback", () => {
    const out = join(mkdtempSync(join(tmpdir(), "mesa-runtime-")), "report.json");
    const result = runStarSimMesaRuntimeAdapter(basePolicy, out);
    expect(result.status).toBe("imported");
    expect(result.hashes.entries.profile.hash).toBeTruthy();
    expect(result.hashes.entries.runLog.hash).toBeTruthy();
  });

  it("executes a structured command before granting reproduced status", () => {
    const root = mkdtempSync(join(tmpdir(), "mesa-runtime-exec-"));
    const inlist = join(root, "inlist_project");
    const profile = join(root, "profile.data");
    const history = join(root, "history.data");
    const script = join(root, "solver-fixture.mjs");
    writeFileSync(inlist, "&star_job\n/\n");
    writeFileSync(
      script,
      [
        'import { writeFileSync } from "node:fs";',
        'writeFileSync(process.argv[2], "profile-from-executed-command");',
        'writeFileSync(process.argv[3], "history-from-executed-command");',
        'process.stdout.write("solver executed");',
      ].join("\n"),
    );

    const result = runStarSimMesaRuntimeAdapter(
      {
        ...basePolicy,
        importOnly: false,
        mesaExecutable: process.execPath,
        mesaArgs: [script, profile, history],
        mesaCommand: undefined,
        outputDirectory: root,
        inputs: { inlistProjectPath: inlist },
        outputs: { profilePath: profile, historyPath: history },
      },
      join(root, "report.json"),
    );

    expect(result.status).toBe("reproduced");
    expect(readFileSync(profile, "utf8")).toBe("profile-from-executed-command");
    expect(readFileSync(result.runLogPath, "utf8")).toContain("solver executed");
  });

  it("records a failed command and never grants reproduced status", () => {
    const root = mkdtempSync(join(tmpdir(), "mesa-runtime-fail-"));
    const inlist = join(root, "inlist_project");
    const script = join(root, "failed-solver.mjs");
    writeFileSync(inlist, "&star_job\n/\n");
    writeFileSync(script, 'process.stderr.write("solver failed"); process.exit(7);');

    expect(() =>
      runStarSimMesaRuntimeAdapter(
        {
          ...basePolicy,
          importOnly: false,
          mesaExecutable: process.execPath,
          mesaArgs: [script],
          mesaCommand: undefined,
          outputDirectory: root,
          inputs: { inlistProjectPath: inlist },
          outputs: {
            profilePath: join(root, "profile.data"),
            historyPath: join(root, "history.data"),
          },
        },
        join(root, "report.json"),
      ),
    ).toThrow(/exit code 7/);
    const log = join(root, "starsim-solar-mesa-run.log");
    expect(existsSync(log)).toBe(true);
    expect(readFileSync(log, "utf8")).toContain("solver failed");
    expect(readFileSync(log, "utf8")).toContain("exitCode=7");
  });

  it("rejects unchanged pre-existing outputs after a successful no-op command", () => {
    const root = mkdtempSync(join(tmpdir(), "mesa-runtime-stale-"));
    const inlist = join(root, "inlist_project");
    const profile = join(root, "profile.data");
    const history = join(root, "history.data");
    const script = join(root, "noop-solver.mjs");
    writeFileSync(inlist, "&star_job\n/\n");
    writeFileSync(profile, "stale-profile");
    writeFileSync(history, "stale-history");
    writeFileSync(script, "process.exit(0);");

    expect(() =>
      runStarSimMesaRuntimeAdapter(
        {
          ...basePolicy,
          importOnly: false,
          mesaExecutable: process.execPath,
          mesaArgs: [script],
          mesaCommand: undefined,
          outputDirectory: root,
          inputs: { inlistProjectPath: inlist },
          outputs: { profilePath: profile, historyPath: history },
        },
        join(root, "report.json"),
      ),
    ).toThrow(/not created or refreshed/);
  });

  it("refuses a display-only command for a claimed real run", () => {
    expect(() =>
      runStarSimMesaRuntimeAdapter(
        { ...basePolicy, importOnly: false },
        join(tmpdir(), "mesa-display-only.json"),
      ),
    ).toThrow(/mesaExecutable/);
  });

  it("hash helper is deterministic", () => {
    expect(sha256Buffer("abc")).toBe(sha256Buffer("abc"));
    expect(sha256Buffer("abc")).not.toBe(sha256Buffer("abcd"));
  });
});
