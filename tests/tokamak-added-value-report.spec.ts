import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTokamakPrecursorDataset } from "../tools/tokamak-precursor-runner";
import { runTokamakAddedValueReport } from "../tools/tokamak-added-value-report";
import { resetDbClient } from "../server/db/client";
import { findEnvelopeByOriginalHash, resetEnvelopeStore } from "../server/services/essence/store";
import { sha256Hex } from "../server/utils/information-boundary";
import { stableJsonStringify } from "../server/utils/stable-json";

const DATASET_PATH = path.resolve(
  process.cwd(),
  "datasets",
  "tokamak-rz-precursor.fixture.json",
);
const describeWithDataset = existsSync(DATASET_PATH) ? describe : describe.skip;

let tmpDir = "";

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "tokamak-added-value-"));
  const dataDir = path.join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = "pg-mem://tokamak-added-value";
  await resetDbClient();
  await resetEnvelopeStore();
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
  delete process.env.DATA_DIR;
  delete process.env.DATABASE_URL;
});

describeWithDataset("tokamak added value report", () => {
  it("is deterministic and persists an essence envelope", async () => {
    const dataset = await loadTokamakPrecursorDataset(DATASET_PATH);
    const generatedAt = "2025-01-01T00:00:00.000Z";
    const opts = {
      dataset_path: DATASET_PATH,
      generated_at_iso: generatedAt,
      persona_id: "persona:tokamak-added-value",
      artifacts: { write: false },
    };
    const reportA = await runTokamakAddedValueReport(dataset, opts);
    const reportB = await runTokamakAddedValueReport(dataset, opts);

    expect(reportA.report_hash).toBe(reportB.report_hash);
    expect(reportA.physics_only.features.length).toBeGreaterThan(0);
    expect(reportA.combined.features.length).toBeGreaterThan(
      reportA.physics_only.features.length,
    );
    expect(reportA.combined.features).not.toEqual(reportA.physics_only.features);
    expect(reportA.physics_only.auc).not.toBeNull();
    expect(reportA.combined.auc).not.toBeNull();

    const digest = sha256Hex(
      Buffer.from(stableJsonStringify(reportA), "utf8"),
    );
    const env = await findEnvelopeByOriginalHash(
      "sha256",
      digest,
      "persona:tokamak-added-value",
    );
    expect(env).toBeTruthy();
    const physics = env?.features?.physics as { kind?: string; summary?: { report_hash?: string } } | undefined;
    expect(physics?.kind).toBe("tokamak-added-value");
    expect(physics?.summary?.report_hash).toBe(reportA.report_hash);
  });
});
