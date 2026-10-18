import { describe, expect, it, vi } from "vitest";
import { PHYSICS_CONSTANTS } from "../modules/core/physics-constants";
import { inferCasimirForceScale } from "../modules/sim_core/casimir-inference";
import type { CasimirForceDataset } from "../shared/schema";

const loadPipeline = async () => {
  vi.resetModules();
  return import("../server/energy-pipeline");
};

const idealParallelPlateForce = (area_m2: number, separation_m: number) => {
  const a = Math.max(1e-12, separation_m);
  return -(Math.PI ** 2) * PHYSICS_CONSTANTS.HBAR_C * area_m2 / (240 * a ** 4);
};

const buildForceDataset = (datasetId: string): CasimirForceDataset => {
  const area_m2 = 1e-4;
  const separation_m = [120e-9, 160e-9, 200e-9, 240e-9, 280e-9];
  const force_N = separation_m.map((a) => idealParallelPlateForce(area_m2, a));
  const sigmaForce_N = separation_m.map((a) => {
    const ideal = idealParallelPlateForce(area_m2, a);
    return Math.abs(ideal) * 0.02;
  });
  return {
    datasetId,
    geometry: "parallelPlate",
    temperature_K: 4,
    separation_m,
    force_N,
    sigmaForce_N,
    area_m2,
  };
};

describe("pipeline mass modes", () => {
  it("keeps measured mode independent from target calibration", async () => {
    const { calculateEnergyPipeline, initializePipelineState } =
      await loadPipeline();
    const dataset = buildForceDataset("pipeline-mass-mode");

    const measuredState = initializePipelineState();
    measuredState.massMode = "MEASURED_FORCE_INFERRED";
    measuredState.experimental = { casimirForce: dataset };
    measuredState.exoticMassTarget_kg = 9e9;

    const measured = await calculateEnergyPipeline(measuredState);
    expect(measured.massSource).toBe("measured");
    expect(measured.massDatasetId).toBe(dataset.datasetId);
    expect(measured.gammaVanDenBroeckSource).not.toBe("target");

    const targetState = initializePipelineState();
    targetState.massMode = "TARGET_CALIBRATED";
    targetState.exoticMassTarget_kg = measured.M_exotic * 0.5;

    const target = await calculateEnergyPipeline(targetState);
    expect(target.massSource).toBe("target");
    expect(target.gammaVanDenBroeckSource).toBe("target");
    expect(target.M_exotic).toBeLessThan(measured.M_exotic);
  });

  it("hard-fails measured mode without dataset id", async () => {
    const { calculateEnergyPipeline, initializePipelineState } =
      await loadPipeline();
    const dataset = {
      ...buildForceDataset("missing-id"),
      datasetId: undefined,
    } as unknown as CasimirForceDataset;

    const measuredState = initializePipelineState();
    measuredState.massMode = "MEASURED_FORCE_INFERRED";
    measuredState.experimental = { casimirForce: dataset };

    await expect(calculateEnergyPipeline(measuredState)).rejects.toThrow(
      /datasetId/i,
    );
  });

  it("propagates kCasimir uncertainty into mass sigma", async () => {
    const { calculateEnergyPipeline, initializePipelineState } =
      await loadPipeline();
    const dataset = buildForceDataset("pipeline-mass-sigma");
    const scale = inferCasimirForceScale(dataset);
    expect(scale?.kCasimir).toBeGreaterThan(0);
    expect(scale?.sigmaK).toBeGreaterThan(0);

    const measuredState = initializePipelineState();
    measuredState.massMode = "MEASURED_FORCE_INFERRED";
    measuredState.experimental = { casimirForce: dataset };

    const measured = await calculateEnergyPipeline(measuredState);
    expect(measured.massSigma_kg ?? 0).toBeGreaterThan(0);
    const expectedFrac = (scale?.sigmaK ?? 0) / (scale?.kCasimir ?? 1);
    const actualFrac = (measured.massSigma_kg ?? 0) / measured.M_exotic;
    expect(actualFrac).toBeCloseTo(expectedFrac, 2);
  });
});
