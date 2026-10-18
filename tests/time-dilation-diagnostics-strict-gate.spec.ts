import { describe, expect, it, vi } from "vitest";
import { buildTimeDilationDiagnostics } from "../shared/time-dilation-diagnostics";
import {
  makeWarpMissionTimeComparisonFixture,
  makeWarpMissionTimeEstimatorFixture,
  makeWarpRouteTimeWorldlineFixture,
  makeWarpWorldlineFixture,
} from "./helpers/warp-worldline-fixture";

const basePipeline = {
  strictCongruence: true,
  hull: { Lx_m: 20, Ly_m: 10, Lz_m: 10 },
  warp: { metricT00Contract: { family: "natario" } },
};

const baseProofs = { values: {} };
const baseMath = { root: { id: "server/energy-pipeline.ts", stage: "certified", children: [{ id: "server/gr-evolve-brick.ts", stage: "certified", children: [] }] } };
const baseGrBrick = { meta: { status: "CERTIFIED" }, stats: { solverHealth: { status: "CERTIFIED" } }, dims: [1, 1, 1] };
const baseRegion = { summary: { wall: { detected: true, source: "kretschmann" } } };

function stubFetch(pipeline: any, proofs: any = baseProofs) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/helix/pipeline/proofs")) return { ok: true, json: async () => proofs } as Response;
    if (url.includes("/api/helix/math/graph")) return { ok: true, json: async () => baseMath } as Response;
    if (url.includes("/api/helix/gr-evolve-brick")) return { ok: true, json: async () => baseGrBrick } as Response;
    if (url.includes("/api/helix/lapse-brick")) return { ok: true, json: async () => ({}) } as Response;
    if (url.includes("/api/helix/gr-region-stats")) return { ok: true, json: async () => baseRegion } as Response;
    if (url.includes("/api/helix/pipeline")) return { ok: true, json: async () => pipeline } as Response;
    throw new Error(`unexpected url ${url}`);
  }) as unknown as typeof fetch);
}

