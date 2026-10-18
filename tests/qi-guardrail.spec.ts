import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

const tileTelemetry = { avgNeg: null as number | null, source: null as string | null, updatedAt: 0 };
vi.mock("../server/qi/pipeline-qi-stream.js", () => ({
  updatePipelineQiTiles: vi.fn(),
  getLatestQiTileStats: () => tileTelemetry,
}));

import { evaluateQiGuardrail, deriveQiStatus, type EnergyPipelineState } from "../server/energy-pipeline";
import type { PhaseSchedule } from "../server/energy/phase-scheduler.js";
import type { PhaseScheduleTelemetry } from "../shared/schema";
import { GEOM_TO_SI_STRESS } from "../shared/gr-units";

const strictCongruenceEnv = process.env.WARP_STRICT_CONGRUENCE;

const baseState: EnergyPipelineState = {
  tileArea_cm2: 1,
  gap_nm: 1,
  sag_nm: 0,
  temperature_K: 300,
  modulationFreq_GHz: 1,
  currentMode: "hover",
  dutyCycle: 0,
  dutyShip: 0,
  sectorCount: 1,
  concurrentSectors: 1,
  sectorStrobing: 1,
  qSpoilingFactor: 1,
  negativeFraction: 1,
  gammaGeo: 1,
  qMechanical: 1,
  qCavity: 1,
  gammaVanDenBroeck: 1,
  exoticMassTarget_kg: 1,
  U_static: 0,
  U_geo: 0,
  U_Q: 0,
  U_cycle: 0,
  P_loss_raw: 0,
  P_avg: 0,
  M_exotic: 0,
  M_exotic_raw: 0,
  massCalibration: 1,
  TS_ratio: 1,
  zeta: 0,
  N_tiles: 1,
  tilesPerSector: 1,
  activeSectors: 1,
  activeTiles: 1,
  activeFraction: 1,
  fordRomanCompliance: true,
  natarioConstraint: true,
  curvatureLimit: true,
  overallStatus: "NOMINAL",
};

const makeState = (overrides: Partial<EnergyPipelineState> = {}): EnergyPipelineState => ({
  ...baseState,
  ...overrides,
});

const makeSchedule = (
  N: number,
  negSectors: number[],
  sectorPeriod_ms: number,
  tau_ms: number,
): PhaseScheduleTelemetry => ({
  N,
  sectorPeriod_ms,
  phase01: 0,
  phi_deg_by_sector: Array.from({ length: N }, () => 0),
  negSectors,
  posSectors: [],
  sampler: "gaussian",
  tau_s_ms: tau_ms,
  weights: Array.from({ length: N }, () => 1),
});

beforeEach(() => {
  tileTelemetry.avgNeg = null;
  tileTelemetry.source = null;
  process.env.QI_TILE_TELEMETRY_SCALE = undefined;
  process.env.QI_COUPLING_MODE = undefined;
  process.env.QI_COUPLING_ALPHA = undefined;
  delete process.env.QI_UNCERTAINTY_SIGMA_MODEL_JM3;
  delete process.env.QI_UNCERTAINTY_REQUIRE_MODEL_SIGMA;
  delete process.env.QI_UNCERTAINTY_SIGMA_MEASUREMENT_JM3;
  delete process.env.QI_UNCERTAINTY_KSIGMA;
  process.env.WARP_STRICT_CONGRUENCE = "0";
});

