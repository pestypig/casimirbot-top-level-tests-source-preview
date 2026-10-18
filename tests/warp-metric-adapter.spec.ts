import { describe, expect, it } from "vitest";
import {
  buildWarpMetricAdapterSnapshot,
  evaluateBoundedLapse,
  evaluateWarpMetricLapseField,
  resolveWarpShiftLapseProfileStrict,
} from "../modules/warp/warp-metric-adapter";

describe("buildWarpMetricAdapterSnapshot", () => {
  it("defaults dtGammaPolicy based on chart label", () => {
    const lab = buildWarpMetricAdapterSnapshot({
      family: "natario",
      chart: { label: "lab_cartesian" },
    });
    expect(lab.chart.dtGammaPolicy).toBe("computed");
    expect(lab.chart.contractStatus).toBe("unknown");

    const comoving = buildWarpMetricAdapterSnapshot({
      family: "natario",
      chart: { label: "comoving_cartesian" },
    });
    expect(comoving.chart.dtGammaPolicy).toBe("assumed_zero");
    expect(comoving.chart.contractStatus).toBe("ok");
  });

  it("annotates dtGammaPolicy overrides in chart notes", () => {
    const snap = buildWarpMetricAdapterSnapshot({
      family: "alcubierre",
      chart: {
        label: "lab_cartesian",
        dtGammaPolicy: "assumed_zero",
        notes: "user note",
      },
    });

    expect(snap.chart.dtGammaPolicy).toBe("assumed_zero");
    expect(snap.chart.notes).toContain("user note");
    expect(snap.chart.notes).toContain("dtGammaPolicy override");
    expect(snap.chart.notes).toContain("lab_cartesian");
    expect(snap.chart.contractStatus).toBe("override");
  });

  it("computes finite-diff diagnostics when a shift field is provided", () => {
    const snap = buildWarpMetricAdapterSnapshot({
      family: "natario",
      shiftVectorField: {
        evaluateShiftVector: (x, y, z) => [x, y, z],
      },
      sampleScale_m: 2,
      sampleCount: 16,
    });

    expect(snap.betaDiagnostics?.method).toBe("finite-diff");
    expect(snap.betaDiagnostics?.thetaMax).toBeCloseTo(3, 6);
    expect(snap.betaDiagnostics?.thetaRms).toBeCloseTo(3, 6);
    expect(snap.betaDiagnostics?.divBetaMaxAbs).toBeCloseTo(3, 6);
    expect(snap.betaDiagnostics?.divBetaRms).toBeCloseTo(3, 6);
    expect(snap.betaDiagnostics?.curlMax ?? 0).toBeLessThan(1e-8);
    expect(snap.betaDiagnostics?.sampleCount ?? 0).toBeGreaterThan(0);
  });

  it("normalizes legacy divBeta aliases onto the canonical theta diagnostics schema", () => {
    const snap = buildWarpMetricAdapterSnapshot({
      family: "natario",
      betaDiagnostics: {
        method: "hodge-grid",
        divBetaMaxAbs: 0.25,
        divBetaRms: 0.125,
      },
    });

    expect(snap.betaDiagnostics).toEqual(
      expect.objectContaining({
        thetaMax: 0.25,
        thetaRms: 0.125,
        divBetaMaxAbs: 0.25,
        divBetaRms: 0.125,
      }),
    );
  });

  it("applies VdB conformal derivative correction to theta diagnostics", () => {
    const snap = buildWarpMetricAdapterSnapshot({
      family: "vdb",
      chart: { label: "comoving_cartesian" },
      shiftVectorField: {
        amplitude: 0.2,
        evaluateShiftVector: (x, y, z) => [x, y, z],
      },
      sampleScale_m: 2,
      sampleCount: 16,
      vdbConformalDiagnostics: {
        bMin: 10,
        bMax: 40,
        bprimeMin: -8,
        bprimeMax: 8,
        bdoubleMin: -12,
        bdoubleMax: 12,
      },
    });

    expect(snap.betaDiagnostics?.method).toBe("finite-diff+conformal");
    expect(snap.betaDiagnostics?.thetaConformalMax).toBeGreaterThan(0);
    expect(snap.betaDiagnostics?.bPrimeOverBMax).toBeGreaterThan(0);
    expect(snap.betaDiagnostics?.thetaMax ?? 0).toBeGreaterThan(3);
    expect(String(snap.betaDiagnostics?.note ?? "")).toContain(
      "VdB conformal correction",
    );
  });

  it("preserves lapse summaries and evaluates a nontrivial spatial alpha field", () => {
    const snap = buildWarpMetricAdapterSnapshot({
      family: "nhm2_shift_lapse",
      alpha: 0.995,
      lapseSummary: {
        alphaCenterline: 0.995,
        alphaMin: 0.99,
        alphaMax: 1.01,
        alphaProfileKind: "linear_gradient_tapered",
        alphaGradientAxis: "z_zenith",
        alphaGradientVec_m_inv: [0, 0, 5e-5],
        alphaInteriorSupportKind: "hull_interior",
        alphaWallTaper_m: 8,
      },
    });

    expect(snap.family).toBe("nhm2_shift_lapse");
    expect(snap.lapseSummary).toEqual(
      expect.objectContaining({
        alphaCenterline: 0.995,
        alphaGradientAxis: "z_zenith",
      }),
    );

    const center = evaluateWarpMetricLapseField({
      lapseSummary: snap.lapseSummary,
      point: [0, 0, 0],
      hullAxes: [10, 10, 10],
      bubbleRadius_m: 10,
    });
    const above = evaluateWarpMetricLapseField({
      lapseSummary: snap.lapseSummary,
      point: [0, 0, 5],
      hullAxes: [10, 10, 10],
      bubbleRadius_m: 10,
    });

    expect(center).toBeCloseTo(0.995, 8);
    expect(above).toBeGreaterThan(center);
    expect(above).toBeLessThanOrEqual(1.01);
  });

  it("evaluates bounded lapse with centerline alpha as the only dial", () => {
    expect(evaluateBoundedLapse(1, 0.8)).toBeCloseTo(0.8, 12);
    expect(evaluateBoundedLapse(0, 0.8)).toBeCloseTo(1, 12);
    expect(evaluateBoundedLapse(0.5, 0.8)).toBeCloseTo(0.9, 12);
  });

  it("rejects unknown shift+lapse profiles in strict resolver mode", () => {
    expect(() => resolveWarpShiftLapseProfileStrict("not-a-real-profile")).toThrow(
      /Unknown shift-lapse profile id/i,
    );
    expect(resolveWarpShiftLapseProfileStrict("stage1_centerline_alpha_0p5000_v1").alphaCenterlineDefault).toBeCloseTo(
      0.5,
      12,
    );
  });
});
