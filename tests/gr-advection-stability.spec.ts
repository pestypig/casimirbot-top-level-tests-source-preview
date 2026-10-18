import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMinkowskiState, gridFromBounds } from "../modules/gr/bssn-state";
import { computeShiftStiffnessMetrics } from "../modules/gr/gr-diagnostics";
import { diff1, diff1Upwind } from "../modules/gr/stencils";
import { runBssnEvolution } from "../server/gr/evolution/solver";
import { buildGrEvolveBrick } from "../server/gr-evolve-brick";
import { stableJsonStringify } from "../server/utils/stable-json";

const buildStepField = (nx: number) => {
  const field = new Float32Array(nx);
  const mid = Math.floor(nx / 2);
  for (let i = mid; i < nx; i += 1) {
    field[i] = 1;
  }
  return field;
};

const advect1D = (
  field: Float32Array,
  grid: ReturnType<typeof gridFromBounds>,
  beta: number,
  dt: number,
  scheme: "centered" | "upwind1",
) => {
  const [nx] = grid.dims;
  const next = new Float32Array(field.length);
  for (let i = 0; i < nx; i += 1) {
    const dudx =
      scheme === "upwind1"
        ? diff1Upwind(field, i, 0, 0, 0, grid, beta, { boundary: "clamp" })
        : diff1(field, i, 0, 0, 0, grid, { boundary: "clamp" });
    next[i] = field[i] - beta * dt * dudx;
  }
  return next;
};

