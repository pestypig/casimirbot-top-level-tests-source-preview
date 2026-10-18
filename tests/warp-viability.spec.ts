import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  pipeline: {} as any,
}));

const mocks = vi.hoisted(() => ({
  calculateEnergyPipeline: vi.fn(async (state: any) => ({ ...state, ...runtime.pipeline })),
  initializePipelineState: vi.fn(() => ({
    dutyCycle: 0.1,
    hull: { Lx_m: 2, Ly_m: 2, Lz_m: 2, wallThickness_m: 0.1 },
    bubble: { R: 1, sigma: 0.1 },
    R: 1,
    tileArea_cm2: 1,
    gammaGeo: 1,
  })),
  loadWarpAgentsConfig: vi.fn(async () => ({})),
  findWarpConstraint: vi.fn(() => undefined),
  resolveConstraintSeverity: vi.fn((_cfg: unknown, _id: string, fallback: any) => fallback),
}));

vi.mock("../server/energy-pipeline", () => ({
  calculateEnergyPipeline: mocks.calculateEnergyPipeline,
  initializePipelineState: mocks.initializePipelineState,
  MODE_CONFIGS: { hover: { zeta_max: 1 } },
  PAPER_GEO: { RADIAL_LAYERS: 1, PACKING: 1 },
}));

vi.mock("../modules/physics/warpAgents", () => ({
  loadWarpAgentsConfig: mocks.loadWarpAgentsConfig,
  findWarpConstraint: mocks.findWarpConstraint,
  resolveConstraintSeverity: mocks.resolveConstraintSeverity,
}));

import { evaluateWarpViability } from "../tools/warpViability";
import { buildNhm2ObserverAuditArtifact } from "../shared/contracts/nhm2-observer-audit.v1";
import { buildNhm2SourceClosureArtifact } from "../shared/contracts/nhm2-source-closure.v1";
import { buildNhm2SourceClosureArtifactV2 } from "../shared/contracts/nhm2-source-closure.v2";
import { buildNhm2StrictSignalReadinessArtifact } from "../shared/contracts/nhm2-strict-signal-readiness.v1";
import { buildNhm2QeiWorldlineDossier } from "../shared/contracts/nhm2-qei-worldline-dossier.v1";
import { buildNhm2NatarioInvariantAudit } from "../shared/contracts/nhm2-natario-invariant-audit.v1";
import { buildIdealCasimirMaterialReceipt } from "../shared/contracts/casimir-material-receipt.v1";
import { SI_TO_GEOM_STRESS } from "../shared/gr-units";
import {
  makeShiftLapseTransportPromotionGateFixture,
  makeShiftLapseWarpWorldlineFixture,
  makeWarpMissionTimeComparisonFixture,
  makeWarpMissionTimeEstimatorFixture,
} from "./helpers/warp-worldline-fixture";

const makePipeline = (overrides: Record<string, unknown> = {}) => ({
  currentMode: "hover",
  hull: { Lx_m: 2, Ly_m: 2, Lz_m: 2, wallThickness_m: 0.1 },
  dutyCycle: 0.1,
  dutyShip: 0.1,
  d_eff: 0.1,
  gammaGeo: 2,
  gammaVanDenBroeck: 1,
  qSpoilingFactor: 1,
  N_tiles: 4,
  tileArea_cm2: 1,
  U_static: -1,
  TS_ratio: 120,
  tsMetricDerived: true,
  tsMetricDerivedSource: "warp.metricAdapter+clocking",
  tsMetricDerivedReason: "TS_ratio from proper-distance timing with explicit chart contract",
  M_exotic: 0.5,
  zeta: 0.5,
  fordRomanCompliance: true,
  natarioConstraint: true,
  overallStatus: "NOMINAL",
  sectorPeriod_ms: 1,
  P_avg: 0.001,
  exoticMassTarget_kg: 1,
  gr: {
    constraints: {
      rho_constraint: { mean: -1.5, rms: 0.1, maxAbs: 0.2 },
      H_constraint: { rms: 1e-4, maxAbs: 1e-3 },
      M_constraint: { rms: 1e-4, maxAbs: 1e-3 },
    },
    matter: { stressEnergy: { avgT00: -1.4 } },
    gauge: { lapseMin: 1, betaMaxAbs: 0.1 },
  },
  qiGuardrail: {
    marginRatio: 0.5,
    lhs_Jm3: -1,
    bound_Jm3: -2,
    rhoSource: "warp.metric.T00.natario.shift",
  },
  ...overrides,
});

const buildPassingQeiWorldlineDossier = () =>
  buildNhm2QeiWorldlineDossier({
    generatedAt: "2026-06-09T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p9625_v1",
    worldlines: [
      {
        worldlineId: "qei:wall:guardrail",
        regionId: "wall",
        chartId: "comoving_cartesian",
        samplingFunction: {
          kind: "gaussian",
          tauSeconds: 1e-9,
          normalized: true,
        },
        sampledRho: {
          valueSI: -1,
          provenanceRef: "warp.metric.T00.nhm2.shift_lapse",
          status: "computed",
        },
        bound: {
          valueSI: 0,
          provenanceRef: "ford_roman_1996_quantum_inequality",
          status: "literature_bound",
        },
        margin: {
          valueSI: 1,
          pass: true,
        },
        consistency: {
          tauVsDuty: "pass",
          tauVsLightCrossing: "pass",
          tauVsModulation: "pass",
        },
      },
    ],
  });

const buildPassingNatarioInvariantAudit = () =>
  buildNhm2NatarioInvariantAudit({
    generatedAt: "2026-06-09T00:00:00.000Z",
    laneId: "nhm2_shift_lapse",
    selectedProfileId: "stage1_centerline_alpha_0p9625_v1",
    metricFamily: "nhm2_shift_lapse",
    expansion: {
      thetaMaxAbs: 0,
      thetaFlatnessStatus: "pass",
      expansionLeakageBound: 1e-9,
    },
    invariants: {
      ricciScalar: 0,
      kretschmannScalar: 0,
      weylScalarProxy: 0,
      petrovClass: "O",
    },
    momentumDensity: {
      Jx: 0,
      Jy: 0,
      Jz: 0,
    },
    stability: {
      tidalMax: 0,
      blueshiftMax: 0,
      convergenceStatus: "pass",
    },
  });

