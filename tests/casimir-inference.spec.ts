import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { PHYSICS_CONSTANTS } from "../modules/core/physics-constants";
import {
  inferCasimirForceScale,
  inferEnergyFromForceSeries,
} from "../modules/sim_core/casimir-inference";
import type { CasimirForceDataset } from "../shared/schema";

type DatasetOptions = {
  datasetId: string;
  sigmaForceFrac: number;
  sigmaSepFrac: number;
  noiseFrac: number;
};

const referenceDatasetPath = fileURLToPath(
  new URL("../datasets/casimir/gaas-au-equilibrium-zenodo-10791253.json", import.meta.url),
);
const hasReferenceDataset = existsSync(referenceDatasetPath);
const itWithReference = hasReferenceDataset ? it : it.skip;

const idealParallelPlateForce = (area_m2: number, separation_m: number) => {
  const a = Math.max(1e-12, separation_m);
  return -(Math.PI ** 2) * PHYSICS_CONSTANTS.HBAR_C * area_m2 / (240 * a ** 4);
};

const buildDataset = (opts: DatasetOptions): CasimirForceDataset => {
  const area_m2 = 1e-4;
  const separations = [100e-9, 150e-9, 200e-9, 250e-9, 300e-9];
  const force_N = separations.map((a, idx) => {
    const ideal = idealParallelPlateForce(area_m2, a);
    const noise = ideal * opts.noiseFrac * (idx % 2 === 0 ? 1 : -1);
    return ideal + noise;
  });
  const sigmaForce_N = separations.map((a, idx) => {
    const ideal = idealParallelPlateForce(area_m2, a);
    const scale = Math.abs(ideal) * opts.sigmaForceFrac;
    return Math.max(0, scale + Math.abs(ideal) * opts.noiseFrac * (idx % 3) * 0.1);
  });
  const sigmaSep_m = separations.map((a) => Math.abs(a) * opts.sigmaSepFrac);
  return {
    datasetId: opts.datasetId,
    geometry: "parallelPlate",
    temperature_K: 4,
    separation_m: separations,
    force_N,
    sigmaForce_N,
    sigmaSep_m,
    area_m2,
  };
};

const loadReferenceDataset = (): CasimirForceDataset => {
  const raw = readFileSync(referenceDatasetPath, "utf8");
  return JSON.parse(raw) as CasimirForceDataset;
};

const loadGoldenSnapshot = () => {
  const path = fileURLToPath(
    new URL("./fixtures/casimir/gaas-au-equilibrium.golden.json", import.meta.url),
  );
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as {
    kCasimir: number;
    rms_rel: number;
    rms_N: number;
    energy_J_at_a0: number;
    referenceSeparation_m: number;
    sampleCount: number;
  };
};

const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

describe("casimir force inference", () => {
  it("recovers unity normalization for ideal plates", () => {
    const dataset = buildDataset({
      datasetId: "ideal-plates-clean",
      sigmaForceFrac: 0.01,
      sigmaSepFrac: 0.005,
      noiseFrac: 0,
    });
    const scale = inferCasimirForceScale(dataset);
    expect(scale).not.toBeNull();
    expect(scale?.kCasimir).toBeCloseTo(1, 3);
  });

  it("reports larger uncertainty for noisier data", () => {
    const clean = buildDataset({
      datasetId: "ideal-plates-clean",
      sigmaForceFrac: 0.01,
      sigmaSepFrac: 0.005,
      noiseFrac: 0,
    });
    const noisy = buildDataset({
      datasetId: "ideal-plates-noisy",
      sigmaForceFrac: 0.1,
      sigmaSepFrac: 0.02,
      noiseFrac: 0.05,
    });
    const cleanScale = inferCasimirForceScale(clean);
    const noisyScale = inferCasimirForceScale(noisy);
    expect(cleanScale?.sigmaK ?? 0).toBeGreaterThan(0);
    expect(noisyScale?.sigmaK ?? 0).toBeGreaterThan(cleanScale?.sigmaK ?? 0);

    const cleanEnergy = inferEnergyFromForceSeries(clean);
    const noisyEnergy = inferEnergyFromForceSeries(noisy);
    expect(cleanEnergy.sigmaEnergy_J ?? 0).toBeGreaterThan(0);
    expect(noisyEnergy.sigmaEnergy_J ?? 0).toBeGreaterThan(
      cleanEnergy.sigmaEnergy_J ?? 0,
    );
  });

  it("rejects sign-mismatched datasets unless auto-flip is enabled", () => {
    const dataset = buildDataset({
      datasetId: "ideal-plates-flipped",
      sigmaForceFrac: 0.01,
      sigmaSepFrac: 0.005,
      noiseFrac: 0,
    });
    const flipped: CasimirForceDataset = {
      ...dataset,
      force_N: dataset.force_N.map((value) => Math.abs(value)),
    };

    expect(() => inferCasimirForceScale(flipped)).toThrow(/sign mismatch/i);
    expect(() => inferEnergyFromForceSeries(flipped)).toThrow(/sign mismatch/i);

    const autoFlip: CasimirForceDataset = {
      ...flipped,
      allowForceSignAutoFlip: true,
    };
    const scale = inferCasimirForceScale(autoFlip);
    expect(scale).not.toBeNull();
    expect(scale?.forceSign?.autoFlipApplied).toBe(true);
    expect(scale?.kCasimir).toBeCloseTo(1, 3);
    const energy = inferEnergyFromForceSeries(autoFlip);
    expect(energy.forceSign?.autoFlipApplied).toBe(true);
  });

  itWithReference("matches published GaAs/Au equilibrium reference dataset", () => {
    const dataset = loadReferenceDataset();
    const golden = loadGoldenSnapshot();
    const scale = inferCasimirForceScale(dataset);
    expect(scale).not.toBeNull();
    const energy = inferEnergyFromForceSeries(dataset);
    const snapshot = {
      kCasimir: roundTo(scale?.kCasimir ?? 0, 6),
      rms_rel: roundTo(scale?.fitResiduals?.rms_rel ?? 0, 3),
      rms_N: roundTo(scale?.fitResiduals?.rms_N ?? 0, 3),
      energy_J_at_a0: roundTo(energy.energy_J_at_a0, 12),
      referenceSeparation_m: roundTo(energy.referenceSeparation_m, 9),
      sampleCount: energy.sampleCount,
    };
    expect(snapshot).toEqual(golden);
  });
});
