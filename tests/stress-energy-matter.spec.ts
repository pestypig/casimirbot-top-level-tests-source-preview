import { describe, expect, it } from "vitest";
import type { GridSpec } from "../modules/gr/bssn-state";
import { calculateMetricStressEnergyTensorRegionMeansFromShiftField } from "../modules/warp/natario-warp";
import type { StressEnergyBrick } from "../server/stress-energy-brick";
import { buildStressEnergyFieldSetFromBrick } from "../server/gr/evolution/stress-energy";

const baseOptions = {
  unitSystem: "geometric" as const,
};

const makeChannel = (data: Float32Array) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of data) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return { data, min, max };
};

const makeBrick = (dims: [number, number, number], input?: {
  t00?: number;
  Sx?: number;
  Sy?: number;
  Sz?: number;
  netFlux?: [number, number, number];
  divRmsNorm?: number;
}): StressEnergyBrick => {
  const total = dims[0] * dims[1] * dims[2];
  const t00 = new Float32Array(total);
  const sx = new Float32Array(total);
  const sy = new Float32Array(total);
  const sz = new Float32Array(total);
  const divS = new Float32Array(total);
  t00.fill(input?.t00 ?? 0);
  sx.fill(input?.Sx ?? 0);
  sy.fill(input?.Sy ?? 0);
  sz.fill(input?.Sz ?? 0);

  const netFlux: [number, number, number] = input?.netFlux ?? [0, 0, 0];
  const divRmsNorm = input?.divRmsNorm ?? 0;

  return {
    dims,
    voxelBytes: 4,
    format: "r32f",
    channels: {
      t00: makeChannel(t00),
      Sx: makeChannel(sx),
      Sy: makeChannel(sy),
      Sz: makeChannel(sz),
      divS: makeChannel(divS),
    },
    stats: {
      totalEnergy_J: 0,
      avgT00: input?.t00 ?? 0,
      avgFluxMagnitude: 0,
      netFlux,
      divMin: 0,
      divMax: 0,
      dutyFR: 0,
      strobePhase: 0,
      conservation: {
        divMean: 0,
        divAbsMean: 0,
        divRms: 0,
        divMaxAbs: 0,
        netFluxMagnitude: Math.hypot(...netFlux),
        netFluxNorm: 0,
        divRmsNorm,
      },
      mapping: {
        rho_avg: 0,
        rho_inst: 0,
        gap_nm: 0,
        cavityQ: 0,
        qSpoil: 0,
        gammaGeo: 0,
        gammaVdB: 0,
        dutyFR: 0,
        ampBase: 0,
        zeta: 0,
        proxy: true,
      },
    },
  };
};

describe("stress-energy matter modeling", () => {
  it("adds anisotropic stress along the flux direction", () => {
    const grid: GridSpec = {
      dims: [1, 1, 1],
      spacing: [1, 1, 1],
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    };
    const brick = makeBrick([1, 1, 1], { t00: 2, Sx: 1 });

    const isotropic = buildStressEnergyFieldSetFromBrick(grid, brick, {
      ...baseOptions,
      pressureFactor: -1,
    });
    expect(isotropic.S_xx[0]).toBeCloseTo(-2);
    expect(isotropic.S_yy[0]).toBeCloseTo(-2);
    expect(isotropic.S_xy[0]).toBeCloseTo(0);

    const anisotropic = buildStressEnergyFieldSetFromBrick(grid, brick, {       
      ...baseOptions,
      pressureFactor: -1,
      anisotropyStrength: 1,
      anisotropyMode: "flux",
    });
    expect(anisotropic.S_xx[0]).toBeCloseTo(-4);
    expect(anisotropic.S_yy[0]).toBeCloseTo(-1);
    expect(anisotropic.S_zz[0]).toBeCloseTo(-1);
    expect(anisotropic.S_xy[0]).toBeCloseTo(0);
  });

  it("enforces net flux removal and divergence damping", () => {
    const grid: GridSpec = {
      dims: [2, 1, 1],
      spacing: [1, 1, 1],
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    };
    const brick = makeBrick([2, 1, 1], {
      t00: 1,
      Sx: 2,
      netFlux: [2, 0, 0],
      divRmsNorm: 1,
    });

    const netFluxRemoved = buildStressEnergyFieldSetFromBrick(grid, brick, {    
      ...baseOptions,
      enforceNetFlux: true,
    });
    expect(netFluxRemoved.Sx[0]).toBeCloseTo(0);
    expect(netFluxRemoved.Sx[1]).toBeCloseTo(0);

    const damped = buildStressEnergyFieldSetFromBrick(grid, brick, {
      ...baseOptions,
      conservationDamping: 1,
    });
    expect(damped.Sx[0]).toBeCloseTo(1);
  });

  it("computes honest region means for metric-side stress on a shared voxel basis", () => {
    const result = calculateMetricStressEnergyTensorRegionMeansFromShiftField(
      (x, y, z) => [2 * x, 3 * y, 5 * z],
      {
        dims: [6, 4, 2],
        bounds: {
          min: [-3, -2, -1],
          max: [3, 2, 1],
        },
        classifyRegion: ({ position: [x] }) => (x < 0 ? "hull" : "wall"),
      },
    );

    expect(result.global.sampleCount).toBe(48);
    expect(result.regions.map((entry) => entry.regionId).sort()).toEqual([
      "hull",
      "wall",
    ]);

    const hull = result.regions.find((entry) => entry.regionId === "hull");
    const wall = result.regions.find((entry) => entry.regionId === "wall");
    expect(hull?.sampleCount).toBe(24);
    expect(wall?.sampleCount).toBe(24);
    expect(result.global.diagonalTensor).not.toBeNull();
    expect(result.global.fullTensor).not.toBeNull();
    expect(hull?.diagonalTensor).not.toBeNull();
    expect(hull?.fullTensor).not.toBeNull();
    expect(wall?.diagonalTensor).not.toBeNull();
    expect(wall?.fullTensor).not.toBeNull();

    const relDiff = (a: number, b: number) =>
      Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1);

    expect(
      relDiff(result.global.diagonalTensor?.T00 ?? 0, hull?.diagonalTensor?.T00 ?? 0),
    ).toBeLessThan(1e-12);
    expect(
      relDiff(result.global.diagonalTensor?.T00 ?? 0, wall?.diagonalTensor?.T00 ?? 0),
    ).toBeLessThan(1e-12);
    expect(
      relDiff(result.global.diagonalTensor?.T11 ?? 0, hull?.diagonalTensor?.T11 ?? 0),
    ).toBeLessThan(1e-12);
    expect(
      relDiff(result.global.diagonalTensor?.T11 ?? 0, wall?.diagonalTensor?.T11 ?? 0),
    ).toBeLessThan(1e-12);
    expect(result.global.diagonalTensor?.T11).toBeCloseTo(
      -(result.global.diagonalTensor?.T00 ?? 0),
    );
    expect(Number.isFinite(result.global.fullTensor?.T01)).toBe(true);
    expect(Number.isFinite(result.global.fullTensor?.T12)).toBe(true);
    expect(result.global.fullTensor?.T10).toBe(result.global.fullTensor?.T01);
    expect(result.global.fullTensor?.T21).toBe(result.global.fullTensor?.T12);
    expect(result.global.fullTensor?.modelTermRoute).toBe(
      "adm_quasi_stationary_recovery_v1",
    );
    expect(result.grid.spacing).toEqual([1, 1, 1]);
  });
});
