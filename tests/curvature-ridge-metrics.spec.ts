import { describe, expect, it } from "vitest";
import { CurvatureMetricsConfig } from "../shared/essence-physics";
import {
  computeCurvatureMetricsAndRidges,
  computePhaseLockScore,
  trackRidgeSequence,
} from "../server/services/physics/curvature-metrics";
import {
  __resetCurvatureDiagnosticsStore,
  recordCurvatureDiagnostics,
} from "../server/services/physics/curvature-diagnostics-store";

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

const rotate90 = (src: Float32Array, n: number) => {
  const out = new Float32Array(src.length);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const nx = n - 1 - y;
      const ny = x;
      out[ny * n + nx] = src[y * n + x];
    }
  }
  return out;
};

const expectCloseRelative = (a: number, b: number, tol = 0.05) => {
  const denom = Math.max(1e-9, Math.max(Math.abs(a), Math.abs(b)));
  expect(Math.abs(a - b) / denom).toBeLessThan(tol);
};

describe("curvature ridge metrics", () => {
  it("keeps K-metrics stable under translation and rotation", () => {
    const grid: Grid = { nx: 64, ny: 64, dx_m: 1, dy_m: 1, thickness_m: 1 };
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
      gradMag: translateArray(base.gradMag, grid.nx, grid.ny, 5, -3),
      laplacian: translateArray(base.laplacian, grid.nx, grid.ny, 5, -3),
      residual: translateArray(base.residual, grid.nx, grid.ny, 5, -3),
    };
    const shiftedResult = computeCurvatureMetricsAndRidges({
      ...shifted,
      grid,
      frame,
      boundary,
      config,
    });

    const rotated = {
      gradMag: rotate90(base.gradMag, grid.nx),
      laplacian: rotate90(base.laplacian, grid.nx),
      residual: rotate90(base.residual, grid.nx),
    };
    const rotatedResult = computeCurvatureMetricsAndRidges({
      ...rotated,
      grid,
      frame,
      boundary,
      config,
    });

    expect(baseResult.ridges.summary.ridge_count).toBeGreaterThan(0);
    expect(shiftedResult.ridges.summary.ridge_count).toBe(baseResult.ridges.summary.ridge_count);
    expect(rotatedResult.ridges.summary.ridge_count).toBe(baseResult.ridges.summary.ridge_count);

    expectCloseRelative(baseResult.k_metrics.k0, shiftedResult.k_metrics.k0);
    expectCloseRelative(baseResult.k_metrics.k1, shiftedResult.k_metrics.k1);
    expectCloseRelative(baseResult.k_metrics.k2, shiftedResult.k_metrics.k2);
    expectCloseRelative(baseResult.k_metrics.k0, rotatedResult.k_metrics.k0);
    expectCloseRelative(baseResult.k_metrics.k1, rotatedResult.k_metrics.k1);
    expectCloseRelative(baseResult.k_metrics.k2, rotatedResult.k_metrics.k2);
  });

  it("tracks ridge IDs across translated frames", () => {
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

    const tracked = trackRidgeSequence(
      [
        { t_s: 0, ridges: baseResult.ridges.spines },
        { t_s: 1, ridges: shiftedResult.ridges.spines },
      ],
      { max_link_distance_m: 8 },
    );

    expect(tracked.tracks.length).toBeGreaterThan(0);
    expect(tracked.tracks[0].lifetime_frames).toBe(2);
    const firstId = tracked.frames[0].ridges[0]?.id;
    const secondId = tracked.frames[1].ridges[0]?.id;
    expect(firstId).toBeTruthy();
    expect(firstId).toBe(secondId);
    expect(tracked.frames[1].fragmentation_rate).toBeLessThan(0.2);
  });

  it("records ridge tracking metadata in diagnostics events", () => {
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
      result_hash: "sha256:ridges-0",
      k_metrics: baseResult.k_metrics,
      ridge_summary: baseResult.ridges.summary,
      ridges: baseResult.ridges.spines,
      max_link_distance_m: 8,
      ts: "2025-01-01T00:00:00.000Z",
      tracking_key: "test",
    });
    const second = recordCurvatureDiagnostics({
      result_hash: "sha256:ridges-1",
      k_metrics: shiftedResult.k_metrics,
      ridge_summary: shiftedResult.ridges.summary,
      ridges: shiftedResult.ridges.spines,
      max_link_distance_m: 8,
      ts: "2025-01-01T00:00:01.000Z",
      tracking_key: "test",
    });

    expect(second.ridge_tracking).toBeTruthy();
    expect(second.ridge_tracking?.ridge_ids.length).toBeGreaterThan(0);
    expect(
      second.ridge_tracking?.tracks.some((track) => track.lifetime_frames >= 2),
    ).toBe(true);
    expect(second.ridge_tracking?.fragmentation_rate).toBeLessThan(0.5);
  });

  it("scores phase lock near the drive frequency", () => {
    const driveHz = 0.5;
    const samples = Array.from({ length: 60 }, (_, idx) => {
      const t = idx * 0.2;
      const phase = 2 * Math.PI * driveHz * t;
      const k1 = Math.exp(4 * Math.cos(phase));
      return { t_s: t, k1 };
    });
    const onScore = computePhaseLockScore(samples, driveHz);
    const offScore = computePhaseLockScore(samples, driveHz * 1.7);
    expect(onScore).toBeGreaterThan(0.8);
    expect(offScore).toBeLessThan(0.5);
  });
});
