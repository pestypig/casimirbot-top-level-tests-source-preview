import { afterAll, beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { runSolarSurfaceCoherence } from "../server/services/essence/solar-surface-coherence";

let tmpDir = "";

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "solar-surface-coherence-"));
  const dataDir = path.join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = "pg-mem://solar-surface-coherence";
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_URL;
});

describe("solar surface coherence", () => {
  const fixturePath = path.resolve(
    process.cwd(),
    "datasets",
    "solar",
    "solar-surface.fixture.json",
  );
  const itWithFixture = existsSync(fixturePath) ? it : it.skip;

  itWithFixture("generates deterministic phase-lock and event timeline reports", async () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const entry = fixture.entries?.[0];
    const input = entry?.input ?? fixture;
    const expectedHashes = entry?.expected?.hashes ?? {};

    const first = await runSolarSurfaceCoherence(input);
    const second = await runSolarSurfaceCoherence(input);

    expect(first.report.inputs_hash).toBe(second.report.inputs_hash);
    expect(first.report.features_hash).toBe(second.report.features_hash);
    expect(first.report.u_field_inputs_hash).toBe(second.report.u_field_inputs_hash);
    if (expectedHashes.inputs_hash) {
      expect(first.report.inputs_hash).toBe(expectedHashes.inputs_hash);
    }
    if (expectedHashes.features_hash) {
      expect(first.report.features_hash).toBe(expectedHashes.features_hash);
    }
    expect(first.report.frames).toHaveLength(2);
    expect(first.report.frames[0]?.t_s).toBeCloseTo(0, 6);
    expect(first.report.frames[1]?.t_s).toBeCloseTo(60, 6);
    expect(first.report.phase_lock?.scan.length).toBe(8);
    expect(first.report.event_timeline?.events.length).toBe(1);
    expect(first.frames).toHaveLength(2);
  });
});