const buildPassingObserverAudit = () =>
  buildNhm2ObserverAuditArtifact({
    familyId: "nhm2_shift_lapse",
    metricRequired: {
      tensorRef: "warp.metricStressEnergy",
      rapidityCap: 2.5,
      rapidityCapBeta: Math.tanh(2.5),
      typeI: { count: 64, fraction: 1, tolerance: 1e-9 },
      conditions: {
        nec: {
          eulerianMin: 0.2,
          eulerianMean: 0.2,
          robustMin: 0.15,
          robustMean: 0.15,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: -0.05,
          severityGainMean: -0.05,
          maxRobustMinusEulerian: -0.05,
          worstCase: { index: 0, value: 0.15, direction: [1, 0, 0], rapidity: 0.4, source: "capped_search" },
        },
        wec: {
          eulerianMin: 0.2,
          eulerianMean: 0.2,
          robustMin: 0.14,
          robustMean: 0.14,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: -0.06,
          severityGainMean: -0.06,
          maxRobustMinusEulerian: -0.06,
          worstCase: { index: 0, value: 0.14, direction: [1, 0, 0], rapidity: 0.4, source: "capped_search" },
        },
        sec: {
          eulerianMin: 0.18,
          eulerianMean: 0.18,
          robustMin: 0.12,
          robustMean: 0.12,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: -0.06,
          severityGainMean: -0.06,
          maxRobustMinusEulerian: -0.06,
          worstCase: { index: 0, value: 0.12, direction: [1, 0, 0], rapidity: 0.4, source: "capped_search" },
        },
        dec: {
          eulerianMin: 0.16,
          eulerianMean: 0.16,
          robustMin: 0.11,
          robustMean: 0.11,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: -0.05,
          severityGainMean: -0.05,
          maxRobustMinusEulerian: -0.05,
          worstCase: { index: 0, value: 0.11, direction: [1, 0, 0], rapidity: 0.4, source: "capped_search" },
        },
      },
      fluxDiagnostics: {
        status: "available",
        meanMagnitude: 0.05,
        maxMagnitude: 0.1,
        netMagnitude: 0.01,
        netDirection: [1, 0, 0],
      },
      model: {
        pressureModel: "diagonal_tensor_components",
        fluxHandling: "explicit_metric_tensor_flux",
        shearHandling: "explicit_metric_tensor_shear",
        limitationNotes: [],
      },
    },
    tileEffective: {
      tensorRef: "warp.tileEffectiveStressEnergy",
      rapidityCap: 2.5,
      rapidityCapBeta: Math.tanh(2.5),
      typeI: { count: 64, fraction: 1, tolerance: 1e-9 },
      conditions: {
        nec: {
          eulerianMin: 0.18,
          eulerianMean: 0.18,
          robustMin: 0.12,
          robustMean: 0.12,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: -0.06,
          severityGainMean: -0.06,
          maxRobustMinusEulerian: -0.06,
          worstCase: { index: 1, value: 0.12, direction: [0, 1, 0], rapidity: 0.5, source: "capped_search" },
        },
        wec: {
          eulerianMin: 0.17,
          eulerianMean: 0.17,
          robustMin: 0.11,
          robustMean: 0.11,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: -0.06,
          severityGainMean: -0.06,
          maxRobustMinusEulerian: -0.06,
          worstCase: { index: 1, value: 0.11, direction: [0, 1, 0], rapidity: 0.5, source: "capped_search" },
        },
        sec: {
          eulerianMin: 0.16,
          eulerianMean: 0.16,
          robustMin: 0.1,
          robustMean: 0.1,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: -0.06,
          severityGainMean: -0.06,
          maxRobustMinusEulerian: -0.06,
          worstCase: { index: 1, value: 0.1, direction: [0, 1, 0], rapidity: 0.5, source: "capped_search" },
        },
        dec: {
          eulerianMin: 0.14,
          eulerianMean: 0.14,
          robustMin: 0.09,
          robustMean: 0.09,
          eulerianViolationFraction: 0,
          robustViolationFraction: 0,
          missedViolationFraction: 0,
          severityGainMin: -0.05,
          severityGainMean: -0.05,
          maxRobustMinusEulerian: -0.05,
          worstCase: { index: 1, value: 0.09, direction: [0, 1, 0], rapidity: 0.5, source: "capped_search" },
        },
      },
      fluxDiagnostics: {
        status: "available",
        meanMagnitude: 0.06,
        maxMagnitude: 0.12,
        netMagnitude: 0.02,
        netDirection: [0, 1, 0],
      },
      model: {
        pressureModel: "voxel_tensor_components",
        fluxHandling: "voxel_flux_field",
        shearHandling: "voxel_shear_field",
        limitationNotes: [],
      },
    },
  });