describe("time dilation strict verification gate", () => {
  it("fails closed with deterministic id when certificate is missing", async () => {
    stubFetch({ ...basePipeline, viability: { integrityOk: true, constraints: [] } });
    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    expect(diagnostics.strict.grCertified).toBe(false);
    expect(diagnostics.strict.failId).toBe("ADAPTER_CERTIFICATE_MISSING");
    expect(diagnostics.strict.certifiedLabelsAllowed).toBe(false);
    expect(diagnostics.strict.strongClaimsAllowed).toBe(false);
  });

  it("fails closed with deterministic id when certificate integrity is false", async () => {
    stubFetch({
      ...basePipeline,
      viability: { certificateHash: "cert:1", integrityOk: false, constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }] },
    });
    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    expect(diagnostics.strict.grCertified).toBe(false);
    expect(diagnostics.strict.failId).toBe("ADAPTER_CERTIFICATE_INTEGRITY");
    expect(diagnostics.gate.reasons).toContain("verification:certificate_integrity_failed");
  });

  it("fails closed with deterministic id when hard constraints are unknown", async () => {
    stubFetch({
      ...basePipeline,
      viability: { certificateHash: "cert:1", integrityOk: true, constraints: [{ id: "FordRomanQI", severity: "HARD", status: "unknown" }] },
    });
    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    expect(diagnostics.strict.grCertified).toBe(false);
    expect(diagnostics.strict.failId).toBe("ADAPTER_CONSTRAINTS_UNKNOWN");
    expect(diagnostics.strict.failClosedReasons).toContain("hard_constraints_unknown");
  });

  it("reports ship-comoving dtau/dt observable with valid=false and missingFields when worldline inputs are absent", async () => {
    stubFetch({
      ...basePipeline,
      viability: {
        certificateHash: "cert:1",
        integrityOk: true,
        constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
      },
      warp: {
        metricT00Contract: { family: "natario" },
        metricAdapter: {
          alpha: 1,
          gammaDiag: [1, 1, 1],
        },
      },
    });
    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    expect(diagnostics.observables.ship_comoving_dtau_dt).toEqual(
      expect.objectContaining({
        observerFamily: "ship_comoving",
        valid: false,
      }),
    );
    expect(diagnostics.observables.ship_comoving_dtau_dt?.missingFields).toEqual(
      expect.arrayContaining(["shipKinematics.betaCoord", "shipKinematics.dxdt"]),
    );
    expect(diagnostics.congruence.requiredFieldsOk).toBe(false);
    expect(diagnostics.natarioCanonical.requiredFieldsOk).toBe(false);
    expect(diagnostics.natarioCanonical.reason).toBe(
      "natario_authoritative_divergence_missing",
    );
  });

  it("prefers brick-native div_beta proof values for Natario canonical checks when available", async () => {
    stubFetch(
      {
        ...basePipeline,
        viability: {
          certificateHash: "cert:1",
          integrityOk: true,
          constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
        },
        warp: {
          metricT00Contract: { family: "natario" },
          metricAdapter: {
            alpha: 1,
            gammaDiag: [1, 1, 1],
            betaDiagnostics: {
              method: "finite-diff",
              thetaRms: 8e-4,
              thetaMax: 9e-4,
            },
          },
        },
      },
      {
        values: {
          natario_expansion_tolerance: { value: 1e-3, proxy: false },
          theta_geom: { value: 2e-4, proxy: false },
          theta_metric_authoritative: { value: true, proxy: false },
          metric_k_trace_mean: { value: -2e-4, proxy: false },
          metric_k_trace_authoritative: { value: true, proxy: false },
          theta_k_tolerance: { value: 1e-3, proxy: false },
          metric_div_beta_authoritative: { value: true, proxy: false },
          metric_div_beta_rms: { value: 2e-4, proxy: false },
          metric_div_beta_max_abs: { value: 4e-4, proxy: false },
          metric_div_beta_source: { value: "gr_evolve_brick", proxy: false },
        },
      },
    );

    const diagnostics = await buildTimeDilationDiagnostics({
      baseUrl: "http://example.test",
      publish: false,
    });

    expect(diagnostics.natarioCanonical.requiredFieldsOk).toBe(true);
    expect(diagnostics.natarioCanonical.canonicalSatisfied).toBe(true);
    expect(diagnostics.natarioCanonical.authoritativeSourcePresent).toBe(true);
    expect(diagnostics.natarioCanonical.classificationMode).toBe("authoritative");
    expect(diagnostics.natarioCanonical.checks.divBeta).toEqual(
      expect.objectContaining({
        status: "pass",
        rms: 2e-4,
        maxAbs: 4e-4,
        source: "gr_evolve_brick",
      }),
    );
  });

  it("keeps projection diagnostics visible but blocks authoritative Natario canonical pass when brick-native div_beta proof values are absent", async () => {
    stubFetch(
      {
        ...basePipeline,
        viability: {
          certificateHash: "cert:1",
          integrityOk: true,
          constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
        },
        warp: {
          metricT00Contract: { family: "natario" },
          metricAdapter: {
            alpha: 1,
            gammaDiag: [1, 1, 1],
            betaDiagnostics: {
              method: "finite-diff",
              thetaRms: 2e-4,
              thetaMax: 4e-4,
            },
          },
        },
      },
      {
        values: {
          natario_expansion_tolerance: { value: 1e-3, proxy: false },
          theta_geom: { value: 2e-4, proxy: false },
          metric_k_trace_mean: { value: -2e-4, proxy: false },
          theta_k_tolerance: { value: 1e-3, proxy: false },
        },
      },
    );

    const diagnostics = await buildTimeDilationDiagnostics({
      baseUrl: "http://example.test",
      publish: false,
    });

    expect(diagnostics.natarioCanonical.requiredFieldsOk).toBe(false);
    expect(diagnostics.natarioCanonical.canonicalSatisfied).toBe(false);
    expect(diagnostics.natarioCanonical.authoritativeSourcePresent).toBe(false);
    expect(diagnostics.natarioCanonical.classificationMode).toBe(
      "projection_derived_only",
    );
    expect(diagnostics.natarioCanonical.projectionRequiredFieldsOk).toBe(true);
    expect(diagnostics.natarioCanonical.projectionCanonicalSatisfied).toBe(true);
    expect(diagnostics.natarioCanonical.reason).toBe(
      "natario_authoritative_divergence_missing_projection_only",
    );
    expect(diagnostics.natarioCanonical.checks.divBeta).toEqual(
      expect.objectContaining({
        status: "unknown",
        rms: null,
        maxAbs: null,
      }),
    );
    expect(diagnostics.natarioCanonical.checks.projectionDivBeta).toEqual(
      expect.objectContaining({
        status: "pass",
        rms: 2e-4,
        maxAbs: 4e-4,
        source: "pipeline.warp.metricAdapter.betaDiagnostics.thetaRms/thetaMax",
      }),
    );
  });

  it("surfaces brick-native divergence failure even when projection diagnostics look Natario-like", async () => {
    stubFetch(
      {
        ...basePipeline,
        viability: {
          certificateHash: "cert:1",
          integrityOk: true,
          constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
        },
        warp: {
          metricT00Contract: { family: "natario" },
          metricAdapter: {
            alpha: 1,
            gammaDiag: [1, 1, 1],
            betaDiagnostics: {
              method: "finite-diff",
              thetaRms: 2e-4,
              thetaMax: 4e-4,
            },
          },
        },
      },
      {
        values: {
          natario_expansion_tolerance: { value: 1e-3, proxy: false },
          theta_geom: { value: 2e-4, proxy: false },
          theta_metric_authoritative: { value: true, proxy: false },
          metric_k_trace_mean: { value: -2e-4, proxy: false },
          metric_k_trace_authoritative: { value: true, proxy: false },
          theta_k_tolerance: { value: 1e-3, proxy: false },
          metric_div_beta_authoritative: { value: true, proxy: false },
          metric_div_beta_rms: { value: 2e-2, proxy: false },
          metric_div_beta_max_abs: { value: 4e-2, proxy: false },
          metric_div_beta_source: { value: "gr_evolve_brick", proxy: false },
        },
      },
    );

    const diagnostics = await buildTimeDilationDiagnostics({
      baseUrl: "http://example.test",
      publish: false,
    });

    expect(diagnostics.natarioCanonical.requiredFieldsOk).toBe(true);
    expect(diagnostics.natarioCanonical.canonicalSatisfied).toBe(false);
    expect(diagnostics.natarioCanonical.classificationMode).toBe("authoritative");
    expect(diagnostics.natarioCanonical.reason).toBe(
      "natario_authoritative_divergence_constraint_failed",
    );
    expect(diagnostics.natarioCanonical.projectionCanonicalSatisfied).toBe(true);
    expect(diagnostics.natarioCanonical.checks.divBeta).toEqual(
      expect.objectContaining({
        status: "fail",
        rms: 2e-2,
        maxAbs: 4e-2,
        source: "gr_evolve_brick",
      }),
    );
    expect(diagnostics.natarioCanonical.checks.projectionDivBeta).toEqual(
      expect.objectContaining({
        status: "pass",
        rms: 2e-4,
        maxAbs: 4e-4,
      }),
    );
  });

  it("blocks authoritative Natario canonical pass when brick-native divergence is present but authoritative theta/K evidence is missing", async () => {
    stubFetch(
      {
        ...basePipeline,
        viability: {
          certificateHash: "cert:1",
          integrityOk: true,
          constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
        },
        warp: {
          metricT00Contract: { family: "natario" },
          metricAdapter: {
            alpha: 1,
            gammaDiag: [1, 1, 1],
            betaDiagnostics: {
              method: "finite-diff",
              thetaRms: 2e-4,
              thetaMax: 4e-4,
            },
          },
        },
      },
      {
        values: {
          natario_expansion_tolerance: { value: 1e-3, proxy: false },
          theta_geom: { value: 2e-4, proxy: false },
          metric_k_trace_mean: { value: -2e-4, proxy: false },
          theta_k_tolerance: { value: 1e-3, proxy: false },
          metric_div_beta_authoritative: { value: true, proxy: false },
          metric_div_beta_rms: { value: 2e-4, proxy: false },
          metric_div_beta_max_abs: { value: 4e-4, proxy: false },
          metric_div_beta_source: { value: "gr_evolve_brick", proxy: false },
        },
      },
    );

    const diagnostics = await buildTimeDilationDiagnostics({
      baseUrl: "http://example.test",
      publish: false,
    });

    expect(diagnostics.natarioCanonical.requiredFieldsOk).toBe(false);
    expect(diagnostics.natarioCanonical.canonicalSatisfied).toBe(false);
    expect(diagnostics.natarioCanonical.authoritativeSourcePresent).toBe(false);
    expect(diagnostics.natarioCanonical.classificationMode).toBe(
      "projection_derived_only",
    );
    expect(diagnostics.natarioCanonical.reason).toBe(
      "natario_authoritative_theta_k_missing_projection_only",
    );
  });



  it("surfaces tidal indicator as explicitly unavailable when E_ij tensor is missing", async () => {
    stubFetch({
      ...basePipeline,
      viability: {
        certificateHash: "cert:1",
        integrityOk: true,
        constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
      },
      warp: {
        metricT00Contract: { family: "natario" },
        metricAdapter: {
          alpha: 1,
          gammaDiag: [1, 1, 1],
        },
      },
    });

    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    expect(diagnostics.tidal).toEqual(
      expect.objectContaining({
        status: "unavailable",
        scalar: null,
        units: "1/s^2",
      }),
    );
    expect(diagnostics.tidal.unavailable).toEqual(
      expect.objectContaining({ deterministicBlockId: "TIDAL_E_IJ_MISSING" }),
    );
    expect(diagnostics.observables.tidal_indicator?.valid).toBe(false);
  });

  it("computes tidal indicator from pipeline E_ij tensor with provenance", async () => {
    stubFetch({
      ...basePipeline,
      viability: {
        certificateHash: "cert:1",
        integrityOk: true,
        constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
      },
      warp: {
        metricT00Contract: { family: "natario" },
        metricAdapter: {
          alpha: 1,
          gammaDiag: [1, 1, 1],
          tidalTensorEij: [
            [1, 2, 0],
            [2, 3, 0],
            [0, 0, 4],
          ],
        },
      },
    });

    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    expect(diagnostics.tidal.status).toBe("available");
    expect(diagnostics.tidal.scalar ?? 0).toBeCloseTo(Math.sqrt(34), 8);
    expect(diagnostics.tidal.provenance.source).toBe("pipeline.warp.metricAdapter.tidalTensorEij");
    expect(diagnostics.observables.tidal_indicator).toEqual(
      expect.objectContaining({
        valid: true,
        units: "1/s^2",
      }),
    );
  });
  it("computes ship-comoving dtau/dt from ADM variables when worldline inputs are present", async () => {
    stubFetch({
      ...basePipeline,
      viability: {
        certificateHash: "cert:1",
        integrityOk: true,
        constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
      },
      shipKinematics: {
        dxdt: [0.1, 0, 0],
        betaCoord: [0.2, 0, 0],
      },
      warp: {
        metricT00Contract: { family: "natario" },
        metricAdapter: {
          alpha: 1,
          gammaDiag: [1, 1, 1],
        },
      },
    });
    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    const dtauDt = diagnostics.observables.ship_comoving_dtau_dt;
    expect(dtauDt?.valid).toBe(true);
    expect(dtauDt?.missingFields).toEqual([]);
    expect(dtauDt?.value ?? 0).toBeCloseTo(Math.sqrt(1 - 0.3 * 0.3), 6);
    expect(dtauDt?.source).toBe("adm_worldline_proxy");
    expect(diagnostics.transport.warpWorldline.status).toBe("proxy");
    expect(diagnostics.transport.warpWorldline.certified).toBe(false);
  });

  it("prefers the certified warp worldline contract for solve-backed transport outputs when present", async () => {
    const warpWorldline = makeWarpWorldlineFixture();
    const warpRouteTimeWorldline = makeWarpRouteTimeWorldlineFixture(warpWorldline);
    const warpMissionTimeEstimator = makeWarpMissionTimeEstimatorFixture({
      worldline: warpWorldline,
      routeTime: warpRouteTimeWorldline,
    });
    stubFetch({
      ...basePipeline,
      viability: {
        certificateHash: "cert:1",
        integrityOk: true,
        constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
      },
      warpWorldline,
      warpRouteTimeWorldline,
      warpMissionTimeEstimator,
      warpMissionTimeComparison: makeWarpMissionTimeComparisonFixture({
        missionTimeEstimator: warpMissionTimeEstimator,
      }),
    });

    const diagnostics = await buildTimeDilationDiagnostics({
      baseUrl: "http://example.test",
      publish: false,
    });

    expect(diagnostics.observables.ship_comoving_dtau_dt).toEqual(
      expect.objectContaining({
        source: "warp_worldline_contract",
        valid: true,
      }),
    );
    expect(diagnostics.transport.warpWorldline).toEqual(
      expect.objectContaining({
        status: "solve_backed",
        certified: true,
        contractVersion: "warp_worldline_contract/v1",
        sourceSurface: "nhm2_metric_local_comoving_transport_cross",
        validityRegimeId: "nhm2_local_comoving_shell_cross",
        representativeSampleId: "centerline_center",
        sampleGeometryFamilyId: "nhm2_centerline_shell_cross",
        sampleCount: 9,
        transportInterpretation: "bounded_local_comoving_descriptor_not_speed",
        transportVariationStatus: "descriptor_and_dtau_varied",
        transportInformativenessStatus: "descriptor_informative_local_only",
        sampleFamilyAdequacy: "adequate_for_bounded_cruise_preflight",
        certifiedTransportMeaning: "bounded_local_shift_descriptor_gradient_only",
        eligibleNextProducts: ["bounded_cruise_envelope_preflight"],
        routeTimeStatus: "deferred",
      }),
    );
    expect(diagnostics.transport.warpWorldline.dtau_dt ?? 0).toBeCloseTo(0.8, 8);
    expect(diagnostics.transport.warpRouteTimeWorldline).toEqual(
      expect.objectContaining({
        status: "solve_backed",
        certified: true,
        contractVersion: "warp_route_time_worldline/v1",
        sourceSurface: "nhm2_metric_local_comoving_transport_cross",
        routeModelId: "nhm2_bounded_local_probe_lambda",
        routeParameterName: "lambda",
        progressionSampleCount: 5,
        sampleFamilyAdequacy: "adequate_for_bounded_cruise_preflight",
        routeTimeStatus: "bounded_local_segment_certified",
        nextEligibleProducts: ["mission_time_estimator"],
      }),
    );
    expect(diagnostics.transport.warpMissionTimeEstimator).toEqual(
      expect.objectContaining({
        status: "solve_backed",
        certified: true,
        contractVersion: "warp_mission_time_estimator/v1",
        sourceSurface: "nhm2_metric_local_comoving_transport_cross",
        estimatorModelId: "nhm2_repeated_local_probe_segment_estimator",
        targetId: "alpha-cen-a",
        targetName: "Alpha Centauri A",
        targetFrame: "heliocentric-icrs",
        routeTimeStatus: "bounded_local_segment_certified",
      }),
    );
    expect(
      diagnostics.transport.warpMissionTimeEstimator.coordinateTimeEstimate.seconds ??
        0,
    ).toBeGreaterThan(0);
    expect(
      diagnostics.transport.warpMissionTimeEstimator.properTimeEstimate.seconds ??
        0,
    ).toBeGreaterThan(0);
    expect(diagnostics.transport.warpMissionTimeComparison).toEqual(
      expect.objectContaining({
        status: "solve_backed",
        certified: true,
        contractVersion: "warp_mission_time_comparison/v1",
        comparisonModelId: "nhm2_classical_no_time_dilation_reference",
        targetId: "alpha-cen-a",
        targetName: "Alpha Centauri A",
        targetFrame: "heliocentric-icrs",
        comparisonInterpretationStatus:
          "bounded_relativistic_differential_detected",
        comparisonReadiness:
          "paired_classical_reference_certified_speed_comparators_deferred",
      }),
    );
    expect(
      diagnostics.transport.warpMissionTimeComparison.properMinusCoordinateSeconds ??
        Number.NaN,
    ).toBeLessThan(0);
    expect(
      diagnostics.transport.warpMissionTimeComparison.properMinusClassicalSeconds ??
        Number.NaN,
    ).toBeLessThan(0);
  });

  it("marks redshift unavailable when emitter/receiver worldline contract is missing", async () => {
    stubFetch({
      ...basePipeline,
      viability: {
        certificateHash: "cert:1",
        integrityOk: true,
        constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
      },
      redshift: {},
    });

    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    expect(diagnostics.redshift.status).toBe("unavailable");
    expect(diagnostics.redshift.unavailable?.deterministicBlockId).toBe("REDSHIFT_WORLDLINE_CONTRACT_MISSING");
    expect(diagnostics.observables.redshift?.valid).toBe(false);
  });

  it("falls back to explicit proxy redshift when transport vectors are missing", async () => {
    stubFetch({
      ...basePipeline,
      viability: {
        certificateHash: "cert:1",
        integrityOk: true,
        constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
      },
      redshift: {
        emitter: { uCovariant: [1, 0, 0, 0], id: "ship" },
        receiver: { uCovariant: [1, 0, 0, 0], id: "remote" },
        proxyZ: 0.05,
      },
    });

    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    expect(diagnostics.redshift.status).toBe("proxy");
    expect(diagnostics.redshift.z ?? 0).toBeCloseTo(0.05, 8);
    expect(diagnostics.redshift.proxy?.source).toBe("pipeline.redshift.proxyZ");
    expect(diagnostics.observables.redshift?.details).toEqual(
      expect.objectContaining({ status: "proxy", method: "proxy" }),
    );
  });

  it("computes reduced-order redshift from bounded null transport endpoint contractions", async () => {
    stubFetch({
      ...basePipeline,
      viability: {
        certificateHash: "cert:1",
        integrityOk: true,
        constraints: [{ id: "FordRomanQI", severity: "HARD", passed: true }],
      },
      redshift: {
        emitter: { uCovariant: [1, 0, 0, 0], id: "ship" },
        receiver: { uCovariant: [1, 0, 0, 0], id: "receiver" },
        kCovariantEmit: [2, 0, 0, 0],
        kCovariantRecv: [1.9, 0, 0, 0],
        transport: {
          bounded: true,
          stepCount: 24,
          maxSteps: 64,
          residual: 1e-7,
          residualTolerance: 1e-5,
        },
      },
    });

    const diagnostics = await buildTimeDilationDiagnostics({ baseUrl: "http://example.test", publish: false });
    expect(diagnostics.redshift.status).toBe("computed");
    expect(diagnostics.redshift.method).toBe("null_transport_reduced_order");
    expect(diagnostics.redshift.onePlusZ ?? 0).toBeCloseTo(2 / 1.9, 8);
    expect(diagnostics.observables.redshift).toEqual(
      expect.objectContaining({
        formula: "1+z = (k.u)_emit / (k.u)_recv",
        valid: true,
      }),
    );
  });

});
