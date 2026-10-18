import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CurvatureMetricsConfig } from "../shared/essence-physics";
import { CurvatureDiagnosticsRecord } from "../shared/curvature-diagnostics";
import { runCurvatureUnitWithProvenance } from "../server/skills/physics.curvature";
import {
  __resetCurvatureDiagnosticsStore,
  recordCurvatureDiagnostics,
} from "../server/services/physics/curvature-diagnostics-store";
import { computeCurvatureMetricsAndRidges } from "../server/services/physics/curvature-metrics";
import { resetDbClient } from "../server/db/client";
import { resetEnvelopeStore } from "../server/services/essence/store";
import { sha256Hex } from "../server/utils/information-boundary";
import { stableJsonStringify } from "../server/utils/stable-json";

type Grid = { nx: number; ny: number; dx_m: number; dy_m: number; thickness_m: number };

const buildRidgeField = (grid: Grid) => {
  const { nx, ny } = grid;
  const gradMag = new Float32Array(nx * ny);
  const laplacian = new Float32Array(nx * ny);
  const residual = new Float32Array(nx * ny);
  const midX = (nx - 1) / 2;
  const midY = (ny - 1) / 2;
  const sigmaLine = 0.9;
  const sigmaSpot = 6;
  for (let y = 0; y < ny; y++) {
    const dy = y - midY;
    for (let x = 0; x < nx; x++) {
      const dx = x - midX;
      const ridge = Math.exp(-(dy * dy) / (2 * sigmaLine * sigmaLine));
      const spot = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaSpot * sigmaSpot));
      const g = ridge * 2 + 0.35 * spot;
      const idx = y * nx + x;
      gradMag[idx] = g;
      laplacian[idx] = g * 2;
      residual[idx] = g * 0.1;
    }
  }
  return { gradMag, laplacian, residual };
};

const translateArray = (
  src: Float32Array,
  nx: number,
  ny: number,
  shiftX: number,
  shiftY: number,
) => {
  const out = new Float32Array(src.length);
  for (let y = 0; y < ny; y++) {
    const yy = (y + shiftY + ny) % ny;
    for (let x = 0; x < nx; x++) {
      const xx = (x + shiftX + nx) % nx;
      out[yy * nx + xx] = src[y * nx + x];
    }
  }
  return out;
};

