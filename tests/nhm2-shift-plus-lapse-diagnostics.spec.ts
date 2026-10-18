import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  calculateEnergyPipeline,
  initializePipelineState,
  setGlobalPipelineState,
  updateParameters,
} from "../server/energy-pipeline.js";
import { buildGrEvolveBrick } from "../server/gr-evolve-brick.js";
import { buildEvolutionBrick } from "../server/gr/evolution/index.js";
import { createBssnState, gridFromBounds } from "../modules/gr/bssn-state";
import { buildTimeDilationDiagnostics } from "../shared/time-dilation-diagnostics";
import { buildShiftPlusLapseDiagnosticsPayload } from "../scripts/warp-shift-plus-lapse-diagnostics";
import {
  ADM_GRAVITY_DIAGNOSTIC_LANE_CONVENTIONS,
  ADM_GRAVITY_DIAGNOSTIC_LANE_ID,
} from "../shared/adm-gravity-diagnostic-lanes";
import { buildMildCabinGravityReferenceCalibration } from "../modules/warp/warp-metric-adapter";

const encodeFloat32 = (values: number[]) =>
  Buffer.from(new Float32Array(values).buffer).toString("base64");

const MILD_REFERENCE = buildMildCabinGravityReferenceCalibration({
  targetCabinGravity_si: 0.5 * 9.80665,
  targetCabinHeight_m: 2.5,
});
const MILD_GRADIENT_VEC: [number, number, number] = [
  0,
  0,
  MILD_REFERENCE.expectedAlphaGradientGeom,
];
const buildShiftLapsePatch = (state: any) => ({
  warpFieldType: "nhm2_shift_lapse",
  dynamicConfig: {
    ...(state.dynamicConfig ?? {}),
    warpFieldType: "nhm2_shift_lapse",
    alphaProfileKind: "linear_gradient_tapered",
    alphaCenterline: 1,
    alphaGradientVec_m_inv: MILD_GRADIENT_VEC,
    alphaInteriorSupportKind: "hull_interior",
    alphaWallTaper_m: 8,
  },
  alphaProfileKind: "linear_gradient_tapered",
  alphaCenterline: 1,
  alphaGradientVec_m_inv: MILD_GRADIENT_VEC,
  alphaInteriorSupportKind: "hull_interior",
  alphaWallTaper_m: 8,
});

