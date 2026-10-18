import { describe, expect, it } from "vitest";
import {
  calculateNatarioWarpBubble,
  trilinearInterpolateScalarGrid,
  type NatarioWarpParams,
} from "../modules/warp/natario-warp";

describe("natario metric-derived T00", () => {
  const baseParams: NatarioWarpParams = {
    bowlRadius: 25000, // um
    sagDepth: 16, // nm
    gap: 1, // nm
    cavityQ: 1e9,
    burstDuration: 10, // us
    cycleDuration: 1000, // us
    sectorCount: 400,
    dutyFactor: 0.01,
    effectiveDuty: 2.5e-5,
    shiftAmplitude: 1e-6,
    expansionTolerance: 1e-12,
    warpFieldType: "natario",
  };

  it("uses metric-derived stress for natario", () => {
    const result = calculateNatarioWarpBubble(baseParams);
    expect(result.stressEnergySource).toBe("metric");
    expect(result.metricT00Source).toBe("metric");
    expect(result.metricT00Ref).toBe("warp.metric.T00.natario.shift");
    expect(result.metricT00).toBeDefined();
    expect(result.metricStressDiagnostics?.sampleCount ?? 0).toBeGreaterThan(0);
    expect(Number.isFinite(result.stressEnergyTensor.T00)).toBe(true);
  });

  it("uses metric-derived stress for natario_sdf", () => {
    const result = calculateNatarioWarpBubble({
      ...baseParams,
      warpFieldType: "natario_sdf",
      warpGridResolution: 12,
    });
    expect(result.stressEnergySource).toBe("metric");
    expect(result.metricT00Source).toBe("metric");
    expect(result.metricT00Ref).toBe("warp.metric.T00.natario_sdf.shift");
    expect(result.metricT00).toBeDefined();
    expect(result.metricStressDiagnostics?.sampleCount ?? 0).toBeGreaterThan(0);
    expect(Number.isFinite(result.stressEnergyTensor.T00)).toBe(true);
  });

  it("emits a distinct metric-derived source and lapse summary for nhm2_shift_lapse", () => {
    const result = calculateNatarioWarpBubble({
      ...baseParams,
      warpFieldType: "nhm2_shift_lapse",
      warpGridResolution: 12,
      alphaCenterline: 0.995,
      alphaGradientVec_m_inv: [0, 0, 5e-5],
      alphaInteriorSupportKind: "hull_interior",
      alphaWallTaper_m: 8,
    });
    expect(result.stressEnergySource).toBe("metric");
    expect(result.metricT00Source).toBe("metric");
    expect(result.metricT00Ref).toBe("warp.metric.T00.nhm2.shift_lapse");
    expect(result.metricAdapter?.family).toBe("nhm2_shift_lapse");
    expect(result.metricAdapter?.familyAuthorityStatus).toBe(
      "candidate_authoritative_solve_family",
    );
    expect(result.metricAdapter?.transportCertificationStatus).toBe(
      "bounded_transport_fail_closed_reference_only",
    );
    expect(result.familyAuthorityStatus).toBe("candidate_authoritative_solve_family");
    expect(result.transportCertificationStatus).toBe(
      "bounded_transport_fail_closed_reference_only",
    );
    expect(result.metricAdapter?.alpha).toBeCloseTo(0.995, 8);
    expect(result.lapseSummary).toEqual(
      expect.objectContaining({
        alphaCenterline: 0.995,
        alphaProfileKind: "linear_gradient_tapered",
        alphaGradientAxis: "z_zenith",
      }),
    );
  });

  it("uses metric-derived stress for irrotational fallback path", () => {
    const result = calculateNatarioWarpBubble({
      ...baseParams,
      warpFieldType: "irrotational",
    });
    expect(result.stressEnergySource).toBe("metric");
    expect(result.metricT00Source).toBe("metric");
    expect(result.metricT00Ref).toBe("warp.metric.T00.irrotational.shift");
    expect(result.metricT00).toBeDefined();
    expect(result.metricStressDiagnostics?.sampleCount ?? 0).toBeGreaterThan(0);
    expect(Number.isFinite(result.stressEnergyTensor.T00)).toBe(true);
  });

  it("applies epsilon tilt to Natario interior shift field", () => {
    const result = calculateNatarioWarpBubble({
      ...baseParams,
      shiftAmplitude: 0,
      epsilonTilt: 2e-7,
      betaTiltVec: [0, -1, 0],
    });
    const center = result.shiftVectorField.evaluateShiftVector(0, 0, 0);
    expect(center[1]).toBeLessThan(0);
    expect(Math.abs(center[1])).toBeGreaterThan(1e-9);
  });

  it("applies epsilon tilt to Natario SDF interior shift field", () => {
    const result = calculateNatarioWarpBubble({
      ...baseParams,
      warpFieldType: "natario_sdf",
      warpGridResolution: 12,
      shiftAmplitude: 0,
      epsilonTilt: 2e-7,
      betaTiltVec: [0, -1, 0],
    });
    const center = result.shiftVectorField.evaluateShiftVector(0, 0, 0);
    expect(center[1]).toBeLessThan(0);
    expect(Math.abs(center[1])).toBeGreaterThan(1e-10);
  });

  it("keeps current Natario unit-lapse semantics even when lapse inputs are present", () => {
    const result = calculateNatarioWarpBubble({
      ...baseParams,
      warpFieldType: "natario",
      alphaCenterline: 0.9,
      alphaGradientVec_m_inv: [0, 0, 1e-3],
      alphaProfileKind: "linear_gradient_tapered",
      alphaInteriorSupportKind: "bubble_interior",
      alphaWallTaper_m: 4,
      epsilonTilt: 2e-7,
      betaTiltVec: [0, -1, 0],
    });
    expect(result.metricT00Ref).toBe("warp.metric.T00.natario.shift");
    expect(result.metricAdapter?.family).toBe("natario");
    expect(result.metricAdapter?.alpha).toBe(1);
    expect(result.lapseSummary).toBeUndefined();
    const center = result.shiftVectorField.evaluateShiftVector(0, 0, 0);
    expect(center[1]).toBeLessThan(0);
  });

  it("uses the y-blend weight for trilinear interpolation in sampled shift evaluation", () => {
    const dims: [number, number, number] = [2, 2, 2];
    const values = new Float64Array(dims[0] * dims[1] * dims[2]);
    const idx = (i: number, j: number, k: number) => i + dims[0] * (j + dims[1] * k);
    for (let k = 0; k < dims[2]; k += 1) {
      for (let j = 0; j < dims[1]; j += 1) {
        for (let i = 0; i < dims[0]; i += 1) {
          values[idx(i, j, k)] = 100 * i + 10 * j + k;
        }
      }
    }

    const sample = trilinearInterpolateScalarGrid(values, dims, [0.25, 0.6, 0.2]);
    expect(sample).toBeCloseTo(31.2, 10);
  });
});
