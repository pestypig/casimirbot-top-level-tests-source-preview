import { describe, expect, it } from "vitest";
import { buildEvolutionBrick } from "../server/gr/evolution/index.js";
import { createBssnState, gridFromBounds } from "../modules/gr/bssn-state";

describe("Time dilation brick derived fields", () => {
  it("computes g_tt, clockRate_static, and theta from BSSN state", () => {
    const bounds = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };
    const grid = gridFromBounds([2, 2, 2], bounds);
    const state = createBssnState(grid);

    // Fill state with deterministic, finite values.
    for (let i = 0; i < state.alpha.length; i += 1) {
      const alpha = 1.1 + 0.05 * (i % 3);
      const phi = 0.2;
      const exp4Phi = Math.exp(4 * phi);
      const gamma_xx = 1.2;
      const gamma_yy = 0.9;
      const gamma_zz = 1.1;

      state.alpha[i] = alpha;
      state.phi[i] = phi;
      state.gamma_xx[i] = gamma_xx;
      state.gamma_yy[i] = gamma_yy;
      state.gamma_zz[i] = gamma_zz;
      state.gamma_xy[i] = 0;
      state.gamma_xz[i] = 0;
      state.gamma_yz[i] = 0;

      const bx = 0.12;
      const by = -0.05;
      const bz = 0.08;
      state.beta_x[i] = bx;
      state.beta_y[i] = by;
      state.beta_z[i] = bz;

      state.K[i] = 0.3 - 0.02 * i;

      // Store expected g_tt on the state for later comparison.
      const gxx = exp4Phi * gamma_xx;
      const gyy = exp4Phi * gamma_yy;
      const gzz = exp4Phi * gamma_zz;
      const shiftTerm = gxx * bx * bx + gyy * by * by + gzz * bz * bz;
      (state as any).__expected_gtt = (state as any).__expected_gtt ?? [];
      (state as any).__expected_gtt.push(-alpha * alpha + shiftTerm);
    }

    const brick = buildEvolutionBrick({ state, includeConstraints: false });
    const gtt = brick.channels.g_tt?.data ?? new Float32Array();
    const clockRate = brick.channels.clockRate_static?.data ?? new Float32Array();
    const theta = brick.channels.theta?.data ?? new Float32Array();

    for (let i = 0; i < gtt.length; i += 1) {
      const expected = (state as any).__expected_gtt[i];
      expect(gtt[i]).toBeCloseTo(expected, 6);
      const expectedClock = Math.sqrt(Math.max(0, -expected));
      expect(clockRate[i]).toBeCloseTo(expectedClock, 6);
      expect(theta[i]).toBeCloseTo(-state.K[i], 6);
    }
  });
});