describe("evaluateQiGuardrail", () => {
  test("returns lhs ~ effective rho when the mask is fully on", () => {
    const dutyCycle = 5.64;
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };

    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle,
        dutyShip: dutyCycle,
        dutyEffective_FR: dutyCycle,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
      }),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.effectiveRho).toBeCloseTo(-Math.abs(dutyCycle), 9);
    expect(guard.lhs_Jm3).toBeCloseTo(guard.effectiveRho, 9);
    expect(guard.boundUsed_Jm3).toBe(guard.bound_Jm3);
    expect(guard.boundComputed_Jm3).toBeLessThan(0);
    expect(guard.K).not.toBeNull();
    expect(guard.safetySigma_Jm3).not.toBeNull();
  });

  test("duty-weighted masks still integrate back to effective rho", () => {
    const dutyCycle = 12.3;
    const sectorPeriod_ms = 1;
    const tau_ms = 2;
    const schedule = makeSchedule(4, [0, 2], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };

    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle,
        dutyShip: dutyCycle,
        dutyEffective_FR: dutyCycle,
        sectorCount: 4,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 0.5,
        phaseSchedule: schedule,
      }),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.patternDuty).toBeCloseTo(0.5, 6);
    expect(guard.rhoOn).toBeCloseTo(guard.effectiveRho / guard.patternDuty, 6);
    expect(guard.lhs_Jm3).toBeCloseTo(guard.effectiveRho, 3);
  });

  test("scales tile telemetry before integrating the guard window", () => {
    const scale = 0.03095;
    const prev = process.env.QI_TILE_TELEMETRY_SCALE;
    process.env.QI_TILE_TELEMETRY_SCALE = String(scale);
    tileTelemetry.avgNeg = -522.99;
    tileTelemetry.source = "controller";
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };

    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 0,
        dutyShip: 0,
        dutyEffective_FR: 0,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
      }),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    if (tileTelemetry.avgNeg == null) throw new Error("tile telemetry not set");
    const expected = tileTelemetry.avgNeg * scale;
    expect(guard.effectiveRho).toBeCloseTo(expected, 6);
    expect(guard.lhs_Jm3).toBeCloseTo(expected, 6);
    expect(guard.rhoSource).toBe("tile-telemetry");
    process.env.QI_TILE_TELEMETRY_SCALE = prev;
  });

  test("uses VdB region II metric source when warp metric T00 is unavailable", () => {
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };
    const t00Geom = -2.0;

    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 0,
        dutyShip: 0,
        dutyEffective_FR: 0,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
        vdbRegionII: {
          alpha: 1,
          n: 80,
          r_tilde_m: 1,
          delta_tilde_m: 0.1,
          sampleCount: 16,
          b_min: 1,
          b_max: 2,
          bprime_min: -1,
          bprime_max: 1,
          bprime_rms: 0.5,
          bdouble_min: -2,
          bdouble_max: 2,
          bdouble_rms: 1,
          t00_min: -3,
          t00_max: -1,
          t00_mean: t00Geom,
          t00_rms: 2,
          support: true,
        },
      }),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.rhoSource).toBe("warp.metric.T00.vdb.regionII");
    expect(guard.effectiveRho).toBeCloseTo(t00Geom * GEOM_TO_SI_STRESS, 6);
    expect(guard.rhoOn).toBeCloseTo(guard.effectiveRho, 9);
    const relErr =
      Math.abs(guard.lhs_Jm3 - guard.effectiveRho) /
      Math.max(1, Math.abs(guard.effectiveRho));
    expect(relErr).toBeLessThan(1e-12);
  });

  test("ignores VdB region II fallback when derivative evidence is missing", () => {
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };

    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 0,
        dutyShip: 0,
        dutyEffective_FR: 0,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
        vdbRegionII: {
          support: true,
          sampleCount: 16,
          t00_mean: -2,
          bprime_min: 0,
          bprime_max: 0,
          bdouble_min: 0,
          bdouble_max: 0,
        } as any,
      }),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.rhoSource).not.toBe("warp.metric.T00.vdb.regionII");
  });

  test("prefers warp.metricT00Ref label when metric T00 is present", () => {
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };
    const metricT00 = -123.456;

    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 0,
        dutyShip: 0,
        dutyEffective_FR: 0,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
        warp: {
          metricT00,
          metricT00Source: "metric",
          metricT00Ref: "warp.metric.T00.vdb.regionII",
        },
      } as any),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.rhoSource).toBe("warp.metric.T00.vdb.regionII");
    expect(guard.effectiveRho).toBeCloseTo(metricT00, 9);
  });

  test("emits deterministic shadow coupling diagnostics without changing gate evaluation path", () => {
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };
    const metricT00 = -120;
    const proxyRho = -40;
    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 0.2,
        dutyShip: 0.2,
        dutyEffective_FR: 0.2,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
        rho_static: proxyRho,
        warp: {
          metricT00,
          metricT00Source: "metric",
          metricT00Ref: "warp.metric.T00.natario.shift",
        },
      } as any),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.effectiveRho).toBeCloseTo(metricT00, 9);
    expect(guard.couplingMode).toBe("shadow");
    expect(guard.couplingAlpha).toBeCloseTo(0.5, 12);
    expect(guard.rhoMetric_Jm3).toBeCloseTo(metricT00, 9);
    expect(guard.rhoProxy_Jm3).toBeCloseTo(proxyRho, 9);
    expect(guard.rhoCoupledShadow_Jm3).toBeCloseTo((metricT00 + proxyRho) / 2, 9);
    expect(guard.couplingComparable).toBe(true);
    expect(guard.couplingEquationRef).toContain("semiclassical_coupling");
    expect(guard.couplingSemantics).toBe("diagnostic_only_no_gate_override");
    expect(guard.quantitySemanticBaseType).toBe("classical_proxy_from_curvature");
    expect(guard.quantitySemanticType).toBe("classical_proxy_from_curvature");
    expect(guard.quantitySemanticTargetType).toBe("ren_expectation_timelike_energy_density");
    expect(guard.quantitySemanticBridgeMode).toBe("strict_evidence_gated");
    expect(guard.quantitySemanticBridgeReady).toBe(false);
    expect(Array.isArray(guard.quantitySemanticBridgeMissing)).toBe(true);
    expect(guard.quantitySemanticBridgeMissing).toContain("worldline_not_timelike");
    expect(guard.quantitySemanticBridgeMissing).toContain("coupling_semantics_diagnostic_only");
    expect(guard.quantitySemanticBridgeMissing).not.toContain("qei_state_class_not_hadamard");
    expect(guard.quantitySemanticBridgeMissing).not.toContain("qei_renormalization_not_point_splitting");
    expect(guard.lhs_Jm3).toBeCloseTo(metricT00, 9);
    expect(guard.uncertaintySigma_Jm3).toBeCloseTo(Math.abs(metricT00 - proxyRho), 9);
    expect(guard.uncertaintySigmaMeasurement_Jm3).toBe(0);
    expect(guard.uncertaintySigmaBridge_Jm3).toBeCloseTo(Math.abs(metricT00 - proxyRho), 9);
    expect(guard.uncertaintySigmaModel_Jm3).toBe(0);
    expect(guard.uncertaintySigmaTau_Jm3).toBe(0);
    expect(guard.uncertaintyDominantComponent).toBe("bridge");
    expect(guard.uncertaintyBandKSigma).toBe(3);
    expect(guard.uncertaintySlackPolicy_Jm3).toBeCloseTo(guard.lhs_Jm3 - guard.bound_Jm3, 9);
    expect(guard.uncertaintySlackComputed_Jm3).toBeCloseTo(guard.lhs_Jm3 - guard.boundComputed_Jm3, 9);
    expect(guard.uncertaintyDecisionClass).toBe("indeterminate");
    expect(guard.uncertaintyCouldFlip).toBe(true);
    expect(guard.uncertaintyInputsMissing).not.toContain("coupling_channels_missing");
  });

  test("promotes coupling semantics to bridge-ready channel when QEI evidence metadata is complete", () => {
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };
    const metricT00 = -120;
    const proxyRho = -40;
    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 0.2,
        dutyShip: 0.2,
        dutyEffective_FR: 0.2,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
        rho_static: proxyRho,
        qi: {
          sampler: "gaussian",
          tau_s_ms: 5,
          observerId: "obs-1",
          fieldType: "em",
          qeiStateClass: "hadamard",
          qeiRenormalizationScheme: "point_splitting",
          qeiSamplingNormalization: "unit_integral",
          qeiOperatorMapping: "t_munu_uu_ren",
        } as any,
        gr: {
          invariants: {
            kretschmann: { p98: 0, max: 0, mean: 0 },
          },
        } as any,
        warp: {
          metricT00,
          metricT00Source: "metric",
          metricT00Ref: "warp.metric.T00.natario.shift",
          metricT00Contract: {
            status: "ok",
            observer: "comoving_timelike",
            normalization: "ren_expectation",
            unitSystem: "SI",
          },
          metricAdapter: {
            chart: {
              label: "comoving_cartesian",
              contractStatus: "ok",
            },
          },
        },
      } as any),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.couplingComparable).toBe(true);
    expect(guard.couplingSemantics).toBe("bridge_ready_evidence_no_gate_override");
    expect(guard.quantitySemanticBridgeReady).toBe(true);
    expect(guard.quantitySemanticComparable).toBe(true);
    expect(guard.quantitySemanticType).toBe("ren_expectation_timelike_energy_density");
    expect(guard.quantitySemanticBridgeMissing).not.toContain("coupling_semantics_diagnostic_only");
  });

  test("records model-sigma provenance when configured", () => {
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };
    process.env.QI_UNCERTAINTY_SIGMA_MODEL_JM3 = "2.5";
    process.env.QI_UNCERTAINTY_REQUIRE_MODEL_SIGMA = "1";

    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 0.2,
        dutyShip: 0.2,
        dutyEffective_FR: 0.2,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
      } as any),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.uncertaintyModelSigmaConfigured_Jm3).toBeCloseTo(2.5, 9);
    expect(guard.uncertaintyModelSigmaSource).toBe("env:QI_UNCERTAINTY_SIGMA_MODEL_JM3");
    expect(guard.uncertaintyModelSigmaRationale).toBe("configured_model_sigma_applied");
    expect(guard.uncertaintyModelSigmaRequired).toBe(true);
    expect(guard.uncertaintyModelSigmaProvenanceReady).toBe(true);
    expect(guard.uncertaintyModelSigmaProvenanceMissing).toEqual([]);
    expect(guard.uncertaintySigmaModel_Jm3).toBeCloseTo(2.5, 9);
    expect(guard.uncertaintyInputsMissing).not.toContain("model_sigma_provenance_missing");
  });

  test("fails closed uncertainty when model-sigma provenance is required but missing", () => {
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };
    process.env.QI_UNCERTAINTY_REQUIRE_MODEL_SIGMA = "1";

    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 0.2,
        dutyShip: 0.2,
        dutyEffective_FR: 0.2,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
      } as any),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.uncertaintyModelSigmaConfigured_Jm3).toBeNull();
    expect(guard.uncertaintyModelSigmaSource).toBe("default_zero_unconfigured");
    expect(guard.uncertaintyModelSigmaRationale).toBe("model_sigma_required_but_missing");
    expect(guard.uncertaintyModelSigmaRequired).toBe(true);
    expect(guard.uncertaintyModelSigmaProvenanceReady).toBe(false);
    expect(guard.uncertaintyModelSigmaProvenanceMissing).toContain("model_sigma_unconfigured");
    expect(guard.uncertaintyModelSigmaProvenanceMissing).toContain("model_sigma_required_but_missing");
    expect(guard.uncertaintyDecisionClass).toBe("indeterminate");
    expect(guard.uncertaintyCouldFlip).toBe(true);
    expect(guard.uncertaintyInputsMissing).toContain("model_sigma_provenance_missing");
  });

  test("supports coupling mode off while preserving comparability diagnostics", () => {
    process.env.QI_COUPLING_MODE = "off";
    const guard = evaluateQiGuardrail(
      makeState({
        rho_static: -10,
        warp: {
          metricT00: -20,
          metricT00Source: "metric",
          metricT00Ref: "warp.metric.T00.natario.shift",
        },
      } as any),
      { tau_ms: 1 },
    );
    expect(guard.couplingMode).toBe("off");
    expect(guard.couplingComparable).toBe(true);
    expect(guard.rhoCoupledShadow_Jm3).toBeUndefined();
  });

  test("enforces metric-only rho source in strict congruence mode", () => {
    process.env.WARP_STRICT_CONGRUENCE = "1";
    const sectorPeriod_ms = 1;
    const tau_ms = 1;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };
    tileTelemetry.avgNeg = -100;
    tileTelemetry.source = "controller";

    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 0.2,
        dutyShip: 0.2,
        dutyEffective_FR: 0.2,
        sectorCount: 1,
        concurrentSectors: 1,
        sectorStrobing: 1,
        negativeFraction: 1,
        phaseSchedule: schedule,
      }),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );

    expect(guard.rhoSource).toBe("metric-missing");
    expect(Number.isFinite(guard.effectiveRho)).toBe(false);
    expect(guard.marginRatioRaw).toBe(Infinity);
  });

  test("applies policy floor even when QI bound env floor is non-finite", () => {
    const prevFloor = process.env.QI_BOUND_FLOOR_ABS;
    process.env.QI_BOUND_FLOOR_ABS = "not-a-number";
    try {
      const sectorPeriod_ms = 1;
      const tau_ms = 1;
      const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
      const scheduleGuard: PhaseSchedule = {
        phi_deg_by_sector: schedule.phi_deg_by_sector,
        negSectors: schedule.negSectors,
        posSectors: schedule.posSectors,
        weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
      };
      const guard = evaluateQiGuardrail(
        makeState({
          dutyCycle: 64,
          dutyShip: 64,
          dutyEffective_FR: 64,
          sectorCount: 1,
          concurrentSectors: 1,
          sectorStrobing: 1,
          negativeFraction: 1,
          phaseSchedule: schedule,
        }),
        { schedule: scheduleGuard, sectorPeriod_ms, tau_ms, qiPolicyMaxZeta: 0.5 },
      );

      expect(guard.marginRatioRaw).toBeLessThanOrEqual(0.5000001);
      expect(guard.marginRatioRawComputed).toBeGreaterThan(guard.marginRatioRaw);
      expect(guard.bound_Jm3).toBeLessThan(0);
      expect(guard.boundPolicyFloor_Jm3).not.toBeNull();
      expect(guard.boundEnvFloor_Jm3).toBeNull();
      expect(guard.boundDefaultFloor_Jm3).toBeLessThan(0);
      expect(guard.boundFallbackAbs_Jm3).toBeGreaterThan(0);
      expect(guard.boundFloorApplied).toBe(guard.boundUsed_Jm3 !== guard.boundComputed_Jm3);
      expect(guard.g4FloorDominated).toBe(guard.boundFloorApplied && guard.boundUsed_Jm3 !== guard.boundComputed_Jm3);
      expect(guard.g4PolicyExceeded).toBe(guard.marginRatioRaw >= 1);
      expect(guard.g4ComputedExceeded).toBe(guard.marginRatioRawComputed >= 1);
      const expectedDual = guard.g4PolicyExceeded
        ? guard.g4ComputedExceeded
          ? 'both'
          : 'policy_only'
        : guard.g4ComputedExceeded
          ? 'computed_only'
          : 'neither';
      expect(guard.g4DualFailMode).toBe(expectedDual);
    } finally {
      process.env.QI_BOUND_FLOOR_ABS = prevFloor;
    }
  });
});

