import { describe, expect, it } from "vitest";
import { createMinkowskiState, gridFromBounds, type GridSpec } from "../modules/gr/bssn-state";
import { computeBssnConstraints, type ConstraintFields } from "../modules/gr/bssn-evolve";

type ConstraintStats = {
  rmsH: number;
  rmsM: number;
  maxAbsH: number;
  maxAbsM: number;
  count: number;
};

const index3D = (i: number, j: number, k: number, nx: number, ny: number) =>
  i + nx * (j + ny * k);

const coordAt = (min: number, spacing: number, index: number) =>
  min + (index + 0.5) * spacing;

const buildIsotropicSchwarzschildState = (
  grid: GridSpec,
  mass: number,
  opts: { rSoft?: number; setAlpha?: boolean } = {},
) => {
  if (!grid.bounds) {
    throw new Error("Grid bounds required for analytic Schwarzschild state");
  }
  const state = createMinkowskiState(grid);
  const [nx, ny, nz] = grid.dims;
  const [dx, dy, dz] = grid.spacing;
  const rSoft = Math.max(opts.rSoft ?? 0, 1e-6);
  const setAlpha = opts.setAlpha ?? true;
  const { min } = grid.bounds;
  for (let k = 0; k < nz; k += 1) {
    const z = coordAt(min[2], dz, k);
    for (let j = 0; j < ny; j += 1) {
      const y = coordAt(min[1], dy, j);
      for (let i = 0; i < nx; i += 1) {
        const x = coordAt(min[0], dx, i);
        const idx = index3D(i, j, k, nx, ny);
        const r = Math.hypot(x, y, z);
        const rSafe = Math.max(r, rSoft);
        const psi = 1 + mass / (2 * rSafe);
        state.phi[idx] = Math.log(psi);
        if (setAlpha) {
          const ratio = mass / (2 * rSafe);
          const denom = 1 + ratio;
          const alpha = denom !== 0 ? (1 - ratio) / denom : 0;
          state.alpha[idx] = Math.max(alpha, 0);
        }
      }
    }
  }
  return state;
};

const computeConstraintStats = (
  grid: GridSpec,
  constraints: ConstraintFields,
  opts: { pad?: number; rMin?: number; rMax?: number } = {},
): ConstraintStats => {
  if (!grid.bounds) {
    throw new Error("Grid bounds required for constraint stats");
  }
  const pad = Math.max(0, Math.floor(opts.pad ?? 1));
  const rMin = Math.max(0, opts.rMin ?? 0);
  const rMax = opts.rMax ?? Number.POSITIVE_INFINITY;
  const [nx, ny, nz] = grid.dims;
  const [dx, dy, dz] = grid.spacing;
  const { min } = grid.bounds;

  let sumH2 = 0;
  let sumM2 = 0;
  let maxAbsH = 0;
  let maxAbsM = 0;
  let count = 0;
  for (let k = pad; k < nz - pad; k += 1) {
    const z = coordAt(min[2], dz, k);
    for (let j = pad; j < ny - pad; j += 1) {
      const y = coordAt(min[1], dy, j);
      for (let i = pad; i < nx - pad; i += 1) {
        const x = coordAt(min[0], dx, i);
        const r = Math.hypot(x, y, z);
        if (r < rMin || r > rMax) continue;
        const idx = index3D(i, j, k, nx, ny);
        const H = constraints.H[idx];
        const Mx = constraints.Mx[idx];
        const My = constraints.My[idx];
        const Mz = constraints.Mz[idx];
        const M = Math.hypot(Mx, My, Mz);
        const absH = Math.abs(H);
        const absM = Math.abs(M);
        if (absH > maxAbsH) maxAbsH = absH;
        if (absM > maxAbsM) maxAbsM = absM;
        sumH2 += H * H;
        sumM2 += M * M;
        count += 1;
      }
    }
  }
  const denom = Math.max(1, count);
  return {
    rmsH: Math.sqrt(sumH2 / denom),
    rmsM: Math.sqrt(sumM2 / denom),
    maxAbsH,
    maxAbsM,
    count,
  };
};

