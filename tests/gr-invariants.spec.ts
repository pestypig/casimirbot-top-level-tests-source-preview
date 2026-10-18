import { describe, expect, it } from "vitest";
import { buildEvolutionBrick } from "../server/gr/evolution/index.js";
import { createMinkowskiState, gridFromBounds } from "../modules/gr/bssn-state";
import {
  evaluateIntervalGate,
  poissonResidualRMSInterval,
} from "../server/services/physics/invariants";

const maxAbs = (data: Float32Array) => {
  let out = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = Math.abs(data[i]);
    if (value > out) out = value;
  }
  return out;
};

describe("GR invariants", () => {
  it("keeps Minkowski invariants near zero", () => {
    const dims = [6, 6, 6] as const;
    const bounds = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };
    const grid = gridFromBounds(dims, bounds);
    const state = createMinkowskiState(grid);
    const brick = buildEvolutionBrick({
      state,
      includeConstraints: false,
      includeInvariants: true,
    });
    const kretschmann = brick.channels.kretschmann?.data ?? new Float32Array();
    const weylI = brick.channels.weylI?.data ?? new Float32Array();
    const ricci4 = brick.channels.ricci4?.data ?? new Float32Array();
    const ricci2 = brick.channels.ricci2?.data ?? new Float32Array();

    expect(kretschmann.length).toBe(dims[0] * dims[1] * dims[2]);
    expect(weylI.length).toBe(dims[0] * dims[1] * dims[2]);
    expect(ricci4.length).toBe(dims[0] * dims[1] * dims[2]);
    expect(ricci2.length).toBe(dims[0] * dims[1] * dims[2]);

    expect(maxAbs(kretschmann)).toBeLessThan(1e-6);
    expect(maxAbs(weylI)).toBeLessThan(1e-6);
    expect(maxAbs(ricci4)).toBeLessThan(1e-6);
    expect(maxAbs(ricci2)).toBeLessThan(1e-6);
  });

  it("uses propagated residual intervals for threshold gating", () => {
    const nx = 3;
    const ny = 3;
    const phi = new Float32Array(nx * ny);
    const rhoEff = new Float32Array(nx * ny);

    const tight = poissonResidualRMSInterval(
      phi,
      rhoEff,
      nx,
      ny,
      1,
      1,
      1,
      1e-4,
      0.95,
    );
    const conservativePass = evaluateIntervalGate("H_rms", tight, "<=", 1e-3);
    expect(conservativePass.pass).toBe(true);
    expect(conservativePass.reason).toContain("passed");
    expect(conservativePass.confidence).toBeCloseTo(0.95, 12);

    const loose = poissonResidualRMSInterval(
      phi,
      rhoEff,
      nx,
      ny,
      1,
      1,
      1,
      2e-3,
      0.95,
    );
    const conservativeFail = evaluateIntervalGate("H_rms", loose, "<=", 1e-3);
    expect(conservativeFail.pass).toBe(false);
    expect(conservativeFail.reason).toContain("straddles threshold");
    expect(conservativeFail.reason).toContain("95.0% confidence");
  });
});
