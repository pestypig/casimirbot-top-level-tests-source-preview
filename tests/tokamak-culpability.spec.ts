import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runTokamakPrecursorDataset } from "../tools/tokamak-precursor-runner";
import type { TTokamakPrecursorDataset } from "../shared/tokamak-precursor";

const encodeRaster = (arr: Float32Array) => ({
  encoding: "base64" as const,
  dtype: "float32" as const,
  endian: "little" as const,
  order: "row-major" as const,
  data_b64: Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64"),
});

const buildDeltaB = (peak: number) => {
  const arr = new Float32Array(25);
  arr[12] = peak;
  return arr;
};

const buildDataset = (): TTokamakPrecursorDataset => {
  const grid = { nx: 5, ny: 5, dx_m: 0.1, dy_m: 0.1 };
  const frame = {
    kind: "rz-plane" as const,
    r_min_m: 1.0,
    r_max_m: 1.5,
    z_min_m: -0.25,
    z_max_m: 0.25,
    axis_order: ["r", "z"] as const,
  };
  const mask = new Float32Array(25).fill(1);
  const pField = new Float32Array(25).fill(1);
  const manifest = {
    schema_version: "tokamak_channel_manifest/1",
    version: "test-manifest",
    channels: [
      { key: "u_deltaB_Jm3", weight: 1.0, normalization: { method: "none" } },
      { key: "u_gradp", weight: 0.5, normalization: { method: "none" } },
    ],
    total_policy: { method: "weighted-sum", normalize_weights: false },
  };
  const buildFrame = (
    id: string,
    timestamp_iso: string,
    deltaPeak: number,
    event_present: boolean,
  ) => ({
    id,
    timestamp_iso,
    snapshot: {
      schema_version: "tokamak_rz_snapshot/1",
      timestamp_iso,
      grid,
      frame,
      separatrix_mask: encodeRaster(mask),
      perturbations: {
        delta_b_T: encodeRaster(buildDeltaB(deltaPeak)),
        p_Pa: encodeRaster(pField),
      },
      manifest,
    },
    label: {
      event_present,
      ...(event_present ? { event_type: "edge_crash" as const } : {}),
    },
  });
  return {
    schema_version: "tokamak_precursor_dataset/1",
    kind: "tokamak_precursor_dataset",
    created_at: "2025-01-01T00:00:00.000Z",
    name: "culpability-synthetic",
    frames: [
      buildFrame("f1", "2025-01-01T00:00:00.000Z", 0.2, false),
      buildFrame("f2", "2025-01-01T00:00:01.000Z", 0.25, false),
      buildFrame("f3", "2025-01-01T00:00:02.000Z", 0.8, true),
      buildFrame("f4", "2025-01-01T00:00:03.000Z", 1.0, true),
    ],
  };
};

describe("tokamak culpability report", () => {
  it("ranks u_deltaB_Jm3 as the dominant channel and is deterministic", () => {
    const dataset = buildDataset();
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "tokamak-culpability-a-"));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "tokamak-culpability-b-"));
    const reportA = runTokamakPrecursorDataset(dataset, {
      score_key: "k_combo_v1",
      artifacts: { dir: dirA, write_culpability: true },
    });
    const reportB = runTokamakPrecursorDataset(dataset, {
      score_key: "k_combo_v1",
      artifacts: { dir: dirB, write_culpability: true },
    });

    const entries = reportA.culpability?.entries ?? [];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]?.channel).toBe("u_deltaB_Jm3");
    const deltaEntry = entries.find((entry) => entry.channel === "u_deltaB_Jm3");
    const gradpEntry = entries.find((entry) => entry.channel === "u_gradp");
    expect(Math.abs(deltaEntry?.normalized_contribution ?? 0)).toBeGreaterThanOrEqual(
      Math.abs(gradpEntry?.normalized_contribution ?? 0),
    );

    expect(reportA.culpability_artifact_hash).toBeDefined();
    expect(reportA.culpability_artifact_hash).toBe(reportB.culpability_artifact_hash);
    expect(reportA.culpability_artifact?.inputs_hash).toBe(
      reportA.culpability_artifact?.information_boundary.inputs_hash,
    );
    if (reportA.culpability_artifact_path) {
      expect(fs.existsSync(reportA.culpability_artifact_path)).toBe(true);
    }
  });
});