const computeWeakFieldAlphaError = (
  grid: GridSpec,
  alpha: Float32Array,
  mass: number,
  opts: { pad?: number; rMin?: number } = {},
) => {
  if (!grid.bounds) {
    throw new Error("Grid bounds required for alpha error");
  }
  const pad = Math.max(0, Math.floor(opts.pad ?? 1));
  const rMin = Math.max(0, opts.rMin ?? 0);
  const [nx, ny, nz] = grid.dims;
  const [dx, dy, dz] = grid.spacing;
  const { min } = grid.bounds;

  let maxRel = 0;
  let count = 0;
  for (let k = pad; k < nz - pad; k += 1) {
    const z = coordAt(min[2], dz, k);
    for (let j = pad; j < ny - pad; j += 1) {
      const y = coordAt(min[1], dy, j);
      for (let i = pad; i < nx - pad; i += 1) {
        const x = coordAt(min[0], dx, i);
        const r = Math.hypot(x, y, z);
        if (r < rMin) continue;
        const idx = index3D(i, j, k, nx, ny);
        const alphaIso = alpha[idx];
        const phi = -mass / Math.max(r, 1e-6);
        const alphaWeak = Math.sqrt(Math.max(0, 1 + 2 * phi));
        const denom = Math.max(1e-6, Math.abs(alphaWeak));
        const rel = Math.abs(alphaIso - alphaWeak) / denom;
        if (rel > maxRel) maxRel = rel;
        count += 1;
      }
    }
  }
  return { maxRel, count };
};

describe("BSSN constraints (analytic limits)", () => {
  it("Minkowski keeps alpha=1, beta=0, constraints near zero", () => {
    const grid = gridFromBounds([8, 8, 8], { min: [-1, -1, -1], max: [1, 1, 1] });
    const state = createMinkowskiState(grid);
    let maxAlphaErr = 0;
    let maxBeta = 0;
    for (let i = 0; i < state.alpha.length; i += 1) {
      const err = Math.abs(state.alpha[i] - 1);
      if (err > maxAlphaErr) maxAlphaErr = err;
      const beta = Math.max(
        Math.abs(state.beta_x[i]),
        Math.abs(state.beta_y[i]),
        Math.abs(state.beta_z[i]),
      );
      if (beta > maxBeta) maxBeta = beta;
    }

    const constraints = computeBssnConstraints(state);
    const stats = computeConstraintStats(grid, constraints, { pad: 1 });
    expect(maxAlphaErr).toBeLessThan(1e-12);
    expect(maxBeta).toBeLessThan(1e-12);
    expect(stats.maxAbsH).toBeLessThan(1e-12);
    expect(stats.maxAbsM).toBeLessThan(1e-12);
  });

  it("weak-field alpha matches Newtonian potential limit", () => {
    const mass = 0.1;
    const grid = gridFromBounds([24, 24, 24], { min: [-20, -20, -20], max: [20, 20, 20] });
    const state = buildIsotropicSchwarzschildState(grid, mass, { rSoft: 1 });
    const error = computeWeakFieldAlphaError(grid, state.alpha, mass, { pad: 2, rMin: 5 });
    expect(error.count).toBeGreaterThan(0);
    expect(error.maxRel).toBeLessThan(1e-3);
  });

  it("isotropic Schwarzschild constraints stay small away from the singularity", () => {
    const mass = 1;
    const grid = gridFromBounds([32, 32, 32], { min: [-20, -20, -20], max: [20, 20, 20] });
    const state = buildIsotropicSchwarzschildState(grid, mass, { rSoft: 1 });
    const constraints = computeBssnConstraints(state, {
      stencils: { order: 2, boundary: "clamp" },
    });
    const stats = computeConstraintStats(grid, constraints, { pad: 2, rMin: 3 });
    expect(stats.count).toBeGreaterThan(0);
    expect(stats.rmsH).toBeLessThan(1e-2);
    expect(stats.rmsM).toBeLessThan(1e-3);
  });
});

describe("BSSN constraint convergence", () => {
  it("Hamiltonian constraint converges when dx halves (order 2)", () => {
    const mass = 1;
    const bounds = { min: [-20, -20, -20] as [number, number, number], max: [20, 20, 20] as [number, number, number] };
    const coarseGrid = gridFromBounds([24, 24, 24], bounds);
    const fineGrid = gridFromBounds([48, 48, 48], bounds);
    const coarseState = buildIsotropicSchwarzschildState(coarseGrid, mass, { rSoft: 1 });
    const fineState = buildIsotropicSchwarzschildState(fineGrid, mass, { rSoft: 1 });
    const coarseConstraints = computeBssnConstraints(coarseState, {
      stencils: { order: 2, boundary: "clamp" },
    });
    const fineConstraints = computeBssnConstraints(fineState, {
      stencils: { order: 2, boundary: "clamp" },
    });
    const coarseStats = computeConstraintStats(coarseGrid, coarseConstraints, { pad: 2, rMin: 3 });
    const fineStats = computeConstraintStats(fineGrid, fineConstraints, { pad: 2, rMin: 3 });
    expect(coarseStats.count).toBeGreaterThan(0);
    expect(fineStats.count).toBeGreaterThan(0);
    expect(fineStats.rmsH).toBeLessThan(coarseStats.rmsH);
    const ratio = coarseStats.rmsH / Math.max(fineStats.rmsH, 1e-12);
    expect(ratio).toBeGreaterThan(2.5);
  });
});
