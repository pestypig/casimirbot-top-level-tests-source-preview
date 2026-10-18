import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { C2 } from "@shared/physics-const";
import { GEOM_TO_SI_STRESS } from "@shared/gr-units";
import { createStressEnergyFieldSet } from "../modules/gr/stress-energy";
import type { StressEnergyBrick } from "../server/stress-energy-brick";
import {
  dpGridFromBounds,
  dpGridFromGridSpec,
  dpMassDistributionFromDensityGrid,
  dpMassDistributionFromStressEnergyBrick,
  dpMassDistributionFromStressEnergyFields,
} from "../server/services/dp-adapters";

const decodeVolume = (payload: { data_b64: string }, expectedLength: number): Float32Array => {
  const buf = Buffer.from(payload.data_b64, "base64");
  const view = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (view.length < expectedLength) {
    throw new Error("decode_length_mismatch");
  }
  return new Float32Array(view.slice(0, expectedLength));
};

describe("dp adapters", () => {
  it("builds a DP grid from bounds", () => {
    const grid = dpGridFromBounds([2, 4, 6], { min: [0, 0, 0], max: [2, 4, 6] });
    expect(grid.voxel_size_m).toEqual([1, 1, 1]);
    expect(grid.origin_m).toEqual([1, 2, 3]);
  });

  it("builds a DP grid from GridSpec", () => {
    const grid = dpGridFromGridSpec(
      { dims: [2, 2, 2], spacing: [0.5, 1, 1.5], bounds: { min: [-1, -1, -1], max: [1, 1, 1] } },
      undefined,
    );
    expect(grid.voxel_size_m).toEqual([0.5, 1, 1.5]);
    expect(grid.origin_m).toEqual([0, 0, 0]);
  });

  it("converts stress-energy brick t00 to mass density", () => {
    const dims: [number, number, number] = [2, 1, 1];
    const t00 = new Float32Array([C2, -2 * C2]);
    const zeros = new Float32Array(2);
    const brick: StressEnergyBrick = {
      dims,
      voxelBytes: 4,
      format: "r32f",
      channels: {
        t00: { data: t00, min: -2 * C2, max: C2 },
        Sx: { data: zeros, min: 0, max: 0 },
        Sy: { data: zeros, min: 0, max: 0 },
        Sz: { data: zeros, min: 0, max: 0 },
        divS: { data: zeros, min: 0, max: 0 },
      },
      stats: {
        totalEnergy_J: 0,
        avgT00: 0,
        avgFluxMagnitude: 0,
        netFlux: [0, 0, 0],
        divMin: 0,
        divMax: 0,
        dutyFR: 0,
        strobePhase: 0,
      },
    };

    const result = dpMassDistributionFromStressEnergyBrick({
      brick,
      bounds: { min: [0, 0, 0], max: [2, 1, 1] },
      options: { sign_mode: "signed" },
    });

    const rho = decodeVolume(result.branch.rho_kg_m3, 2);
    expect(rho[0]).toBeCloseTo(1, 6);
    expect(rho[1]).toBeCloseTo(-2, 6);
  });

  it("converts GR stress-energy rho (geom) to mass density", () => {
    const grid = {
      dims: [1, 1, 1] as [number, number, number],
      spacing: [1, 1, 1] as [number, number, number],
      bounds: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] },
    };
    const fields = createStressEnergyFieldSet(grid);
    const rhoGeom = 2e-9;
    fields.rho[0] = rhoGeom;

    const result = dpMassDistributionFromStressEnergyFields({ fields, grid });
    const rho = decodeVolume(result.branch.rho_kg_m3, 1);
    const expected = (rhoGeom * GEOM_TO_SI_STRESS) / C2;
    const relErr = Math.abs(rho[0] - expected) / Math.max(Math.abs(expected), 1);
    expect(relErr).toBeLessThan(1e-6);
  });

  it("converts a density grid payload with explicit units", () => {
    const grid = {
      dims: [2, 1, 1] as [number, number, number],
      voxel_size_m: [1, 1, 1] as [number, number, number],
      origin_m: [0, 0, 0] as [number, number, number],
    };
    const massDensity = new Float32Array([2, -1]);
    const energyDensity = new Float32Array([massDensity[0] * C2, massDensity[1] * C2]);
    const payload = {
      encoding: "base64" as const,
      dtype: "float32" as const,
      endian: "little" as const,
      order: "row-major" as const,
      data_b64: Buffer.from(energyDensity.buffer, energyDensity.byteOffset, energyDensity.byteLength).toString("base64"),
    };

    const result = dpMassDistributionFromDensityGrid({
      density: payload,
      grid,
      options: { units: "energy_density_J_m3", sign_mode: "signed" },
    });
    const rho = decodeVolume(result.branch.rho_kg_m3, 2);
    expect(rho[0]).toBeCloseTo(2, 6);
    expect(rho[1]).toBeCloseTo(-1, 6);
  });
});