describe("warp viability congruence wiring", () => {
  const strictEnv = process.env.WARP_STRICT_CONGRUENCE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WARP_STRICT_CONGRUENCE = "1";
    runtime.pipeline = makePipeline({
      thetaCal: 10,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: {
          family: "natario",
          chart: { label: "comoving_cartesian" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
    });
  });

  it("propagates metricT00Ref into CL3 source and details", async () => {
    const result = await evaluateWarpViability({});
    const cl3 = result.constraints.find((c) => c.id === "CL3_RhoDelta");
    expect(result.snapshot.rho_delta_metric_source).toBe(
      "warp.metric.T00.natario.shift",
    );
    expect(result.snapshot.rho_delta_metric_chart).toBe("comoving_cartesian");
    expect(result.snapshot.rho_delta_metric_family).toBe("natario");
    expect(result.snapshot.thetaCal).toBe(10);
    expect(result.snapshot.theta_audit).toBe(0.5);
    expect(result.snapshot.theta_metric_derived).toBe(true);
    expect(result.snapshot.theta_metric_reason).toBe("metric_adapter_divergence");
    expect((result.snapshot as any).theta_provenance_class).toBe("measured");
    expect((result.snapshot as any).theta_confidence_band).toEqual({ low: 0.8, high: 0.99 });
    const ts = result.constraints.find((c) => c.id === "TS_ratio_min");
    expect((ts as any)?.provenance_class).toBe("measured");
    expect((ts as any)?.claim_tier).toBe("certified");
    expect((ts as any)?.confidence_band).toEqual({ low: 0.8, high: 0.99 });
    expect((result.snapshot as any).warp_mechanics_provenance_class).toBe("measured");
    expect((result.snapshot as any).warp_mechanics_claim_tier).toBe("reduced-order");
    expect((result.snapshot as any).warp_mechanics_promotion_reason).toBe("hard_constraint_failed");
    expect((result.snapshot as any).warp_mechanics_promotion_counterexample_class).toBe(
      "hard_constraint_regression",
    );
    expect((result.snapshot as any).warp_mechanics_promotion_replay).toMatchObject({
      version: "promotion-replay-pack/v1",
      outcome: {
        tier: "reduced-order",
        reason: "hard_constraint_failed",
        counterexample_class: "hard_constraint_regression",
        conservative_downgrade: true,
      },
    });
    expect(
      String((result.snapshot as any).warp_mechanics_promotion_replay?.deterministic_key ?? ""),
    ).toContain("reason=hard_constraint_failed");
    expect(cl3?.details).toContain("source=warp.metric.T00.natario.shift");
    expect(cl3?.details).not.toContain("T00_ref=n/a");
  });

  it("falls back to natario metric T00 source when warp metric T00 is absent", async () => {
    runtime.pipeline = makePipeline({
      warp: {
        metricAdapter: { betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" } },
      },
      natario: {
        metricT00: -42,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario_sdf.shift",
      },
    });

    const result = await evaluateWarpViability({});
    const cl3 = result.constraints.find((c) => c.id === "CL3_RhoDelta");
    expect(result.snapshot.rho_delta_metric_source).toBe(
      "warp.metric.T00.natario_sdf.shift",
    );
    expect(cl3?.details).toContain("source=warp.metric.T00.natario_sdf.shift");
    expect(cl3?.details).not.toContain("T00_ref=n/a");
  });

  it("accepts Natário chart contract metadata when warp adapter chart metadata is missing", async () => {
    runtime.pipeline = makePipeline({
      warp: {
        metricAdapter: { betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" } },
      },
      natario: {
        metricT00: -42,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        chartLabel: "natario_comoving",
        chartContractStatus: "ok",
        metricT00Observer: "eulerian_n",
        metricT00Normalization: "si_stress",
        metricT00UnitSystem: "SI",
        metricT00ContractStatus: "ok",
      },
    });

    const result = await evaluateWarpViability({});
    expect((result.snapshot as any).rho_delta_metric_source).toBe("warp.metric.T00.natario.shift");
    expect((result.snapshot as any).rho_delta_metric_chart).toBe("natario_comoving");
    expect((result.snapshot as any).rho_delta_metric_contract_status).toBe("ok");
    expect((result.snapshot as any).rho_delta_metric_contract_ok).toBe(true);
    const cl3 = result.constraints.find((c) => c.id === "CL3_RhoDelta");
    expect(cl3?.details).toContain("contract=ok");
    expect(cl3?.note).not.toBe("metric_source_missing");
  });

  it("emits failing CL3_RhoDelta when metric-derived T00 is missing", async () => {
    runtime.pipeline = makePipeline({
      warp: {
        metricAdapter: { betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" } },
      },
    });

    const result = await evaluateWarpViability({});
    expect(result.constraints.map((c) => c.id)).toContain("CL3_RhoDelta");
    const cl3 = result.constraints.find((c) => c.id === "CL3_RhoDelta");
    expect(result.snapshot.rho_delta_source).toBe("metric-missing");
    expect(cl3?.passed).toBe(false);
    expect(cl3?.note).toBe("metric_source_missing");
    expect(cl3?.details).toContain("reason=missing_metric_t00");
  });

  it("fails ThetaAudit on proxy theta in strict mode and allows it when strict is disabled", async () => {
    runtime.pipeline = makePipeline({
      thetaCal: 42,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
      },
    });

    const strictResult = await evaluateWarpViability({});
    const strictTheta = strictResult.constraints.find((c) => c.id === "ThetaAudit");
    expect(strictTheta?.passed).toBe(false);
    expect(strictTheta?.note).toBe("proxy_input");

    runtime.pipeline = makePipeline({
      thetaCal: 42,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: {
          betaDiagnostics: { method: "not-computed", thetaMax: 42 },
        },
      },
    });
    const strictProxyResult = await evaluateWarpViability({});
    const strictProxyTheta = strictProxyResult.constraints.find(
      (c) => c.id === "ThetaAudit",
    );
    expect(strictProxyTheta?.passed).toBe(false);
    expect(strictProxyTheta?.note).toBe("proxy_input");
    expect(strictProxyResult.snapshot.theta_metric_derived).toBe(false);
    expect(strictProxyResult.snapshot.theta_metric_reason).toBe("theta_geom_proxy");
    expect(strictProxyResult.snapshot.theta_audit).toBe(42);

    process.env.WARP_STRICT_CONGRUENCE = "0";
    const relaxedResult = await evaluateWarpViability({});
    const relaxedTheta = relaxedResult.constraints.find((c) => c.id === "ThetaAudit");
    expect(relaxedTheta?.passed).toBe(true);
  });

  it("fails ThetaAudit in strict mode when chart contract metadata is missing", async () => {
    runtime.pipeline = makePipeline({
      thetaCal: 10,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: {
          chart: { label: "comoving_cartesian", contractStatus: "unknown" },
          betaDiagnostics: { method: "finite-diff", thetaMax: 0.5 },
        },
      },
    });

    const result = await evaluateWarpViability({});
    const theta = result.constraints.find((c) => c.id === "ThetaAudit");
    expect(theta?.passed).toBe(false);
    expect(theta?.note).toBe("chart_contract_missing");
    expect(result.snapshot.theta_chart_contract_status).toBe("unknown");
    expect(result.snapshot.theta_chart_contract_ok).toBe(false);
  });

  it("emits a combined shift-lapse advisory block from GR gauge diagnostics", async () => {
    runtime.pipeline = makePipeline({
      gr: {
        constraints: {
          rho_constraint: { mean: -1.5, rms: 0.1, maxAbs: 0.2 },
          H_constraint: { rms: 1e-4, maxAbs: 1e-3 },
          M_constraint: { rms: 1e-4, maxAbs: 1e-3 },
        },
        matter: { stressEnergy: { avgT00: -1.4 } },
        gauge: {
          lapseMin: 0.97,
          betaMaxAbs: 0.1,
          betaOverAlphaMax: 0.83,
          betaOverAlphaP98: 0.71,
          betaOutwardOverAlphaWallMax: 0.62,
          betaOutwardOverAlphaWallP98: 0.58,
          wallHorizonMargin: 0.38,
        },
      },
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
        metricAdapter: {
          family: "nhm2_shift_lapse",
          chart: { label: "comoving_cartesian" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
    });

    const result = await evaluateWarpViability({});
    expect((result.snapshot as any).grGuardrails?.combinedShiftLapseSafety).toEqual(
      expect.objectContaining({
        status: "pass",
        betaOverAlphaMax: 0.83,
        betaOverAlphaP98: 0.71,
        betaOutwardOverAlphaWallMax: 0.62,
        betaOutwardOverAlphaWallP98: 0.58,
        wallHorizonMargin: 0.38,
        note:
          "Combined shift/lapse safety remains advisory-only for this diagnostics-first branch.",
      }),
    );
  });

  it("surfaces tensor closure separately from CL3 scalar congruence", async () => {
    runtime.pipeline = makePipeline({
      gr: {
        constraints: {
          rho_constraint: { mean: -100 * SI_TO_GEOM_STRESS, rms: 0.1, maxAbs: 0.2 },
          H_constraint: { rms: 1e-4, maxAbs: 1e-3 },
          M_constraint: { rms: 1e-4, maxAbs: 1e-3 },
        },
        matter: { stressEnergy: { avgT00: -100 } },
        gauge: { lapseMin: 1, betaMaxAbs: 0.1 },
      },
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
        metricT00Observer: "eulerian_n",
        metricT00Normalization: "si_stress",
        metricT00UnitSystem: "SI",
        metricT00ContractStatus: "ok",
        metricAdapter: {
          family: "nhm2_shift_lapse",
          chart: { label: "comoving_cartesian", contractStatus: "ok" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
      nhm2SourceClosure: buildNhm2SourceClosureArtifact({
        metricTensorRef: "warp.metricStressEnergy",
        tileEffectiveTensorRef: "warp.tileEffectiveStressEnergy",
        metricRequiredTensor: {
          T00: -100,
          T11: 100,
          T22: 100,
          T33: 100,
        },
        tileEffectiveTensor: {
          T00: -100,
          T11: 60,
          T22: 55,
          T33: 50,
        },
        toleranceRelLInf: 0.1,
        scalarCl3RhoDeltaRel: 0,
      }),
    });

    const result = await evaluateWarpViability({});
    const cl3 = result.constraints.find((c) => c.id === "CL3_RhoDelta");

    expect(cl3?.passed).toBe(true);
    expect((result.snapshot as any).nhm2_source_closure_status).toBe("fail");
    expect((result.snapshot as any).nhm2_source_closure_completeness).toBe("complete");
    expect((result.snapshot as any).nhm2_source_closure_reason_codes).toContain(
      "tensor_residual_exceeded",
    );
    expect((result.snapshot as any).nhm2_source_closure_t00_rel).toBe(0);
    expect((result.snapshot as any).nhm2_source_closure_cl3_secondary).toBe(true);
  });

  it("surfaces Casimir material receipt status in the viability snapshot", async () => {
    runtime.pipeline = makePipeline({
      casimirMaterialReceipt: buildIdealCasimirMaterialReceipt({
        generatedAt: "2026-06-09T00:00:00.000Z",
        tileBatchId: "tile_batch:ideal",
        gapMeters: 1e-9,
        temperatureK: 20,
      }),
    });

    const result = await evaluateWarpViability({});

    expect((result.snapshot as any).casimir_material_receipt_status).toBe(
      "ideal_scalar_only",
    );
    expect((result.snapshot as any).casimir_material_receipt_model_kind).toBe(
      "perfect_conductor_ideal",
    );
    expect((result.snapshot as any).casimir_material_receipt?.contractVersion).toBe(
      "casimir_material_receipt/v1",
    );
  });

  it("surfaces the emitted NHM2 observer artifact with dual tensor states and model labels", async () => {
    runtime.pipeline = makePipeline({
      nhm2ObserverAudit: buildNhm2ObserverAuditArtifact({
        metricRequired: {
          tensorRef: "warp.metricStressEnergy",
          rapidityCap: 2.5,
          rapidityCapBeta: Math.tanh(2.5),
          conditions: {
            nec: {
              eulerianMin: 0.3,
              eulerianMean: 0.3,
              robustMin: 0.2,
              robustMean: 0.2,
              eulerianViolationFraction: 0,
              robustViolationFraction: 0,
              missedViolationFraction: 0,
              severityGainMin: -0.1,
              severityGainMean: -0.1,
              maxRobustMinusEulerian: -0.1,
              worstCase: {
                index: 0,
                value: 0.2,
                direction: [1, 0, 0],
                rapidity: null,
                source: "algebraic_type_i",
              },
            },
            wec: {
              eulerianMin: 0.2,
              eulerianMean: 0.2,
              robustMin: 0.15,
              robustMean: 0.15,
              eulerianViolationFraction: 0,
              robustViolationFraction: 0,
              missedViolationFraction: 0,
              severityGainMin: -0.05,
              severityGainMean: -0.05,
              maxRobustMinusEulerian: -0.05,
              worstCase: {
                index: 0,
                value: 0.15,
                direction: [1, 0, 0],
                rapidity: null,
                source: "algebraic_type_i",
              },
            },
            sec: {
              eulerianMin: 0.18,
              eulerianMean: 0.18,
              robustMin: 0.12,
              robustMean: 0.12,
              eulerianViolationFraction: 0,
              robustViolationFraction: 0,
              missedViolationFraction: 0,
              severityGainMin: -0.06,
              severityGainMean: -0.06,
              maxRobustMinusEulerian: -0.06,
              worstCase: {
                index: 0,
                value: 0.12,
                direction: [1, 0, 0],
                rapidity: null,
                source: "algebraic_type_i",
              },
            },
            dec: {
              eulerianMin: 0.14,
              eulerianMean: 0.14,
              robustMin: 0.1,
              robustMean: 0.1,
              eulerianViolationFraction: 0,
              robustViolationFraction: 0,
              missedViolationFraction: 0,
              severityGainMin: -0.04,
              severityGainMean: -0.04,
              maxRobustMinusEulerian: -0.04,
              worstCase: {
                index: 0,
                value: 0.1,
                direction: [1, 0, 0],
                rapidity: null,
                source: "algebraic_type_i",
              },
            },
          },
          fluxDiagnostics: {
            status: "assumed_zero",
            meanMagnitude: 0,
            maxMagnitude: 0,
            netMagnitude: 0,
            netDirection: null,
          },
          model: {
            pressureModel: "diagonal_tensor_components",
            fluxHandling: "assumed_zero_from_missing_t0i",
            shearHandling: "assumed_zero_from_missing_tij",
            limitationNotes: ["metric diagonal-only observer audit"],
          },
          missingInputs: ["metric_t0i_missing"],
        },
        tileEffective: {
          tensorRef: "warp.tileEffectiveStressEnergy",
          typeI: { count: 100, fraction: 0.9, tolerance: 1e-9 },
          conditions: {
            nec: {
              eulerianMin: 0.12,
              eulerianMean: 0.12,
              robustMin: 0.08,
              robustMean: 0.08,
              eulerianViolationFraction: 0,
              robustViolationFraction: 0,
              missedViolationFraction: 0,
              severityGainMin: -0.04,
              severityGainMean: -0.04,
              maxRobustMinusEulerian: -0.04,
              worstCase: {
                index: 2,
                value: 0.08,
                direction: [0, 1, 0],
                rapidity: 0.7,
                source: "capped_search",
              },
            },
            wec: {
              eulerianMin: 0.1,
              eulerianMean: 0.1,
              robustMin: -0.05,
              robustMean: -0.05,
              eulerianViolationFraction: 0,
              robustViolationFraction: 1,
              missedViolationFraction: 1,
              severityGainMin: -0.15,
              severityGainMean: -0.15,
              maxRobustMinusEulerian: -0.15,
              worstCase: {
                index: 2,
                value: -0.05,
                direction: [0, 1, 0],
                rapidity: 0.7,
                source: "capped_search",
              },
            },
            sec: {
              eulerianMin: 0.09,
              eulerianMean: 0.09,
              robustMin: 0.01,
              robustMean: 0.01,
              eulerianViolationFraction: 0,
              robustViolationFraction: 0,
              missedViolationFraction: 0,
              severityGainMin: -0.08,
              severityGainMean: -0.08,
              maxRobustMinusEulerian: -0.08,
              worstCase: {
                index: 2,
                value: 0.01,
                direction: [0, 1, 0],
                rapidity: 0.7,
                source: "capped_search",
              },
            },
            dec: {
              eulerianMin: 0.07,
              eulerianMean: 0.07,
              robustMin: -0.02,
              robustMean: -0.02,
              eulerianViolationFraction: 0,
              robustViolationFraction: 1,
              missedViolationFraction: 1,
              severityGainMin: -0.09,
              severityGainMean: -0.09,
              maxRobustMinusEulerian: -0.09,
              worstCase: {
                index: 2,
                value: -0.02,
                direction: [0, 1, 0],
                rapidity: 0.7,
                source: "capped_search",
              },
            },
          },
          fluxDiagnostics: {
            status: "available",
            meanMagnitude: 0.4,
            maxMagnitude: 1.1,
            netMagnitude: 0.02,
            netDirection: [0, 1, 0],
          },
          model: {
            pressureModel: "isotropic_pressure_proxy",
            fluxHandling: "voxel_flux_field",
            shearHandling: "not_modeled_in_proxy",
            limitationNotes: ["isotropic pressure proxy"],
          },
        },
      }),
    });

    const result = await evaluateWarpViability({});

    expect((result.snapshot as any).nhm2_observer_audit_status).toBe("fail");
    expect((result.snapshot as any).nhm2_observer_audit_completeness).toBe(
      "incomplete",
    );
    expect((result.snapshot as any).nhm2_metric_observer_status).toBe("review");
    expect((result.snapshot as any).nhm2_metric_observer_flux_status).toBe(
      "assumed_zero",
    );
    expect((result.snapshot as any).nhm2_metric_observer_pressure_model).toBe(
      "diagonal_tensor_components",
    );
    expect((result.snapshot as any).nhm2_tile_observer_status).toBe("fail");
    expect((result.snapshot as any).nhm2_tile_observer_type_i_fraction).toBe(0.9);
    expect((result.snapshot as any).nhm2_tile_observer_flux_status).toBe(
      "available",
    );
    expect((result.snapshot as any).nhm2_tile_observer_pressure_model).toBe(
      "isotropic_pressure_proxy",
    );
  });

  it("surfaces the emitted NHM2 strict-signal artifact without inferring proxy or missing states", async () => {
    runtime.pipeline = makePipeline({
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
        metricAdapter: {
          family: "nhm2_shift_lapse",
          chart: { label: "comoving_cartesian", contractStatus: "ok" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
      nhm2StrictSignalReadiness: buildNhm2StrictSignalReadinessArtifact({
        strictModeEnabled: true,
        familyId: "nhm2_shift_lapse",
        theta: {
          metricDerived: false,
          provenance: "proxy",
          sourcePath: "pipeline.thetaCal",
          reasonCode: "theta_geom_proxy",
        },
        ts: {
          metricDerived: false,
          provenance: "proxy",
          sourcePath: "hardware_timing",
          reasonCode: "hardware_timing",
          reason: "clocking provenance is hardware telemetry",
        },
        qi: {
          metricDerived: null,
          provenance: "missing",
          sourcePath: null,
          rhoSource: null,
          reasonCode: "strict_signal_missing",
          applicabilityStatus: null,
        },
      }),
    });

    const result = await evaluateWarpViability({});

    expect((result.snapshot as any).nhm2_strict_signal_status).toBe("fail");
    expect((result.snapshot as any).nhm2_strict_signal_completeness).toBe("incomplete");
    expect((result.snapshot as any).nhm2_theta_signal_provenance).toBe("proxy");
    expect((result.snapshot as any).nhm2_theta_signal_source).toBe("pipeline.thetaCal");
    expect((result.snapshot as any).nhm2_theta_signal_reason_code).toBe("theta_geom_proxy");
    expect((result.snapshot as any).nhm2_ts_signal_provenance).toBe("proxy");
    expect((result.snapshot as any).nhm2_ts_signal_source).toBe("hardware_timing");
    expect((result.snapshot as any).nhm2_ts_signal_reason_code).toBe("hardware_timing");
    expect((result.snapshot as any).nhm2_qi_signal_status).toBe("unavailable");
    expect((result.snapshot as any).nhm2_qi_signal_provenance).toBe("missing");
    expect((result.snapshot as any).nhm2_qi_applicability_status).toBeUndefined();
    expect((result.snapshot as any).nhm2_strict_signal_ready).toBe(false);
  });

  it("emits a separate NHM2 full-loop audit layer with explicit missing evidence blockers", async () => {
    const gate = makeShiftLapseTransportPromotionGateFixture({
      shiftLapseProfileId: "stage1_centerline_alpha_0p9625_v1",
      shiftLapseProfileStage: "stage1",
      shiftLapseProfileLabel: "alpha=0.9625",
      shiftLapseProfileNote: "selected family profile",
      centerlineAlpha: 0.9625,
      centerlineDtauDt: 0.9625,
    });
    const worldline = makeShiftLapseWarpWorldlineFixture(undefined, gate);
    const missionTimeEstimator = makeWarpMissionTimeEstimatorFixture({ worldline });
    const missionTimeComparison = makeWarpMissionTimeComparisonFixture({
      missionTimeEstimator,
    });

    runtime.pipeline = makePipeline({
      gr: {
        constraints: {
          rho_constraint: { mean: -100 * SI_TO_GEOM_STRESS, rms: 1e-4, maxAbs: 1e-4 },
          H_constraint: { rms: 1e-4, maxAbs: 1e-3 },
          M_constraint: { rms: 1e-4, maxAbs: 1e-3 },
        },
        matter: { stressEnergy: { avgT00: -100 } },
        gauge: {
          lapseMin: 1,
          betaMaxAbs: 0.1,
          betaOverAlphaMax: 0.2,
          betaOverAlphaP98: 0.18,
          betaOutwardOverAlphaWallMax: 0.15,
          betaOutwardOverAlphaWallP98: 0.12,
          wallHorizonMargin: 0.4,
        },
      },
      qiGuardrail: {
        marginRatio: 0.2,
        lhs_Jm3: -1,
        bound_Jm3: -5,
        rhoSource: "warp.metric.T00.nhm2.shift_lapse",
        applicabilityStatus: "PASS",
      },
      shiftLapseTransportPromotionGate: gate,
      warpMissionTimeEstimator: missionTimeEstimator,
      warpMissionTimeComparison: missionTimeComparison,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
        metricT00Observer: "eulerian_n",
        metricT00Normalization: "si_stress",
        metricT00UnitSystem: "SI",
        metricT00ContractStatus: "ok",
        metricAdapter: {
          family: "nhm2_shift_lapse",
          chart: { label: "comoving_cartesian", contractStatus: "ok" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
      nhm2StrictSignalReadiness: buildNhm2StrictSignalReadinessArtifact({
        strictModeEnabled: true,
        familyId: "nhm2_shift_lapse",
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus: "bounded_transport_proof_bearing_gate_admitted",
        lapseSummary: {
          alphaCenterline: 0.9625,
          alphaMin: 0.95,
          alphaMax: 1,
          alphaProfileKind: "selected_profile",
          alphaGradientAxis: "centerline",
          shiftLapseProfileId: gate.shiftLapseProfileId,
          shiftLapseProfileStage: gate.shiftLapseProfileStage,
          shiftLapseProfileLabel: gate.shiftLapseProfileLabel,
          shiftLapseProfileNote: gate.shiftLapseProfileNote,
          signConvention: "dtau_dt_equals_alpha_for_zero_coordinate_velocity",
        },
        theta: {
          metricDerived: true,
          provenance: "metric",
          sourcePath: "warp.metricAdapter.betaDiagnostics.thetaMax",
        },
        ts: {
          metricDerived: true,
          provenance: "metric",
          sourcePath: "warp.metricAdapter.ts",
        },
        qi: {
          metricDerived: true,
          provenance: "metric",
          sourcePath: "qiGuardrail",
          rhoSource: "warp.metric.T00.nhm2.shift_lapse",
          applicabilityStatus: "PASS",
        },
      }),
      nhm2SourceClosure: buildNhm2SourceClosureArtifact({
        metricTensorRef: "warp.metricStressEnergy",
        tileEffectiveTensorRef: "warp.tileEffectiveStressEnergy",
        metricRequiredTensor: {
          T00: -100,
          T11: 30,
          T22: 30,
          T33: 30,
        },
        tileEffectiveTensor: {
          T00: -100,
          T11: 30,
          T22: 30,
          T33: 30,
        },
        toleranceRelLInf: 0.1,
        scalarCl3RhoDeltaRel: 0,
      }),
      nhm2QeiWorldlineDossier: buildPassingQeiWorldlineDossier(),
      nhm2NatarioInvariantAudit: buildPassingNatarioInvariantAudit(),
      nhm2ObserverAudit: buildPassingObserverAudit(),
    });

    const result = await evaluateWarpViability({});
    const layer = result.policyLayers?.nhm2_full_loop_audit;

    expect(layer).toBeTruthy();
    expect(layer?.policyId).toBe("nhm2_full_loop_audit");
    expect(layer?.artifact.sections.mission_time_outputs.state).toBe("pass");
    expect(layer?.artifact.sections.strict_signal_readiness.state).toBe("pass");
    expect(
      layer?.artifact.sections.strict_signal_readiness.qeiWorldlineDossier?.summary
        .dossierComplete,
    ).toBe(true);
    expect((result.snapshot as any).nhm2_qei_worldline_dossier_complete).toBe(true);
    expect((result.snapshot as any).nhm2_qei_worldline_dossier_has_wall).toBe(true);
    expect(layer?.artifact.sections.source_closure.state).toBe("review");
    expect(layer?.artifact.sections.source_closure.reasons).toContain(
      "source_closure_version_lag",
    );
    expect(layer?.artifact.sections.observer_audit.state).toBe("pass");
    expect(
      layer?.artifact.sections.observer_audit.observerRobustEnergyConditions
        ?.metricRequired?.summary.robustCheckComplete,
    ).toBe(true);
    expect(layer?.artifact.sections.shift_vs_lapse_decomposition.reasons).toContain(
      "shift_lapse_decomposition_missing",
    );
    expect(layer?.artifact.sections.natario_invariant_audit.state).toBe("pass");
    expect((result.snapshot as any).nhm2_full_loop_natario_invariant_audit_status).toBe(
      "pass",
    );
    expect(
      layer?.artifact.sections.uncertainty_perturbation_reproducibility.reasons,
    ).toEqual(
      expect.arrayContaining(["perturbation_suite_missing", "reproducibility_missing"]),
    );
    expect((result.snapshot as any).nhm2_full_loop_audit_status).toBe(layer?.state);
    expect((result.snapshot as any).nhm2_full_loop_blocking_reasons).toContain(
      "shift_lapse_decomposition_missing",
    );
  });

  it("accepts nhm2 source-closure v2 and preserves regional fail semantics", async () => {
    const gate = makeShiftLapseTransportPromotionGateFixture({
      shiftLapseProfileId: "stage1_centerline_alpha_0p9625_v1",
      shiftLapseProfileStage: "stage1",
      shiftLapseProfileLabel: "alpha=0.9625",
      shiftLapseProfileNote: "selected family profile",
      centerlineAlpha: 0.9625,
      centerlineDtauDt: 0.9625,
    });
    const worldline = makeShiftLapseWarpWorldlineFixture(undefined, gate);
    const missionTimeEstimator = makeWarpMissionTimeEstimatorFixture({ worldline });
    const missionTimeComparison = makeWarpMissionTimeComparisonFixture({
      missionTimeEstimator,
    });

    runtime.pipeline = makePipeline({
      gr: {
        constraints: {
          rho_constraint: { mean: -100 * SI_TO_GEOM_STRESS, rms: 1e-4, maxAbs: 1e-4 },
          H_constraint: { rms: 1e-4, maxAbs: 1e-3 },
          M_constraint: { rms: 1e-4, maxAbs: 1e-3 },
        },
        matter: { stressEnergy: { avgT00: -100 } },
        gauge: {
          lapseMin: 1,
          betaMaxAbs: 0.1,
          betaOverAlphaMax: 0.2,
          betaOverAlphaP98: 0.18,
          betaOutwardOverAlphaWallMax: 0.15,
          betaOutwardOverAlphaWallP98: 0.12,
          wallHorizonMargin: 0.4,
        },
      },
      qiGuardrail: {
        marginRatio: 0.2,
        lhs_Jm3: -1,
        bound_Jm3: -5,
        rhoSource: "warp.metric.T00.nhm2.shift_lapse",
        applicabilityStatus: "PASS",
      },
      shiftLapseTransportPromotionGate: gate,
      warpMissionTimeEstimator: missionTimeEstimator,
      warpMissionTimeComparison: missionTimeComparison,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
        metricT00Observer: "eulerian_n",
        metricT00Normalization: "si_stress",
        metricT00UnitSystem: "SI",
        metricT00ContractStatus: "ok",
        metricAdapter: {
          family: "nhm2_shift_lapse",
          chart: { label: "comoving_cartesian", contractStatus: "ok" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
      nhm2StrictSignalReadiness: buildNhm2StrictSignalReadinessArtifact({
        strictModeEnabled: true,
        familyId: "nhm2_shift_lapse",
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus: "bounded_transport_proof_bearing_gate_admitted",
        lapseSummary: {
          alphaCenterline: 0.9625,
          alphaMin: 0.95,
          alphaMax: 1,
          alphaProfileKind: "selected_profile",
          alphaGradientAxis: "centerline",
          shiftLapseProfileId: gate.shiftLapseProfileId,
          shiftLapseProfileStage: gate.shiftLapseProfileStage,
          shiftLapseProfileLabel: gate.shiftLapseProfileLabel,
          shiftLapseProfileNote: gate.shiftLapseProfileNote,
          signConvention: "dtau_dt_equals_alpha_for_zero_coordinate_velocity",
        },
        theta: {
          metricDerived: true,
          provenance: "metric",
          sourcePath: "warp.metricAdapter.betaDiagnostics.thetaMax",
        },
        ts: {
          metricDerived: true,
          provenance: "metric",
          sourcePath: "warp.metricAdapter.ts",
        },
        qi: {
          metricDerived: true,
          provenance: "metric",
          sourcePath: "qiGuardrail",
          rhoSource: "warp.metric.T00.nhm2.shift_lapse",
          applicabilityStatus: "PASS",
        },
      }),
      // basis-accounting diagnostics for source-closure regions
      nhm2SourceClosure: (() => {
        const makeAccounting = (count: number) => ({
          sampleCount: count,
          maskVoxelCount: count,
          weightSum: count,
          aggregationMode: "mean" as const,
          normalizationBasis: "sample_count",
          regionMaskNote: "mask",
          supportInclusionNote: "note",
          evidenceStatus: "measured" as const,
        });
        return buildNhm2SourceClosureArtifactV2({
          metricTensorRef: "warp.metricStressEnergy",
          tileEffectiveTensorRef: "warp.tileEffectiveStressEnergy",
          metricRequiredTensor: {
            T00: -100,
            T11: 30,
            T22: 30,
            T33: 30,
          },
          tileEffectiveTensor: {
            T00: -100,
            T11: 30,
            T22: 30,
            T33: 30,
          },
          requiredRegionIds: ["hull", "wall", "exterior_shell"],
          regionComparisons: [
            {
              regionId: "hull",
              comparisonBasisStatus: "same_basis",
              metricTensorRef: "artifact://metric-hull",
              tileTensorRef: "artifact://tile-hull",
              metricRequiredTensor: { T00: -100, T11: 30, T22: 30, T33: 30 },
              tileEffectiveTensor: { T00: -5, T11: 1, T22: 1, T33: 1 },
              sampleCount: 12,
              metricAccounting: makeAccounting(12),
              tileAccounting: makeAccounting(12),
            },
            {
              regionId: "wall",
              comparisonBasisStatus: "same_basis",
              metricTensorRef: "artifact://metric-wall",
              tileTensorRef: "artifact://tile-wall",
              metricRequiredTensor: { T00: -100, T11: 30, T22: 30, T33: 30 },
              tileEffectiveTensor: { T00: -100, T11: 30, T22: 30, T33: 30 },
              sampleCount: 6,
              metricAccounting: makeAccounting(6),
              tileAccounting: makeAccounting(6),
            },
            {
              regionId: "exterior_shell",
              comparisonBasisStatus: "same_basis",
              metricTensorRef: "artifact://metric-exterior",
              tileTensorRef: "artifact://tile-exterior",
              metricRequiredTensor: { T00: -100, T11: 30, T22: 30, T33: 30 },
              tileEffectiveTensor: { T00: -100, T11: 30, T22: 30, T33: 30 },
              sampleCount: 6,
              metricAccounting: makeAccounting(6),
              tileAccounting: makeAccounting(6),
            },
          ],
          toleranceRelLInf: 0.1,
          scalarCl3RhoDeltaRel: 0,
        });
      })(),
      nhm2QeiWorldlineDossier: buildPassingQeiWorldlineDossier(),
      nhm2ObserverAudit: buildPassingObserverAudit(),
    });

    const result = await evaluateWarpViability({});
    const layer = result.policyLayers?.nhm2_full_loop_audit;

    expect(layer).toBeTruthy();
    expect(layer?.artifact.sections.source_closure.state).toBe("fail");
    expect(layer?.artifact.sections.source_closure.reasons).toContain(
      "source_closure_residual_exceeded",
    );
    expect(layer?.artifact.sections.source_closure.reasons).not.toContain(
      "source_closure_missing",
    );
    expect(layer?.artifact.sections.source_closure.assumptionsDrifted).toBe(true);
    expect(layer?.artifact.sections.source_closure.residualByRegion.hull).toBeGreaterThan(0.1);
    expect(layer?.artifact.sections.source_closure.leadBlocker).toMatchObject({
      regionId: "hull",
      kind: "regional_residual_exceeded",
      metricT00Ref: "artifact://metric-hull",
      tileT00Ref: "artifact://tile-hull",
    });
  });

  it("maps missing source-closure tolerance to a conservative NHM2 blocker", async () => {
    const gate = makeShiftLapseTransportPromotionGateFixture({
      shiftLapseProfileId: "stage1_centerline_alpha_0p9625_v1",
      shiftLapseProfileStage: "stage1",
      shiftLapseProfileLabel: "alpha=0.9625",
      shiftLapseProfileNote: "selected family profile",
      centerlineAlpha: 0.9625,
      centerlineDtauDt: 0.9625,
    });
    const worldline = makeShiftLapseWarpWorldlineFixture(undefined, gate);
    const missionTimeEstimator = makeWarpMissionTimeEstimatorFixture({ worldline });
    const missionTimeComparison = makeWarpMissionTimeComparisonFixture({
      missionTimeEstimator,
    });

    runtime.pipeline = makePipeline({
      gr: {
        constraints: {
          rho_constraint: { mean: -100 * SI_TO_GEOM_STRESS, rms: 1e-4, maxAbs: 1e-4 },
          H_constraint: { rms: 1e-4, maxAbs: 1e-3 },
          M_constraint: { rms: 1e-4, maxAbs: 1e-3 },
        },
        matter: { stressEnergy: { avgT00: -100 } },
        gauge: {
          lapseMin: 1,
          betaMaxAbs: 0.1,
          betaOverAlphaMax: 0.2,
          betaOverAlphaP98: 0.18,
          betaOutwardOverAlphaWallMax: 0.15,
          betaOutwardOverAlphaWallP98: 0.12,
          wallHorizonMargin: 0.4,
        },
      },
      qiGuardrail: {
        marginRatio: 0.2,
        lhs_Jm3: -1,
        bound_Jm3: -5,
        rhoSource: "warp.metric.T00.nhm2.shift_lapse",
        applicabilityStatus: "PASS",
      },
      shiftLapseTransportPromotionGate: gate,
      warpMissionTimeEstimator: missionTimeEstimator,
      warpMissionTimeComparison: missionTimeComparison,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.nhm2.shift_lapse",
        metricT00Observer: "eulerian_n",
        metricT00Normalization: "si_stress",
        metricT00UnitSystem: "SI",
        metricT00ContractStatus: "ok",
        metricAdapter: {
          family: "nhm2_shift_lapse",
          chart: { label: "comoving_cartesian", contractStatus: "ok" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
      nhm2StrictSignalReadiness: buildNhm2StrictSignalReadinessArtifact({
        strictModeEnabled: true,
        familyId: "nhm2_shift_lapse",
        familyAuthorityStatus: "candidate_authoritative_solve_family",
        transportCertificationStatus: "bounded_transport_proof_bearing_gate_admitted",
        lapseSummary: {
          alphaCenterline: 0.9625,
          alphaMin: 0.95,
          alphaMax: 1,
          alphaProfileKind: "selected_profile",
          alphaGradientAxis: "centerline",
          shiftLapseProfileId: gate.shiftLapseProfileId,
          shiftLapseProfileStage: gate.shiftLapseProfileStage,
          shiftLapseProfileLabel: gate.shiftLapseProfileLabel,
          shiftLapseProfileNote: gate.shiftLapseProfileNote,
          signConvention: "dtau_dt_equals_alpha_for_zero_coordinate_velocity",
        },
        theta: {
          metricDerived: true,
          provenance: "metric",
          sourcePath: "warp.metricAdapter.betaDiagnostics.thetaMax",
        },
        ts: {
          metricDerived: true,
          provenance: "metric",
          sourcePath: "warp.metricAdapter.ts",
        },
        qi: {
          metricDerived: true,
          provenance: "metric",
          sourcePath: "qiGuardrail",
          rhoSource: "warp.metric.T00.nhm2.shift_lapse",
          applicabilityStatus: "PASS",
        },
      }),
      nhm2SourceClosure: buildNhm2SourceClosureArtifact({
        metricTensorRef: "warp.metricStressEnergy",
        tileEffectiveTensorRef: "warp.tileEffectiveStressEnergy",
        metricRequiredTensor: {
          T00: -100,
          T11: 30,
          T22: 30,
          T33: 30,
        },
        tileEffectiveTensor: {
          T00: -100,
          T11: 30,
          T22: 30,
          T33: 30,
        },
        scalarCl3RhoDeltaRel: 0,
      }),
      nhm2QeiWorldlineDossier: buildPassingQeiWorldlineDossier(),
      nhm2ObserverAudit: buildPassingObserverAudit(),
    });

    const result = await evaluateWarpViability({});
    const layer = result.policyLayers?.nhm2_full_loop_audit;

    expect(layer).toBeTruthy();
    expect(layer?.artifact.sections.source_closure.state).toBe("unavailable");
    expect(layer?.artifact.sections.source_closure.reasons).toContain(
      "source_closure_missing",
    );
    expect(layer?.artifact.sections.source_closure.reasons).toContain(
      "source_closure_version_lag",
    );
    expect((result.snapshot as any).nhm2_full_loop_blocking_reasons).toContain(
      "source_closure_missing",
    );
  });

  it("does not emit an NHM2 full-loop policy layer for generic non-NHM2 runs", async () => {
    runtime.pipeline = makePipeline({
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricT00Observer: "eulerian_n",
        metricT00Normalization: "si_stress",
        metricT00UnitSystem: "SI",
        metricT00ContractStatus: "ok",
        metricAdapter: {
          family: "natario",
          chart: { label: "comoving_cartesian", contractStatus: "ok" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
      gr: {
        constraints: {
          rho_constraint: { mean: -100 * SI_TO_GEOM_STRESS, rms: 1e-4, maxAbs: 1e-4 },
          H_constraint: { rms: 1e-4, maxAbs: 1e-3 },
          M_constraint: { rms: 1e-4, maxAbs: 1e-3 },
        },
        matter: { stressEnergy: { avgT00: -100 } },
        gauge: { lapseMin: 1, betaMaxAbs: 0.1 },
      },
      qiGuardrail: {
        marginRatio: 0.2,
        lhs_Jm3: -1,
        bound_Jm3: -5,
        rhoSource: "warp.metric.T00.natario.shift",
        applicabilityStatus: "PASS",
      },
    });

    const result = await evaluateWarpViability({});

    expect(result.policyLayers).toBeUndefined();
    expect((result.snapshot as any).nhm2_full_loop_audit_status).toBeUndefined();
  });

  it("fails FordRomanQI on proxy rho source in strict mode", async () => {
    runtime.pipeline = makePipeline({
      qiGuardrail: {
        marginRatio: 0.2,
        lhs_Jm3: -1,
        bound_Jm3: -5,
        rhoSource: "tile-telemetry",
      },
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: { betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" } },
      },
    });

    const result = await evaluateWarpViability({});
    const fr = result.constraints.find((c) => c.id === "FordRomanQI");
    expect(fr?.passed).toBe(false);
    expect(fr?.note).toBe("proxy_input");
    expect((fr as any)?.provenance_class).toBe("proxy");
    expect((fr as any)?.claim_tier).toBe("diagnostic");
    expect((fr as any)?.strict_provenance_reason).toBe("strict_provenance_non_measured");
    expect((fr as any)?.confidence_band).toEqual({ low: 0.2, high: 0.49 });
    expect((result.snapshot as any).qi_provenance_class).toBe("proxy");
    expect((result.snapshot as any).qi_confidence_band).toEqual({ low: 0.2, high: 0.49 });
  });

  it("fails FordRomanQI in strict mode when metric source is missing contract metadata", async () => {
    runtime.pipeline = makePipeline({
      qiGuardrail: {
        marginRatio: 0.2,
        lhs_Jm3: -1,
        bound_Jm3: -5,
        rhoSource: "warp.metric.T00.natario.shift",
      },
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: {
          chart: { label: "comoving_cartesian", contractStatus: "unknown" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
    });

    const result = await evaluateWarpViability({});
    const fr = result.constraints.find((c) => c.id === "FordRomanQI");
    expect(fr?.passed).toBe(false);
    expect(fr?.note).toBe("contract_missing");
    expect(result.snapshot.rho_delta_metric_contract_ok).toBe(false);
  });

  it("blocks legacy FordRoman boolean fallback in strict mode", async () => {
    runtime.pipeline = makePipeline({
      qiGuardrail: undefined,
      fordRomanCompliance: true,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: { betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" } },
      },
    });

    const result = await evaluateWarpViability({});
    const fr = result.constraints.find((c) => c.id === "FordRomanQI");
    expect(fr?.passed).toBe(false);
    expect(fr?.note).toBe("proxy_input");
    expect(fr?.details).toContain("proxy_fallback_blocked");
    expect((fr as any)?.provenance_class).toBe("inferred");
    expect((fr as any)?.claim_tier).toBe("diagnostic");
    expect((fr as any)?.strict_provenance_reason).toBe("strict_provenance_non_measured");
    expect((fr as any)?.confidence_band).toEqual({ low: 0.5, high: 0.79 });
  });




  it("fails TS_ratio_min in strict mode when TS metric provenance is missing", async () => {
    runtime.pipeline = makePipeline({
      tsMetricDerived: false,
      tsMetricDerivedSource: undefined,
      tsMetricDerivedReason: undefined,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: { betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" } },
      },
    });

    const result = await evaluateWarpViability({});
    const ts = result.constraints.find((c) => c.id === "TS_ratio_min");
    expect(ts?.passed).toBe(false);
    expect(ts?.note).toBe("proxy_input");
    expect(ts?.details).toContain("metric_source=false");
    expect(ts?.details).toContain("ts_source=unknown");
  });

  it("uses conservative non-certifying defaults when provenance metadata is missing", async () => {
    runtime.pipeline = makePipeline({
      tsMetricDerived: undefined,
      tsMetricDerivedSource: undefined,
      thetaCal: undefined,
      warp: {
        metricAdapter: {
          chart: { label: "comoving_cartesian", contractStatus: "ok" },
        },
      },
      qiGuardrail: {
        marginRatio: 0.5,
        lhs_Jm3: -1,
        bound_Jm3: -2,
        rhoSource: "unknown-source",
      },
    });

    const result = await evaluateWarpViability({});
    expect((result.snapshot as any).warp_mechanics_provenance_class).toBe("proxy");
    expect((result.snapshot as any).warp_mechanics_claim_tier).toBe("diagnostic");
    expect((result.snapshot as any).warp_mechanics_promotion_reason).toBe("insufficient_provenance");
    expect((result.snapshot as any).warp_mechanics_promotion_counterexample_class).toBe(
      "provenance_missing",
    );
    expect((result.snapshot as any).warp_mechanics_promotion_replay).toMatchObject({
      outcome: {
        reason: "insufficient_provenance",
        counterexample_class: "provenance_missing",
        conservative_downgrade: true,
      },
      inputs: {
        provenance_class: "proxy",
      },
    });
    const ts = result.constraints.find((c) => c.id === "TS_ratio_min");
    expect((ts as any)?.claim_tier).toBe("diagnostic");
  });

  it("fails VdB_band when region-II derivative evidence is missing", async () => {
    runtime.pipeline = makePipeline({
      gammaVanDenBroeck: 100,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: { betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" } },
      },
      vdbRegionII: {
        support: true,
        sampleCount: 16,
        t00_mean: -2,
        bprime_min: 0,
        bprime_max: 0,
        bdouble_min: 0,
        bdouble_max: 0,
      },
      vdbRegionIV: {
        support: true,
        dfdr_max_abs: 1e-3,
      },
    });

    const result = await evaluateWarpViability({});
    const vdb = result.constraints.find((c) => c.id === "VdB_band");
    expect(vdb?.passed).toBe(false);
    expect(vdb?.details).toContain("derivII=false");
    expect(vdb?.details).toContain("derivTwoWall=false");
    expect(result.snapshot.vdb_region_ii_derivative_support).toBe(false);
    expect(result.snapshot.vdb_two_wall_derivative_support).toBe(false);
  });

  it("passes VdB_band when region-II and region-IV derivative evidence is present", async () => {
    runtime.pipeline = makePipeline({
      gammaVanDenBroeck: 100,
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: { betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" } },
      },
      vdbRegionII: {
        support: true,
        sampleCount: 16,
        t00_mean: -2,
        bprime_min: -2e-4,
        bprime_max: 1e-4,
        bdouble_min: -3e-4,
        bdouble_max: 2e-4,
      },
      vdbRegionIV: {
        support: true,
        dfdr_max_abs: 1e-3,
      },
    });

    const result = await evaluateWarpViability({});
    const vdb = result.constraints.find((c) => c.id === "VdB_band");
    expect(vdb?.passed).toBe(true);
    expect(vdb?.details).toContain("derivII=true");
    expect(vdb?.details).toContain("derivIV=true");
    expect(vdb?.details).toContain("derivTwoWall=true");
    expect(result.snapshot.vdb_region_ii_derivative_support).toBe(true);
    expect(result.snapshot.vdb_two_wall_derivative_support).toBe(true);
  });


  it("keeps promotion replay deterministic across identical evaluations", async () => {
    runtime.pipeline = makePipeline({
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricAdapter: {
          chart: { label: "comoving_cartesian", contractStatus: "ok" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
      thetaCal: 10,
      TS_ratio: 150,
      tsMetricDerived: true,
      qiGuardrail: {
        marginRatio: 0.2,
        lhs_Jm3: -1,
        bound_Jm3: -5,
        rhoSource: "warp.metric.T00.natario.shift",
      },
    });

    const first = await evaluateWarpViability({});
    const second = await evaluateWarpViability({});
    const firstReplay = (first.snapshot as any).warp_mechanics_promotion_replay;
    const secondReplay = (second.snapshot as any).warp_mechanics_promotion_replay;

    expect(firstReplay).toEqual(secondReplay);
    expect(firstReplay?.deterministic_key).toBe(secondReplay?.deterministic_key);
    expect((first.snapshot as any).warp_mechanics_promotion_counterexample_class).toBe("hard_constraint_regression");
    expect((first.snapshot as any).warp_mechanics_promotion_reason).toBe("hard_constraint_failed");
    expect((first.snapshot as any).warp_mechanics_claim_tier).toBe("reduced-order");
  });

  // restore the caller environment for subsequent tests
  

  it("fails closed in strict mode when Natário contract metadata is incomplete", async () => {
    runtime.pipeline = makePipeline({
      warp: {
        metricT00: -100,
        metricT00Source: "metric",
        metricT00Ref: "warp.metric.T00.natario.shift",
        metricT00Observer: undefined,
        metricT00Normalization: "si_stress",
        metricT00UnitSystem: "SI",
        metricT00ContractStatus: "ok",
        metricAdapter: {
          family: "natario",
          chart: { label: "comoving_cartesian", contractStatus: "ok" },
          betaDiagnostics: { thetaMax: 0.5, method: "finite-diff" },
        },
      },
    });

    const result = await evaluateWarpViability({});
    expect((result.snapshot as any).rho_delta_metric_contract_ok).toBe(false);
    const cl3 = result.constraints.find((c) => c.id === "CL3_RhoDelta");
    expect(cl3?.details ?? "").toContain("contract=");
  });

  it("keeps non-finite QI snapshot numerics undefined (no null placeholders)", async () => {
    runtime.pipeline = makePipeline({
      qiGuardrail: {
        marginRatio: Number.NaN,
        marginRatioRaw: Number.NaN,
        lhs_Jm3: Number.NaN,
        bound_Jm3: Number.NaN,
        curvatureRatio: Number.NaN,
        rhoSource: "warp.metric.T00.natario.shift",
      },
      qi: {
        boundK: Number.NaN,
        safetySigma_Jm3: Number.POSITIVE_INFINITY,
      },
    });

    const result = await evaluateWarpViability({});
    expect((result.snapshot as any).qi_lhs_Jm3).toBeUndefined();
    expect((result.snapshot as any).qi_bound_Jm3).toBeUndefined();
    expect((result.snapshot as any).qi_margin_ratio).toBeUndefined();
    expect((result.snapshot as any).qi_margin_ratio_raw).toBeUndefined();
    expect((result.snapshot as any).qi_uncertainty_sigma_Jm3).toBeUndefined();
    expect((result.snapshot as any).qi_uncertainty_sigma_measurement_Jm3).toBeUndefined();
    expect((result.snapshot as any).qi_uncertainty_sigma_model_Jm3).toBeUndefined();
    expect((result.snapshot as any).qi_uncertainty_sigma_bridge_Jm3).toBeUndefined();
    expect((result.snapshot as any).qi_uncertainty_sigma_tau_Jm3).toBeUndefined();
    expect((result.snapshot as any).qi_uncertainty_dominant_component).toBeUndefined();
    expect((result.snapshot as any).qi_uncertainty_decision_class).toBeUndefined();
    expect((result.snapshot as any).qi_uncertainty_inputs_missing).toBeUndefined();
    expect((result.snapshot as any).qi_curvature_ratio).toBeUndefined();
    expect((result.snapshot as any).qi_bound_K).toBeUndefined();
    expect((result.snapshot as any).qi_safetySigma_Jm3).toBeUndefined();
  });

  it("prevents certified promotion when QI applicability is not PASS", async () => {
    runtime.pipeline = makePipeline({
      qiGuardrail: {
        marginRatio: 0.2,
        lhs_Jm3: -1,
        bound_Jm3: -5,
        rhoSource: "warp.metric.T00.natario.shift",
        applicabilityStatus: "NOT_APPLICABLE",
      },
    });
    const result = await evaluateWarpViability({});
    expect((result.snapshot as any).warp_mechanics_claim_tier).toBe("diagnostic");
    expect((result.snapshot as any).qi_applicability_status).toBe("NOT_APPLICABLE");
  });

  it("uses provided snapshot gr invariants to resolve QI applicability", async () => {
    runtime.pipeline = makePipeline({
      gr: {},
    });
    const grSnapshot = {
      invariants: {
        kretschmann: { p98: 1e-32 },
      },
    };
    const result = await evaluateWarpViability(
      {},
      {
        snapshot: {
          gr: grSnapshot,
        } as any,
      },
    );
    expect(result.snapshot).toBeTruthy();
    expect(mocks.calculateEnergyPipeline).toHaveBeenCalled();
    const seededState = mocks.calculateEnergyPipeline.mock.calls[0]?.[0] as any;
    expect(seededState?.grEnabled).toBe(true);
    expect(seededState?.gr).toEqual(grSnapshot);
  });
afterAll(() => {
    process.env.WARP_STRICT_CONGRUENCE = strictEnv;
  });
});