afterAll(() => {
  process.env.WARP_STRICT_CONGRUENCE = strictCongruenceEnv;
});

describe("deriveQiStatus", () => {
  test("uses raw zeta for compliance when policy clamp is more lenient", () => {
    const result = deriveQiStatus({
      zetaRaw: 2,
      zetaClamped: 0.5,
      pAvg: 0,
      pWarn: 1,
      mode: "hover",
    });

    expect(result.zetaForStatus).toBeCloseTo(2);
    expect(result.compliance).toBe(false);
    expect(result.overallStatus).toBe("CRITICAL");
  });

  test("falls back to clamped zeta and suppresses power warning in emergency mode", () => {
    const result = deriveQiStatus({
      zetaRaw: undefined,
      zetaClamped: 0.5,
      pAvg: 10,
      pWarn: 1,
      mode: "emergency",
    });

    expect(result.zetaForStatus).toBeCloseTo(0.5);
    expect(result.compliance).toBe(true);
    expect(result.overallStatus).toBe("NOMINAL");
  });

  test("derives color thresholds from raw zeta without policy clamps", () => {
    const red = deriveQiStatus({
      zetaRaw: 1.2,
      zetaClamped: 0.8,
      pAvg: 0,
      pWarn: 1,
      mode: "hover",
    }).color;

    const amber = deriveQiStatus({
      zetaRaw: undefined,
      zetaClamped: 0.96,
      pAvg: 0,
      pWarn: 1,
      mode: "hover",
    }).color;

    const green = deriveQiStatus({
      zetaRaw: 0.4,
      zetaClamped: 0.4,
      pAvg: 0,
      pWarn: 1,
      mode: "hover",
    }).color;

    const muted = deriveQiStatus({
      zetaRaw: undefined,
      zetaClamped: undefined,
      pAvg: undefined,
      pWarn: undefined,
      mode: "hover",
    }).color;

    expect(red).toBe("red");
    expect(amber).toBe("amber");
    expect(green).toBe("green");
    expect(muted).toBe("muted");
  });


  test("reports NOT_APPLICABLE when curvature-window assumptions are violated", () => {
    const sectorPeriod_ms = 1;
    const tau_ms = 10;
    const schedule = makeSchedule(1, [0], sectorPeriod_ms, tau_ms);
    const scheduleGuard: PhaseSchedule = {
      phi_deg_by_sector: schedule.phi_deg_by_sector,
      negSectors: schedule.negSectors,
      posSectors: schedule.posSectors,
      weights: schedule.weights ?? Array.from({ length: schedule.N }, () => 1),
    };
    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 5,
        dutyShip: 5,
        dutyEffective_FR: 5,
        gr: { invariants: { kretschmann: { p98: 1e20 } } },
      }),
      { schedule: scheduleGuard, sectorPeriod_ms, tau_ms },
    );
    expect(guard.curvatureOk).toBe(false);
    expect(guard.applicabilityStatus).toBe("NOT_APPLICABLE");
    expect(guard.applicabilityReasonCode).toBe("G4_QI_CURVATURE_WINDOW_FAIL");
  });

  test("reports PASS applicability when curvature-window assumptions are satisfied", () => {
    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 5,
        dutyShip: 5,
        dutyEffective_FR: 5,
        gr: { invariants: { kretschmann: { p98: 1e-32 } } },
      }),
      { tau_ms: 1 },
    );
    expect(guard.curvatureOk).toBe(true);
    expect(guard.applicabilityStatus).toBe("PASS");
    expect(guard.applicabilityReasonCode).toBeUndefined();
  });

  test("treats zero curvature invariant signals as PASS applicability", () => {
    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 5,
        dutyShip: 5,
        dutyEffective_FR: 5,
        gr: { invariants: { kretschmann: { p98: 0, max: 0, mean: 0 } } },
      }),
      { tau_ms: 1 },
    );
    expect(guard.applicabilityStatus).toBe("PASS");
    expect(guard.applicabilityReasonCode).toBeUndefined();
    expect(guard.curvatureOk).toBe(true);
    expect(guard.curvatureRatio).toBe(0);
  });

  test("reports UNKNOWN applicability when curvature invariants are unavailable", () => {
    const guard = evaluateQiGuardrail(makeState({ dutyCycle: 5, dutyShip: 5, dutyEffective_FR: 5 }), { tau_ms: 1 });
    expect(guard.applicabilityStatus).toBe("UNKNOWN");
    expect(guard.applicabilityReasonCode).toBe("G4_QI_SIGNAL_MISSING");
  });

  test("reports deterministic PASS when scalar is exactly zero", () => {
    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 5,
        dutyShip: 5,
        dutyEffective_FR: 5,
        gr: { invariants: { kretschmann: { p98: 0 } } },
      }),
      { tau_ms: 1 },
    );
    expect(guard.applicabilityStatus).toBe("PASS");
    expect(guard.applicabilityReasonCode).toBeUndefined();
    expect(guard.curvatureOk).toBe(true);
    expect(guard.curvatureRatio).toBe(0);
  });

  test("emits deterministic tau provenance fields with configured selector", () => {
    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 5,
        dutyShip: 5,
        dutyEffective_FR: 5,
        clocking: { tauPulse_ms: 0.25, tauLC_ms: 2 },
      }),
      { tau_ms: 5 },
    );
    expect(guard.tauSelectorPolicy).toBe("configured");
    expect(guard.tauSelectedSource).toBe("configured");
    expect(guard.tauConfigured_s).toBeCloseTo(0.005, 12);
    expect(guard.tauSelected_s).toBeCloseTo(0.005, 12);
    expect(guard.tauPulse_s).toBeCloseTo(0.00025, 12);
    expect(guard.tauLC_s).toBeCloseTo(0.002, 12);
    expect(guard.tau_s).toBeGreaterThan(0);
    expect(guard.tauSelectorFallbackApplied).toBe(false);
    expect(guard.tauProvenanceReady).toBe(true);
  });

  test("fails closed to configured tau when requested selector source is unavailable", () => {
    const guard = evaluateQiGuardrail(
      makeState({
        dutyCycle: 5,
        dutyShip: 5,
        dutyEffective_FR: 5,
        qi: {
          sampler: "gaussian",
          fieldType: "em",
          tau_s_ms: 5,
          tauSelector: "pulse",
        } as any,
      }),
      { tau_ms: 5 },
    );
    expect(guard.tauSelectorPolicy).toBe("pulse");
    expect(guard.tauSelectedSource).toBe("configured");
    expect(guard.tauSelectorFallbackApplied).toBe(true);
    expect(guard.tauProvenanceReady).toBe(false);
    expect(guard.tauProvenanceMissing).toContain("tau_pulse_unavailable");
    expect(guard.tauProvenanceMissing).toContain("tau_selector_fallback:pulse->configured");
  });
});