describe("nhm2 shift-plus-lapse diagnostics", () => {
  it("preserves the structured lapse summary on the nhm2 shift-lapse pipeline adapter", async () => {
    let state = initializePipelineState();
    state = await updateParameters(
      state,
      buildShiftLapsePatch(state) as any,
      { includeReadinessSignals: true },
    );

    expect((state as any)?.warp?.lapseSummary).toEqual(
      expect.objectContaining({
        alphaProfileKind: "linear_gradient_tapered",
        alphaCenterline: 1,
        alphaGradientAxis: "z_zenith",
      }),
    );
    expect(
      (state as any)?.warp?.lapseSummary?.alphaGradientVec_m_inv?.[2] ?? 0,
    ).toBeCloseTo(MILD_REFERENCE.expectedAlphaGradientGeom, 24);
    expect((state as any)?.warp?.metricAdapter?.lapseSummary).toEqual(
      expect.objectContaining({
        alphaProfileKind: "linear_gradient_tapered",
        alphaCenterline: 1,
        alphaGradientAxis: "z_zenith",
      }),
    );
  });

  it("uses a mild-gravity reference gradient instead of the old stress-case fallback", () => {
    expect(MILD_REFERENCE.expectedAlphaGradientGeom).toBeGreaterThan(0);
    expect(MILD_REFERENCE.expectedAlphaGradientGeom).toBeLessThan(1e-15);
    expect(MILD_REFERENCE.expectedAlphaGradientGeom).toBeGreaterThan(5e-17);
    expect(MILD_REFERENCE.expectedAlphaGradientGeom).toBeLessThan(6e-17);
  });

  it("exports lapse-gradient, Eulerian acceleration, beta/alpha, and div_beta channels from the GR brick", () => {
    const bounds = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };
    const grid = gridFromBounds([3, 3, 3], bounds);
    const state = createBssnState(grid);
    const [nx, ny, nz] = grid.dims;

    let idx = 0;
    for (let k = 0; k < nz; k += 1) {
      const z = bounds.min[2] + (k + 0.5) * grid.spacing[2];
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          state.alpha[idx] = 1 + 0.05 * z;
          state.beta_x[idx] = 0.2;
          state.beta_y[idx] = 0.05;
          state.beta_z[idx] = 0;
          state.gamma_xx[idx] = 1;
          state.gamma_yy[idx] = 1;
          state.gamma_zz[idx] = 1;
          state.gamma_xy[idx] = 0;
          state.gamma_xz[idx] = 0;
          state.gamma_yz[idx] = 0;
          idx += 1;
        }
      }
    }

    const brick = buildEvolutionBrick({ state, includeConstraints: false });
    const accel = brick.channels.eulerian_accel_geom_mag?.data ?? new Float32Array();
    const ratio = brick.channels.beta_over_alpha_mag?.data ?? new Float32Array();
    const gradZ = brick.channels.alpha_grad_z?.data ?? new Float32Array();
    const divBeta = brick.channels.div_beta?.data ?? new Float32Array();

    expect(accel.length).toBe(state.alpha.length);
    expect(ratio.length).toBe(state.alpha.length);
    expect(gradZ.length).toBe(state.alpha.length);
    expect(divBeta.length).toBe(state.alpha.length);
    expect(Math.max(...Array.from(accel))).toBeGreaterThan(0);
    expect(Math.max(...Array.from(ratio))).toBeGreaterThan(0);
    expect(Math.max(...Array.from(gradZ))).toBeGreaterThan(0);
    expect(Math.max(...Array.from(divBeta).map((value) => Math.abs(value)))).toBeLessThan(1e-6);
    expect(Array.from(ratio).every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(brick.stats?.divBetaRms ?? NaN).toBeLessThan(1e-6);
    expect(brick.stats?.divBetaMaxAbs ?? NaN).toBeLessThan(1e-6);
  });

  it("threads shift-plus-lapse alpha gradients and beta/alpha diagnostics through the live GR evolve brick", async () => {
    let state = initializePipelineState();
    state = await updateParameters(
      state,
      buildShiftLapsePatch(state) as any,
      { includeReadinessSignals: true },
    );
    setGlobalPipelineState(state);

    const brick = buildGrEvolveBrick({
      dims: [24, 24, 24],
      includeMatter: false,
      includeConstraints: false,
      includeKij: false,
      includeInvariants: false,
    } as any);

    expect(brick.channels.alpha_grad_z?.data.length ?? 0).toBeGreaterThan(0);
    expect(brick.channels.eulerian_accel_geom_mag?.data.length ?? 0).toBeGreaterThan(0);
    expect(brick.channels.beta_over_alpha_mag?.data.length ?? 0).toBeGreaterThan(0);
    expect(brick.channels.div_beta?.data.length ?? 0).toBeGreaterThan(0);
    expect(brick.channels.beta_x?.max ?? 0).toBeGreaterThan(0);
    expect(brick.stats.stiffness?.betaOverAlphaMax ?? 0).toBeGreaterThan(0);
    expect(Number.isFinite(brick.stats.divBetaRms)).toBe(true);
    expect(Number.isFinite(brick.stats.divBetaMaxAbs)).toBe(true);
    expect(brick.stats.divBetaSource).toBe("gr_evolve_brick");
    expect(brick.stats.wallSafety?.betaOutwardOverAlphaWallMax ?? 0).toBeGreaterThanOrEqual(0);
    expect(brick.stats.wallSafety?.betaOutwardOverAlphaWallP98 ?? 0).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(brick.stats.wallSafety?.wallHorizonMargin)).toBe(true);
  });

  it("marks the calibrated mild reference as under-resolved on raw float32 channels and publishes analytic companions", async () => {
    const payload = await buildShiftPlusLapseDiagnosticsPayload();

    expect(payload.mildLapseFidelityStatus).toBe("mixed_source_prefer_analytic_for_underflow");
    expect(payload.channelPrecisionPolicy).toBe("mixed_source_prefer_analytic_for_underflow");
    expect(payload.underResolutionDetected).toBe(true);
    expect(payload.precisionContext).toEqual(
      expect.objectContaining({
        brickNumericType: "float32",
        companionNumericType: "float64_analytic",
        preferredCompanionSource: "analytic_lapse_summary_companion",
      }),
    );
    expect(
      payload.rawBrickDiagnostics?.lapseGradientDiagnostics?.alpha_grad_z?.absMax ?? 0,
    ).toBe(0);
    expect(
      payload.rawBrickDiagnostics?.eulerianAccelerationDiagnostics?.eulerian_accel_geom_mag
        ?.absMax ?? 0,
    ).toBe(0);
    expect(
      payload.analyticCompanionDiagnostics?.lapseGradientDiagnostics?.alpha_grad_z?.absMax ?? 0,
    ).toBeGreaterThan(0);
    expect(
      payload.analyticCompanionDiagnostics?.eulerianAccelerationDiagnostics
        ?.eulerian_accel_geom_mag?.absMax ?? 0,
    ).toBeGreaterThan(0);
    expect(
      payload.effectiveDiagnostics?.lapseGradientDiagnostics?.alpha_grad_z?.source,
    ).toBe("analytic_lapse_summary_companion");
    expect(
      payload.effectiveDiagnostics?.eulerianAccelerationDiagnostics?.eulerian_accel_geom_mag
        ?.source,
    ).toBe("analytic_lapse_summary_companion");
  });

  it("emits centerline and cabin lapse observables with explicit units", async () => {
    const pipeline = {
      strictCongruence: true,
      hull: { Lx_m: 20, Ly_m: 10, Lz_m: 20 },
      warp: {
        metricT00Contract: { family: "nhm2_shift_lapse" },
        metricAdapter: {
          family: "nhm2_shift_lapse",
          alpha: 1,
          gammaDiag: [1, 1, 1],
          lapseSummary: {
            alphaCenterline: 1,
            alphaMin: 0.99,
            alphaMax: 1.01,
            alphaProfileKind: "linear_gradient_tapered",
            alphaGradientAxis: "z_zenith",
          },
        },
      },
      viability: {
        certificateHash: "cert:1",
        integrityOk: true,
        constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
      },
    };
    const baseMath = {
      root: {
        id: "server/energy-pipeline.ts",
        stage: "certified",
        children: [{ id: "server/gr-evolve-brick.ts", stage: "certified", children: [] }],
      },
    };
    const grBrick = {
      meta: { status: "CERTIFIED" },
      stats: { solverHealth: { status: "CERTIFIED" } },
      dims: [1, 1, 3],
      bounds: { min: [-10, -5, -5], max: [10, 5, 5] },
      channels: {
        alpha: { data: encodeFloat32([0.99, 1.0, 1.01]) },
        eulerian_accel_geom_mag: { data: encodeFloat32([0.01, 0.02, 0.03]) },
      },
    };
    const baseProofs = { values: {} };
    const baseRegion = { summary: { wall: { detected: true, source: "kretschmann" } } };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/helix/pipeline/proofs")) {
          return { ok: true, json: async () => baseProofs } as Response;
        }
        if (url.includes("/api/helix/math/graph")) {
          return { ok: true, json: async () => baseMath } as Response;
        }
        if (url.includes("/api/helix/gr-evolve-brick")) {
          return { ok: true, json: async () => grBrick } as Response;
        }
        if (url.includes("/api/helix/lapse-brick")) {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url.includes("/api/helix/gr-region-stats")) {
          return { ok: true, json: async () => baseRegion } as Response;
        }
        if (url.includes("/api/helix/pipeline")) {
          return { ok: true, json: async () => pipeline } as Response;
        }
        throw new Error(`unexpected url ${url}`);
      }) as unknown as typeof fetch,
    );

    const diagnostics = await buildTimeDilationDiagnostics({
      baseUrl: "http://example.test",
      publish: false,
    });

    expect(diagnostics.observables.centerline_alpha).toEqual(
      expect.objectContaining({
        units: "dimensionless",
        valid: true,
        value: 1,
      }),
    );
    expect(diagnostics.observables.cabin_clock_split_fraction).toEqual(
      expect.objectContaining({
        units: "dimensionless",
        valid: true,
      }),
    );
    expect(
      diagnostics.observables.cabin_clock_split_fraction?.value ?? 0,
    ).toBeCloseTo(0.02, 6);
    expect(diagnostics.observables.cabin_gravity_gradient_geom).toEqual(
      expect.objectContaining({
        units: "1/m",
        valid: true,
      }),
    );
    expect(
      diagnostics.observables.cabin_gravity_gradient_geom?.value ?? 0,
    ).toBeCloseTo(0.02, 6);
    expect(diagnostics.observables.cabin_gravity_gradient_si?.units).toBe("m/s^2");
    expect(diagnostics.observables.cabin_clock_split_fraction?.details).toEqual(
      expect.objectContaining({
        cabinSampleAxis: "z_zenith",
        cabinSamplePolicy: "symmetric_centerline_z_quarter_hull_v1",
      }),
    );
  });

  it("keeps the ADM gravity contract reference-only and aligned with the exported lane id", () => {
    const contractPath = path.join(
      process.cwd(),
      "configs",
      "adm-gravity-diagnostic-contract.v1.json",
    );
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    expect(contract.baseline_lane_id).toBe(ADM_GRAVITY_DIAGNOSTIC_LANE_ID);
    expect(contract.authoritative_status.contract_is_authoritative_for_readiness).toBe(false);
    expect(contract.authoritative_status.contract_is_reference_only).toBe(true);
    expect(contract.lanes[0]?.lane_id).toBe(ADM_GRAVITY_DIAGNOSTIC_LANE_ID);
    expect(
      ADM_GRAVITY_DIAGNOSTIC_LANE_CONVENTIONS[ADM_GRAVITY_DIAGNOSTIC_LANE_ID]
        ?.is_authoritative_for_readiness,
    ).toBe(false);
  });

  it("keeps nhm2 shift-lapse as a candidate family while transport proof surfaces remain fail-closed", async () => {
    let state = initializePipelineState();
    state = await updateParameters(
      state,
      buildShiftLapsePatch(state) as any,
      { includeReadinessSignals: true },
    );

    const refreshed = await calculateEnergyPipeline(state);

    expect((refreshed as any).warp?.metricT00Contract?.family).toBe("nhm2_shift_lapse");
    expect((refreshed as any).warp?.metricT00Contract?.familyAuthorityStatus).toBe(
      "candidate_authoritative_solve_family",
    );
    expect((refreshed as any).warp?.metricT00Contract?.transportCertificationStatus).toBe(
      "bounded_transport_fail_closed_reference_only",
    );
    expect((refreshed as any).warpInHullProperAcceleration ?? null).toBeNull();
  });

  it("publishes a scenario id and calibration block on the latest reduced-order artifact", () => {
    const artifactPath = path.join(
      process.cwd(),
      "artifacts",
      "research",
      "full-solve",
      "nhm2-shift-plus-lapse-diagnostics-latest.json",
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    expect(artifact.scenarioId).toBe("mild_cabin_gravity_reference");
    expect(artifact.referenceCalibration).toEqual(
      expect.objectContaining({
        targetCabinGravity_si: 0.5 * 9.80665,
        targetCabinHeight_m: 2.5,
      }),
    );
    expect(artifact.alphaProfileMetadata).toEqual(
      expect.objectContaining({
        scenarioId: "mild_cabin_gravity_reference",
        referenceCalibration: expect.objectContaining({
          expectedAlphaGradientGeom: MILD_REFERENCE.expectedAlphaGradientGeom,
        }),
      }),
    );
    expect(artifact.precisionContext).toEqual(
      expect.objectContaining({
        brickNumericType: "float32",
        companionNumericType: "float64_analytic",
      }),
    );
    expect(artifact.branch).toEqual(
      expect.objectContaining({
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus: "bounded_transport_fail_closed_reference_only",
      }),
    );
    expect(artifact.proofPolicy).toEqual(
      expect.objectContaining({
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus: "bounded_transport_fail_closed_reference_only",
        boundedTransportFailClosed: true,
      }),
    );
    expect(artifact.underResolutionDetected).toBe(true);
    expect(artifact.precisionContext?.wallSafetySource).toBe("brick_float32_direct");
    expect(artifact.cabinObservables?.details).toEqual(
      expect.objectContaining({
        source: "analytic_lapse_summary_fallback",
        centerlineAlphaSource: expect.any(String),
        topBottomAlphaSource: expect.any(String),
        gravityGradientSource: expect.any(String),
        usedAnalyticLapseSamples: expect.any(Boolean),
        usedAnalyticGradientCompanion: expect.any(Boolean),
      }),
    );
  });
});
