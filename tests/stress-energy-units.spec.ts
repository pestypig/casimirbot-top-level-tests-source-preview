import { describe, expect, it } from "vitest";
import type { GridSpec } from "../modules/gr/bssn-state";
import type {
  StressEnergyBrick,
  StressEnergyStats,
} from "../server/stress-energy-brick";
import { buildStressEnergyFieldSetFromBrick } from "../server/gr/evolution/stress-energy";
import { SI_TO_GEOM_STRESS } from "../shared/gr-units";
import { bridgeCurvatureToStressEnergy, kappa_u } from "@shared/curvature-proxy";

const makeBrick = (): StressEnergyBrick => {
  const t00 = new Float32Array([2]);
  const Sx = new Float32Array([3]);
  const Sy = new Float32Array([0]);
  const Sz = new Float32Array([0]);
  const divS = new Float32Array([0]);
  const stats: StressEnergyStats = {
    totalEnergy_J: 2,
    avgT00: 2,
    avgFluxMagnitude: 0,
    netFlux: [0, 0, 0],
    divMin: 0,
    divMax: 0,
    dutyFR: 1,
    strobePhase: 0,
    conservation: {
      divMean: 0,
      divAbsMean: 0,
      divRms: 0,
      divMaxAbs: 0,
      netFluxMagnitude: 0,
      netFluxNorm: 0,
      divRmsNorm: 0,
    },
  };
  return {
    dims: [1, 1, 1],
    voxelBytes: 4,
    format: "r32f",
    channels: {
      t00: { data: t00, min: 2, max: 2 },
      Sx: { data: Sx, min: 3, max: 3 },
      Sy: { data: Sy, min: 0, max: 0 },
      Sz: { data: Sz, min: 0, max: 0 },
      divS: { data: divS, min: 0, max: 0 },
    },
    stats,
  };
};

describe("stress-energy unit scaling", () => {
  it("scales SI stress-energy into geometric units", () => {
    const grid: GridSpec = {
      dims: [1, 1, 1],
      spacing: [1, 1, 1],
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    };
    const brick = makeBrick();

    const geom = buildStressEnergyFieldSetFromBrick(grid, brick, {
      unitSystem: "geometric",
    });
    const si = buildStressEnergyFieldSetFromBrick(grid, brick, {
      unitSystem: "SI",
    });

    expect(geom.rho[0]).toBeCloseTo(2, 12);
    expect(si.rho[0]).toBeCloseTo(2 * SI_TO_GEOM_STRESS, 12);
    expect(si.Sx[0]).toBeCloseTo(3 * SI_TO_GEOM_STRESS, 12);
  });
});


describe("curvature-stress bridge primitive", () => {
  it("preserves canonical kappa parity and SI unit lock", () => {
    const t00 = 4.2e8;
    const out = bridgeCurvatureToStressEnergy({
      channel: "kappa_u",
      kappa_m2: kappa_u(t00),
      bound_abs_J_m3: 1e10,
      mismatch_threshold_rel: 1e-12,
      provenance: { class: "diagnostic", method: "TOE-001 bridge" },
      uncertainty: { model: "bounded", relative_1sigma: 0.1, confidence: 0.9 },
    });

    expect(out.units.system).toBe("SI");
    expect(out.units.density).toBe("J/m^3");
    expect(out.provenance.class).toBe("diagnostic");
    expect(out.parity.pass).toBe(true);
    expect(out.surrogate.t00_J_m3).toBeCloseTo(t00, 6);
  });

  it("fails parity when mismatch threshold is stricter than observed mismatch", () => {
    const t00 = 2.1e7;
    const out = bridgeCurvatureToStressEnergy({
      channel: "kappa_u",
      kappa_m2: kappa_u(t00),
      bound_abs_J_m3: t00 / 2,
      mismatch_threshold_rel: 1e-8,
      provenance: { class: "diagnostic", method: "TOE-001 mismatch" },
    });

    expect(out.surrogate.bounded).toBe(true);
    expect(out.parity.mismatch_rel).toBeGreaterThan(out.parity.mismatch_threshold_rel);
    expect(out.parity.pass).toBe(false);
  });
});
