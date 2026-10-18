import { describe, expect, it } from "vitest";
import type { GridSpec } from "../modules/gr/bssn-state";
import { integrateStressEnergyTotals } from "../modules/gr/stress-energy-integrals";
import {
  computeInvariantMassEnergyInterval,
  evaluateIntervalGate,
  integrateEnergyIntervalJ,
  intervalFromValue,
} from "../server/services/physics/invariants";

const makeGrid = (): GridSpec => ({
  dims: [2, 1, 1],
  spacing: [2, 1, 1],
  bounds: { min: [0, 0, 0], max: [4, 1, 1] },
});

describe("integrateStressEnergyTotals", () => {
  it("reduces to E = m c^2 when momentum is zero", () => {
    const grid = makeGrid();
    const fields = {
      rho: new Float32Array([5, 5]),
      Sx: new Float32Array([0, 0]),
      Sy: new Float32Array([0, 0]),
      Sz: new Float32Array([0, 0]),
    };

    const totals = integrateStressEnergyTotals(fields, grid, {
      c: 1,
      momentumScale: 1,
    });

    expect(totals.totalEnergy_J).toBeCloseTo(20, 12);
    expect(totals.momentumMagnitude_kg_m_s).toBeCloseTo(0, 12);
    expect(totals.invariantMassEnergy_J).toBeCloseTo(20, 12);
    expect(totals.invariantMass_kg).toBeCloseTo(20, 12);
  });

  it("drops invariant mass when net momentum is present", () => {
    const grid = makeGrid();
    const fields = {
      rho: new Float32Array([5, 5]),
      Sx: new Float32Array([3, 3]),
      Sy: new Float32Array([0, 0]),
      Sz: new Float32Array([0, 0]),
    };

    const totals = integrateStressEnergyTotals(fields, grid, {
      c: 1,
      momentumScale: 1,
    });

    expect(totals.totalEnergy_J).toBeCloseTo(20, 12);
    expect(totals.momentumMagnitude_kg_m_s).toBeCloseTo(12, 12);
    expect(totals.invariantMassEnergy_J).toBeCloseTo(16, 12);
    expect(totals.invariantMass_kg).toBeCloseTo(16, 12);
  });

  it("propagates uncertainty intervals through stress-energy derived metrics", () => {
    const energyInterval = integrateEnergyIntervalJ(
      new Float32Array([5, 5]),
      2,
      1,
      2,
      1,
      1,
      0.2,
      0.9,
    );
    expect(energyInterval.low).toBeCloseTo(19.2, 12);
    expect(energyInterval.high).toBeCloseTo(20.8, 12);

    const momentumInterval = intervalFromValue(12, 0.3, 0.9);
    const invariantMassEnergyInterval = computeInvariantMassEnergyInterval(
      energyInterval,
      momentumInterval,
      1,
    );
    expect(invariantMassEnergyInterval.low).toBeGreaterThan(14);
    expect(invariantMassEnergyInterval.high).toBeLessThan(17.5);
    expect(invariantMassEnergyInterval.confidence).toBeCloseTo(0.9, 12);
  });

  it("flips gate outcomes at threshold edges when uncertainty expands", () => {
    const tight = intervalFromValue(16, 0.25, 0.9);
    const pass = evaluateIntervalGate("invariantMassEnergy", tight, ">=", 15.5);
    expect(pass.pass).toBe(true);
    expect(pass.reason).toContain("passed");

    const loose = intervalFromValue(16, 0.7, 0.9);
    const fail = evaluateIntervalGate("invariantMassEnergy", loose, ">=", 15.5);
    expect(fail.pass).toBe(false);
    expect(fail.reason).toContain("straddles threshold");
    expect(fail.reason).toContain("90.0% confidence");
  });
});
