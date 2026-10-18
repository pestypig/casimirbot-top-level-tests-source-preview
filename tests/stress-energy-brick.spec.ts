import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { buildStressEnergyBrick } from "../server/stress-energy-brick";
import { buildStressEnergyFieldSetFromPipeline } from "../server/gr/evolution/stress-energy";
import {
  getGlobalPipelineState,
  initializePipelineState,
  setGlobalPipelineState,
} from "../server/energy-pipeline";

const baseParams = {
  dims: [20, 12, 12] as [number, number, number],
  phase01: 0.125,
  sigmaSector: 0.05,
  splitEnabled: true,
  splitFrac: 0.6,
  dutyFR: 0.0025,
  q: 1,
  gammaGeo: 26,
  gammaVdB: 1e5,
  ampBase: 0.15,
  zeta: 0.82,
};

const hashFloat32 = (value: Float32Array) =>
  createHash("sha256")
    .update(Buffer.from(value.buffer, value.byteOffset, value.byteLength))
    .digest("hex");

describe("stress-energy brick builder", () => {
  it("preserves average density after normalization", () => {
    const brick = buildStressEnergyBrick(baseParams);
    const { dims, channels, stats } = brick;
    const total = dims[0] * dims[1] * dims[2];
    const sum = channels.t00.data.reduce((acc, value) => acc + value, 0);
    const directAvg = sum / Math.max(total, 1);
    expect(Number.isFinite(stats.avgT00)).toBe(true);
    expect(Math.abs(directAvg - stats.avgT00)).toBeLessThan(Math.max(1e-8, Math.abs(stats.avgT00) * 1e-3));
  });

  it("yields near-zero integrated divergence", () => {
    const brick = buildStressEnergyBrick({ ...baseParams, phase01: 0.36 });
    const totalDiv = brick.channels.divS.data.reduce((acc, value) => acc + value, 0);
    expect(Math.abs(totalDiv)).toBeLessThan(5e-3);
  });

  it("embeds Natario diagnostics", () => {
    const brick = buildStressEnergyBrick(baseParams);
    expect(brick.stats.natario).toBeDefined();
    expect(brick.stats.natario?.gateLimit).toBeGreaterThan(0);
    expect(Number.isFinite(brick.stats.natario?.divBetaMax)).toBe(true);
  });

  it("reports conservation diagnostics", () => {
    const brick = buildStressEnergyBrick(baseParams);
    expect(brick.stats.conservation).toBeDefined();
    expect(Number.isFinite(brick.stats.conservation?.divRms ?? NaN)).toBe(true);
    expect(Number.isFinite(brick.stats.conservation?.netFluxMagnitude ?? NaN)).toBe(true);
  });

  it("reports mapping diagnostics", () => {
    const brick = buildStressEnergyBrick(baseParams);
    expect(brick.stats.mapping).toBeDefined();
    expect(Number.isFinite(brick.stats.mapping?.rho_avg ?? NaN)).toBe(true);
    expect(brick.stats.mapping?.proxy).toBe(true);
  });

  it("emits sampled tensor summaries for NHM2 source-closure review", () => {
    const brick = buildStressEnergyBrick(baseParams);
    const summaries = brick.stats.tensorSampledSummaries;
    expect(summaries?.pressureModel).toBe("isotropic_pressure_proxy");
    const regionIds = summaries?.regions.map((region) => region.regionId) ?? [];
    expect(regionIds).toContain("global");
    expect(regionIds.length).toBeGreaterThan(1);
    const global = summaries?.regions.find((region) => region.regionId === "global");
    expect(global?.tensor.T00).toBeCloseTo(brick.stats.avgT00, 5);
    expect(global?.tensor.T11).toBeCloseTo(-brick.stats.avgT00, 5);
    expect(global?.t00Diagnostics?.skippedCount).toBeNull();
    expect(global?.t00Diagnostics?.nonFiniteCount).toBeNull();
    expect(global?.t00Diagnostics?.evidenceStatus).toBe("inferred");
  });

  it("applies NHM2 shift-lapse attenuation to the metric-fed tile proxy lane", () => {
    const previousState = getGlobalPipelineState();
    try {
      const baselineState = initializePipelineState();
      baselineState.warpFieldType = "nhm2_shift_lapse";
      baselineState.dynamicConfig = {
        ...(baselineState.dynamicConfig ?? {}),
        warpFieldType: "nhm2_shift_lapse",
        alphaCenterline: 1,
      } as any;
      setGlobalPipelineState(baselineState);
      const baseline = buildStressEnergyBrick({
        ...baseParams,
        metricT00: -5.826745096267209e7,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
        warpFieldType: "nhm2_shift_lapse",
      });

      const attenuatedState = initializePipelineState();
      attenuatedState.warpFieldType = "nhm2_shift_lapse";
      attenuatedState.dynamicConfig = {
        ...(attenuatedState.dynamicConfig ?? {}),
        warpFieldType: "nhm2_shift_lapse",
        alphaCenterline: 0.995,
      } as any;
      setGlobalPipelineState(attenuatedState);
      const attenuated = buildStressEnergyBrick({
        ...baseParams,
        metricT00: -5.826745096267209e7,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
        warpFieldType: "nhm2_shift_lapse",
      });

      const expectedRatio = 0.995 ** 4;
      const baselineGlobalT00 =
        baseline.stats.tensorSampledSummaries?.regions.find((region) => region.regionId === "global")?.tensor.T00 ??
        baseline.stats.avgT00;
      const attenuatedGlobalT00 =
        attenuated.stats.tensorSampledSummaries?.regions.find((region) => region.regionId === "global")?.tensor.T00 ??
        attenuated.stats.avgT00;

      expect(Math.abs(attenuated.stats.avgT00)).toBeLessThan(Math.abs(baseline.stats.avgT00));
      expect(Math.abs(attenuatedGlobalT00)).toBeLessThan(Math.abs(baselineGlobalT00));
      expect(attenuated.stats.mapping?.rho_avg).toBeCloseTo(
        (baseline.stats.mapping?.rho_avg ?? 0) * expectedRatio,
        6,
      );
      expect(attenuated.stats.avgT00 / baseline.stats.avgT00).toBeCloseTo(expectedRatio, 5);
      expect(attenuatedGlobalT00 / baselineGlobalT00).toBeCloseTo(expectedRatio, 5);
    } finally {
      setGlobalPipelineState(previousState);
    }
  });

  it("computes observer-robust energy-condition margins", () => {
    const brick = buildStressEnergyBrick(baseParams);
    const robust = brick.stats.observerRobust;
    expect(robust).toBeDefined();
    expect(robust?.pressureModel).toBe("isotropic_pressure");
    expect(robust?.rapidityCap).toBeGreaterThan(0);
    expect(Number.isFinite(robust?.typeI.fraction ?? NaN)).toBe(true);
    expect((robust?.nec.robustMin ?? 0) <= (robust?.nec.eulerianMin ?? 0) + 1e-8).toBe(true);
    expect((robust?.wec.robustMin ?? 0) <= (robust?.wec.eulerianMin ?? 0) + 1e-8).toBe(true);
    expect((robust?.sec.robustMin ?? 0) <= (robust?.sec.eulerianMin ?? 0) + 1e-8).toBe(true);
    expect((robust?.dec.robustMin ?? 0) <= (robust?.dec.eulerianMin ?? 0) + 1e-8).toBe(true);
    expect(robust?.consistency.robustNotGreaterThanEulerian).toBe(true);
  });

  it("branches source families by metricT00Ref and emits branch metadata", () => {
    const shared = {
      ...baseParams,
      metricT00: -2.5e5,
      metricT00Source: "metric",
      q: 3,
      gammaVdB: 500,
      zeta: 0.84,
      phase01: 0,
      splitEnabled: false,
      splitFrac: 0.6,
      dutyFR: 0.0015,
    };
    const alcubierre = buildStressEnergyBrick({
      ...shared,
      metricT00Ref: "warp.metric.T00.alcubierre.analytic",
    });
    const natario = buildStressEnergyBrick({
      ...shared,
      metricT00Ref: "warp.metric.T00.natario.shift",
    });

    const alcT00Hash = hashFloat32(alcubierre.channels.t00.data);
    const natT00Hash = hashFloat32(natario.channels.t00.data);
    expect(alcT00Hash).not.toBe(natT00Hash);
    expect(alcubierre.family_id).toBe("alcubierre_control");
    expect(natario.family_id).toBe("natario_control");
    expect(alcubierre.source_branch).toBe("metric_t00_ref");
    expect(natario.source_branch).toBe("metric_t00_ref");
    expect(alcubierre.shape_function_id).toBe("alcubierre_longitudinal_shell_v1");
    expect(natario.shape_function_id).toBe("natario_shift_shell_v1");
    expect(alcubierre.stats.mapping?.family_id).toBe("alcubierre_control");
    expect(natario.stats.mapping?.family_id).toBe("natario_control");
    expect(alcubierre.stats.mapping?.metricT00Ref).toBe("warp.metric.T00.alcubierre.analytic");
    expect(natario.stats.mapping?.metricT00Ref).toBe("warp.metric.T00.natario.shift");
  });

  it("propagates sourceRedesignMode into the GR matter builder", () => {
    const grid = {
      dims: [48, 48, 48] as [number, number, number],
      spacing: [1007 / 48, 264 / 48, 173 / 48] as [number, number, number],
      bounds: {
        min: [-1007 / 2, -264 / 2, -173 / 2] as [number, number, number],
        max: [1007 / 2, 264 / 2, 173 / 2] as [number, number, number],
      },
    };
    const baseline = buildStressEnergyFieldSetFromPipeline(grid, {
      ...baseParams,
      metricT00: -2.5e5,
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.natario_sdf.shift",
      warpFieldType: "natario_sdf",
    });
    const redesign = buildStressEnergyFieldSetFromPipeline(grid, {
      ...baseParams,
      metricT00: -2.5e5,
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.natario_sdf.shift",
      warpFieldType: "natario_sdf",
      sourceRedesignMode: "signed_shell_bias",
    });

    expect(redesign.brick.sourceRedesignMode).toBe("signed_shell_bias");
    expect(redesign.brick.family_id).toBe("nhm2_redesign_signed_shell_bias");
    expect(redesign.brick.shape_function_id).toBe("nhm2_redesign_signed_shell_bias_v1");
    expect(hashFloat32(redesign.fields.rho)).not.toBe(hashFloat32(baseline.fields.rho));
  });

  it("propagates sourceReformulationMode into the GR matter builder", () => {
    const grid = {
      dims: [48, 48, 48] as [number, number, number],
      spacing: [1007 / 48, 264 / 48, 173 / 48] as [number, number, number],
      bounds: {
        min: [-1007 / 2, -264 / 2, -173 / 2] as [number, number, number],
        max: [1007 / 2, 264 / 2, 173 / 2] as [number, number, number],
      },
    };
    const baseline = buildStressEnergyFieldSetFromPipeline(grid, {
      ...baseParams,
      metricT00: -2.5e5,
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.natario_sdf.shift",
      warpFieldType: "natario_sdf",
    });
    const reformulation = buildStressEnergyFieldSetFromPipeline(grid, {
      ...baseParams,
      metricT00: -2.5e5,
      metricT00Source: "metric",
      metricT00Ref: "warp.metric.T00.natario_sdf.shift",
      warpFieldType: "natario_sdf",
      sourceReformulationMode: "fore_aft_antisymmetric_driver",
    });

    expect(reformulation.brick.sourceReformulationMode).toBe(
      "fore_aft_antisymmetric_driver",
    );
    expect(reformulation.brick.family_id).toBe(
      "nhm2_reform_fore_aft_antisymmetric_driver",
    );
    expect(reformulation.brick.shape_function_id).toBe(
      "nhm2_reform_fore_aft_antisymmetric_driver_v1",
    );
    expect(hashFloat32(reformulation.fields.rho)).not.toBe(hashFloat32(baseline.fields.rho));
  });
});