const fieldRange = (field: Float32Array) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < field.length; i += 1) {
    const value = field[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
};

const coordAt = (min: number, spacing: number, index: number) =>
  min + (index + 0.5) * spacing;

const buildWallState = (grid: ReturnType<typeof gridFromBounds>, sigma: number) => {
  if (!grid.bounds) {
    throw new Error("Grid bounds required for wall state");
  }
  const state = createMinkowskiState(grid);
  const [nx, ny, nz] = grid.dims;
  const [dx, dy, dz] = grid.spacing;
  const { min } = grid.bounds;
  const denom = Math.max(1e-6, sigma);
  for (let k = 0; k < nz; k += 1) {
    const z = coordAt(min[2], dz, k);
    for (let j = 0; j < ny; j += 1) {
      const y = coordAt(min[1], dy, j);
      for (let i = 0; i < nx; i += 1) {
        const x = coordAt(min[0], dx, i);
        const idx = i + nx * (j + ny * k);
        const ramp = 0.5 * (1 + Math.tanh(x / denom));
        state.beta_x[idx] = ramp;
        state.beta_y[idx] = 0;
        state.beta_z[idx] = 0;
      }
    }
  }
  return state;
};

type ShiftStiffnessFixture = {
  grid: { dims: [number, number, number]; bounds: { min: [number, number, number]; max: [number, number, number] } };
  sigma_scale: number;
  stencils: { order: 2; boundary: "clamp" };
  expected: { metrics_hash: string };
};

const fixturePath = path.resolve(process.cwd(), "tests", "fixtures", "gr-shift-stiffness.fixture.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as ShiftStiffnessFixture;

const constraintRms = (constraints: { H: Float32Array; Mx: Float32Array; My: Float32Array; Mz: Float32Array }) => {
  const total = Math.max(0, constraints.H.length);
  let sumH2 = 0;
  let sumM2 = 0;
  let count = 0;
  for (let i = 0; i < total; i += 1) {
    const H = constraints.H[i];
    const Mx = constraints.Mx[i];
    const My = constraints.My[i];
    const Mz = constraints.Mz[i];
    if (!Number.isFinite(H) || !Number.isFinite(Mx) || !Number.isFinite(My) || !Number.isFinite(Mz)) {
      continue;
    }
    sumH2 += H * H;
    sumM2 += Mx * Mx + My * My + Mz * Mz;
    count += 1;
  }
  if (count <= 0) {
    return { rmsH: Number.POSITIVE_INFINITY, rmsM: Number.POSITIVE_INFINITY };
  }
  return {
    rmsH: Math.sqrt(sumH2 / count),
    rmsM: Math.sqrt(sumM2 / count),
  };
};

const hasFinite = (field: Float32Array) => {
  for (let i = 0; i < field.length; i += 1) {
    if (!Number.isFinite(field[i])) return false;
  }
  return true;
};

describe("advection stability knobs", () => {
  it("upwind advection stays bounded on a step while centered overshoots", () => {
    const nx = 64;
    const grid = gridFromBounds([nx, 1, 1], { min: [-32, -0.5, -0.5], max: [32, 0.5, 0.5] });
    const field = buildStepField(nx);
    const dt = 0.8;
    const beta = 1;
    const centered = advect1D(field, grid, beta, dt, "centered");
    const upwind = advect1D(field, grid, beta, dt, "upwind1");
    const centeredRange = fieldRange(centered);
    const upwindRange = fieldRange(upwind);

    expect(centeredRange.min).toBeLessThan(-0.05);
    expect(upwindRange.min).toBeGreaterThanOrEqual(-1e-6);
    expect(upwindRange.max).toBeLessThanOrEqual(1 + 1e-6);
    expect(centeredRange.min).toBeLessThan(upwindRange.min);
  });

  it("matches the shift stiffness fixture hash", () => {
    const grid = gridFromBounds(fixture.grid.dims, fixture.grid.bounds);
    const sigma = grid.spacing[0] * fixture.sigma_scale;
    const state = buildWallState(grid, sigma);
    const metrics = computeShiftStiffnessMetrics(state, fixture.stencils);
    const hash = `sha256:${crypto
      .createHash("sha256")
      .update(stableJsonStringify(metrics))
      .digest("hex")}`;
    expect(hash).toBe(fixture.expected.metrics_hash);
  });

  it("keeps sharp-wall evolution finite and reports stiffness", () => {
    const dims: [number, number, number] = [12, 12, 12];
    const bounds = { min: [-1, -1, -1] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
    const grid = gridFromBounds(dims, bounds);
    const sigma = grid.spacing[0] * 0.25;
    const steps = 1;
    const dt = 0.02;
    const stencils = { order: 2, boundary: "clamp" } as const;

    const runCase = (opts: { advectScheme?: "centered" | "upwind1"; koEps?: number; shockMode?: "off" | "diagnostic" | "stabilize" }) =>
      runBssnEvolution({
        initialState: buildWallState(grid, sigma),
        dims,
        bounds,
        dt,
        steps,
        stencils,
        advectScheme: opts.advectScheme,
        koEps: opts.koEps,
        shockMode: opts.shockMode,
        usePipelineMatter: false,
      });

    const baseline = runCase({ advectScheme: "centered", koEps: 0, shockMode: "off" });
    const withKo = runCase({ advectScheme: "centered", koEps: 0.1, shockMode: "diagnostic" });
    const withUpwind = runCase({ advectScheme: "upwind1", koEps: 0, shockMode: "diagnostic" });
    const stabilized = runCase({ advectScheme: "centered", koEps: 0, shockMode: "stabilize" });

    const baselineStats = constraintRms(baseline.constraints);
    const maxH = Math.max(1e-10, baselineStats.rmsH);
    const maxM = Math.max(1e-10, baselineStats.rmsM);

    for (const result of [baseline, withKo, withUpwind, stabilized]) {
      expect(hasFinite(result.state.alpha)).toBe(true);
      expect(hasFinite(result.state.K)).toBe(true);
      const stats = constraintRms(result.constraints);
      expect(stats.rmsH).toBeLessThanOrEqual(maxH * 50);
      expect(stats.rmsM).toBeLessThanOrEqual(maxM * 50);
    }

    const stiffness = computeShiftStiffnessMetrics(buildWallState(grid, sigma), stencils);
    expect(stiffness.shockSeverity === "ok" || stiffness.shockSeverity === "warn" || stiffness.shockSeverity === "severe").toBe(true);
    expect(stiffness.shockIndex).toBeGreaterThan(0);
    if (stiffness.shockSeverity === "severe") {
      expect(stabilized.stabilizersApplied?.includes("ko")).toBe(true);
    }

    const brick = buildGrEvolveBrick({
      dims: [6, 6, 6],
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      dt_s: 5,
      steps: 0,
      includeExtra: false,
    });
    expect(brick.stats.cfl).toBeLessThanOrEqual(0.5 + 1e-6);
  });
});
