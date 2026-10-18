import { describe, expect, it } from "vitest";
import { enhancedAvgEnergyDensity } from "../modules/dynamic/stress-energy-equations";

const baseArgs = {
  gap_m: 1e-6,
  gammaGeo: 1,
  cavityQ: 1e9,
  gammaVdB: 1,
  qSpoilingFactor: 1,
  deltaAOverA: 1,
  dutyEff: 0.5,
};

describe("enhancedAvgEnergyDensity rho0Scale", () => {
  it("scales rho_inst and rho_avg", () => {
    const base = enhancedAvgEnergyDensity(baseArgs);
    const scaled = enhancedAvgEnergyDensity({ ...baseArgs, rho0Scale: 2.5 });

    expect(scaled.rho_inst / base.rho_inst).toBeCloseTo(2.5, 6);
    expect(scaled.rho_avg / base.rho_avg).toBeCloseTo(2.5, 6);
  });

  it("ignores non-positive rho0Scale", () => {
    const base = enhancedAvgEnergyDensity(baseArgs);
    const zeroScale = enhancedAvgEnergyDensity({ ...baseArgs, rho0Scale: 0 });

    expect(zeroScale.rho_inst).toBeCloseTo(base.rho_inst, 12);
    expect(zeroScale.rho_avg).toBeCloseTo(base.rho_avg, 12);
  });
});
