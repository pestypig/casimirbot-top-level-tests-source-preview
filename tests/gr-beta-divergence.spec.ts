import { describe, expect, it } from "vitest";
import { buildEvolutionBrick } from "../server/gr/evolution/index.js";
import { createBssnState, gridFromBounds } from "../modules/gr/bssn-state";

const maxAbs = (data: Float32Array) => {
  let out = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = Math.abs(data[i]);
    if (value > out) out = value;
  }
  return out;
};

describe("GR beta divergence", () => {
  it("keeps div_beta near zero for a divergence-free constant shift field", () => {
    const bounds = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };
    const grid = gridFromBounds([4, 4, 4], bounds);
    const state = createBssnState(grid);

    for (let idx = 0; idx < state.alpha.length; idx += 1) {
      state.alpha[idx] = 1;
      state.beta_x[idx] = 0.2;
      state.beta_y[idx] = -0.1;
      state.beta_z[idx] = 0.05;
      state.gamma_xx[idx] = 1;
      state.gamma_yy[idx] = 1;
      state.gamma_zz[idx] = 1;
      state.gamma_xy[idx] = 0;
      state.gamma_xz[idx] = 0;
      state.gamma_yz[idx] = 0;
    }

    const brick = buildEvolutionBrick({ state, includeConstraints: false });
    const divBeta = brick.channels.div_beta?.data ?? new Float32Array();

    expect(divBeta.length).toBe(state.alpha.length);
    expect(maxAbs(divBeta)).toBeLessThan(1e-6);
    expect(brick.stats?.divBetaRms ?? NaN).toBeLessThan(1e-6);
    expect(brick.stats?.divBetaMaxAbs ?? NaN).toBeLessThan(1e-6);
  });

  it("emits the expected constant div_beta for a linear shift field", () => {
    const bounds = { min: [-2, -2, -2] as const, max: [2, 2, 2] as const };
    const grid = gridFromBounds([5, 5, 5], bounds);
    const state = createBssnState(grid);
    const expectedDivBeta = -0.5;
    const [nx, ny, nz] = grid.dims;

    let idx = 0;
    for (let k = 0; k < nz; k += 1) {
      const z = bounds.min[2] + (k + 0.5) * grid.spacing[2];
      for (let j = 0; j < ny; j += 1) {
        const y = bounds.min[1] + (j + 0.5) * grid.spacing[1];
        for (let i = 0; i < nx; i += 1) {
          const x = bounds.min[0] + (i + 0.5) * grid.spacing[0];
          state.alpha[idx] = 1;
          state.beta_x[idx] = 2 * x;
          state.beta_y[idx] = -3 * y;
          state.beta_z[idx] = 0.5 * z;
          state.gamma_xx[idx] = 1;
          state.gamma_yy[idx] = 1;
          state.gamma_zz[idx] = 1;
          state.gamma_xy[idx] = 0;
          state.gamma_xz[idx] = 0;
          state.gamma_yz[idx] = 0;
          idx += 1;
        }
      }
    }

    const brick = buildEvolutionBrick({ state, includeConstraints: false });
    const divBeta = brick.channels.div_beta?.data ?? new Float32Array();

    expect(divBeta.length).toBe(state.alpha.length);
    for (let k = 1; k < nz - 1; k += 1) {
      for (let j = 1; j < ny - 1; j += 1) {
        for (let i = 1; i < nx - 1; i += 1) {
          const interiorIndex = i + nx * (j + ny * k);
          expect(divBeta[interiorIndex]).toBeCloseTo(expectedDivBeta, 5);
        }
      }
    }
    expect(Number.isFinite(brick.stats?.divBetaMaxAbs)).toBe(true);
    expect(brick.stats?.divBetaRms ?? 0).toBeGreaterThan(0);
    expect(Number.isFinite(brick.stats?.divBetaRms)).toBe(true);
  });
});