let tmpDir = "";

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "curvature-cds-tracking-"));
  const dataDir = path.join(tmpDir, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.DATABASE_URL = "pg-mem://curvature-cds-tracking";
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

describe("CDS ridge tracking config", () => {
  it("changes record hashes and ridge tracking summaries deterministically", async () => {
    const input = {
      grid: { nx: 24, ny: 24, dx_m: 0.05, dy_m: 0.05, thickness_m: 1 },
      sources: [
        { x_m: -0.2, y_m: 0, sigma_m: 0.08, peak_u_Jm3: 800 },
        { x_m: 0.2, y_m: 0, sigma_m: 0.08, peak_u_Jm3: 800 },
      ],
      metrics: {
        ridge_high_percentile: 0.7,
        ridge_low_ratio: 0.35,
        ridge_min_points: 3,
      },
    };
    const run = await runCurvatureUnitWithProvenance(input, {
      personaId: "persona:cds-tracking",
    });
    const createdAt = "2025-01-01T00:00:00.000Z";

    const trackingA = { drive_hz: 0.6, max_link_distance_m: 2, track_window: 1 };
    const trackingB = { drive_hz: 0.6, max_link_distance_m: 2, track_window: 4 };

    const trackingHashA = `sha256:${sha256Hex(
      Buffer.from(stableJsonStringify(trackingA), "utf8"),
    )}`;
    const trackingHashB = `sha256:${sha256Hex(
      Buffer.from(stableJsonStringify(trackingB), "utf8"),
    )}`;

    const recordA = CurvatureDiagnosticsRecord.parse({
      schema_version: "curvature_diagnostics/1",
      created_at: createdAt,
      essence_id: run.envelope_id,
      envelope: run.envelope,
      information_boundary: run.information_boundary,
      hashes: { ...run.hashes, ridge_tracking_hash: trackingHashA },
      ridge_tracking: trackingA,
      result: run.result,
    });
    const recordB = CurvatureDiagnosticsRecord.parse({
      schema_version: "curvature_diagnostics/1",
      created_at: createdAt,
      essence_id: run.envelope_id,
      envelope: run.envelope,
      information_boundary: run.information_boundary,
      hashes: { ...run.hashes, ridge_tracking_hash: trackingHashB },
      ridge_tracking: trackingB,
      result: run.result,
    });

    const hashA = sha256Hex(Buffer.from(stableJsonStringify(recordA), "utf8"));
    const hashB = sha256Hex(Buffer.from(stableJsonStringify(recordB), "utf8"));
    expect(hashA).not.toBe(hashB);

    __resetCurvatureDiagnosticsStore();
    const grid: Grid = { nx: 48, ny: 48, dx_m: 1, dy_m: 1, thickness_m: 1 };
    const frame = { kind: "cartesian" } as const;
    const boundary = "periodic" as const;
    const config = CurvatureMetricsConfig.parse({
      ridge_high_percentile: 0.7,
      ridge_low_ratio: 0.35,
      ridge_min_points: 3,
    });
    const base = buildRidgeField(grid);
    const baseResult = computeCurvatureMetricsAndRidges({
      ...base,
      grid,
      frame,
      boundary,
      config,
    });
    const shifted = {
      gradMag: translateArray(base.gradMag, grid.nx, grid.ny, 3, 2),
      laplacian: translateArray(base.laplacian, grid.nx, grid.ny, 3, 2),
      residual: translateArray(base.residual, grid.nx, grid.ny, 3, 2),
    };
    const shiftedResult = computeCurvatureMetricsAndRidges({
      ...shifted,
      grid,
      frame,
      boundary,
      config,
    });

    recordCurvatureDiagnostics({
      result_hash: "sha256:ridges-a0",
      k_metrics: baseResult.k_metrics,
      ridge_summary: baseResult.ridges.summary,
      ridges: baseResult.ridges.spines,
      max_link_distance_m: 8,
      track_window: 1,
      ts: "2025-01-01T00:00:00.000Z",
      tracking_key: "track",
    });
    const windowOne = recordCurvatureDiagnostics({
      result_hash: "sha256:ridges-a1",
      k_metrics: shiftedResult.k_metrics,
      ridge_summary: shiftedResult.ridges.summary,
      ridges: shiftedResult.ridges.spines,
      max_link_distance_m: 8,
      track_window: 1,
      ts: "2025-01-01T00:00:01.000Z",
      tracking_key: "track",
    });

    __resetCurvatureDiagnosticsStore();
    recordCurvatureDiagnostics({
      result_hash: "sha256:ridges-b0",
      k_metrics: baseResult.k_metrics,
      ridge_summary: baseResult.ridges.summary,
      ridges: baseResult.ridges.spines,
      max_link_distance_m: 8,
      track_window: 4,
      ts: "2025-01-01T00:00:00.000Z",
      tracking_key: "track",
    });
    const windowFour = recordCurvatureDiagnostics({
      result_hash: "sha256:ridges-b1",
      k_metrics: shiftedResult.k_metrics,
      ridge_summary: shiftedResult.ridges.summary,
      ridges: shiftedResult.ridges.spines,
      max_link_distance_m: 8,
      track_window: 4,
      ts: "2025-01-01T00:00:01.000Z",
      tracking_key: "track",
    });

    expect(windowOne.ridge_tracking?.fragmentation_rate).not.toBe(
      windowFour.ridge_tracking?.fragmentation_rate,
    );
  });
});
