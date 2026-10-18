import { describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  aggregateGateStatusAcrossWaves,
  buildGateMap,
  buildGateMissingSignalMap,
  buildNotReadyClassification,
  deriveG4Diagnostics,
  collectRequiredSignals,
  computeReproducibility,
  buildQiForensicsArtifact,
  deriveCampaignDecision,
  deriveFirstFail,
  resolveGovernanceCanonicalClass,
  parseArgs,
  parsePositiveIntArg,
  parseSeedArg,
  parseWaveArg,
  resolveWaveProfiles,
  summarizeScoreboard,
} from '../scripts/warp-full-solve-campaign';

const execFileAsync = promisify(execFile);

describe('warp-full-solve-campaign runner', () => {
  it('is import-safe and does not execute cli side effects on import', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await import('../scripts/warp-full-solve-campaign');
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('rejects invalid --wave values with explicit error', () => {
    expect(() => parseWaveArg('Z')).toThrow(/Allowed values: A\|B\|C\|D\|all/);
  });

  it('rejects invalid --seed values with explicit error', () => {
    expect(() => parseSeedArg('abc')).toThrow(/Seed must be a finite integer/);
    expect(() => parseSeedArg('1.5')).toThrow(/Seed must be a finite integer/);
    expect(() => parseArgs(['--seed', 'nan'])).toThrow(/Seed must be a finite integer/);
  });

  it('keeps missing evidence fail-closed as NOT_READY', () => {
    const result = deriveFirstFail({
      G0: { status: 'PASS', reason: 'ok', source: 'x' },
      G1: { status: 'NOT_READY', reason: 'missing initial', source: 'x' },
      G2: { status: 'PASS', reason: 'ok', source: 'x' },
      G3: { status: 'PASS', reason: 'ok', source: 'x' },
      G4: { status: 'PASS', reason: 'ok', source: 'x' },
      G6: { status: 'PASS', reason: 'ok', source: 'x' },
      G7: { status: 'PASS', reason: 'ok', source: 'x' },
      G8: { status: 'PASS', reason: 'ok', source: 'x' },
    });
    expect(result.firstFail).toBe('G1');
    expect(result.reason).toContain('missing initial');
  });

  it('reconciles scoreboard counts including NOT_APPLICABLE', () => {
    const scoreboard = summarizeScoreboard({
      G0: 'PASS',
      G1: 'FAIL',
      G2: 'UNKNOWN',
      G3: 'NOT_READY',
      G4: 'NOT_APPLICABLE',
    });
    expect(scoreboard.counts).toEqual({ PASS: 1, FAIL: 1, UNKNOWN: 1, NOT_READY: 1, NOT_APPLICABLE: 1 });
    expect(scoreboard.reconciled).toBe(true);
    expect(scoreboard.total).toBe(scoreboard.gateCount);
  });

  it('fails closed when governance artifact is missing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-governance-missing-'));
    const resolution = resolveGovernanceCanonicalClass(path.join(tmpRoot, 'missing.json'), tmpRoot);
    expect(resolution.canonicalClass).toBe('evidence_path_blocked');
    expect(resolution.freshness).toBe('missing_artifact');
    expect(resolution.freshnessReason).toBe('governance_matrix_missing');
  });

  it('fails closed when governance artifact commit provenance is stale', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-governance-stale-'));
    const governancePath = path.join(tmpRoot, 'g4-governance.json');
    fs.writeFileSync(
      governancePath,
      JSON.stringify(
        {
          canonicalAuthoritativeClass: 'both',
          commitHash: 'deadbeef',
        },
        null,
        2,
      ),
    );
    const resolution = resolveGovernanceCanonicalClass(governancePath, tmpRoot);
    expect(resolution.canonicalClass).toBe('evidence_path_blocked');
    expect(resolution.freshness).toBe('stale_provenance');
    expect(resolution.freshnessReason).toContain('resolvable=false');
  });


  it('classifies NOT_READY gate causes by timeout and missing signals', () => {
    const gateMap = {
      G0: { status: 'NOT_READY', reason: 'timeout', source: 'campaign.timeout' },
      G1: { status: 'NOT_READY', reason: 'missing initial', source: 'gr-agent-loop.attempt.initial.status' },
      G5: { status: 'NOT_APPLICABLE', reason: 'n/a', source: 'campaign.policy.reduced-order' },
    } as any;
    const classification = buildNotReadyClassification(
      gateMap,
      { G1: ['initial_solver_status'] },
      { kind: 'wave_timeout', timeoutMs: 1000, elapsedMs: 1000, wave: 'A' },
    );
    expect(classification.gateCauseClass.G0).toBe('timeout_budget');
    expect(classification.gateCauseClass.G1).toBe('timeout_budget');
    expect(classification.notReadyClassCounts.timeout_budget).toBe(2);
  });

  it('derives explicit G4 diagnostics from evaluator constraints', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [
          { id: 'FordRomanQI', status: 'fail', note: 'FordRoman hard fail' },
          { id: 'ThetaAudit', status: 'pass', note: 'Theta ok' },
        ],
      },
    } as any);
    expect(diagnostics.fordRomanStatus).toBe('fail');
    expect(diagnostics.thetaAuditStatus).toBe('pass');
    expect(diagnostics.source).toBe('evaluator_constraints');
    expect(diagnostics.reason.join(' | ')).toContain('FordRoman hard fail');
    expect(diagnostics.reasonCode).toEqual([]);
  });

  it('keeps synthesized unknown provenance and deterministic reasonCode for missing hard sources', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [
          {
            id: 'FordRomanQI',
            status: 'unknown',
            note: 'reasonCode=G4_QI_SIGNAL_MISSING;source=synthesized_unknown;FordRomanQI missing from warp-viability evaluator constraints.',
          },
          {
            id: 'ThetaAudit',
            status: 'unknown',
            note: 'reasonCode=G4_QI_SIGNAL_MISSING;source=synthesized_unknown;ThetaAudit missing from warp-viability evaluator constraints.',
          },
        ],
      },
    } as any);
    expect(diagnostics.source).toBe('synthesized_unknown');
    expect(diagnostics.reasonCode).toEqual([
      'G4_QI_SIGNAL_MISSING',
    ]);
    expect(diagnostics.reason.join(' | ')).toContain('source=synthesized_unknown');
  });


  it('derives FordRoman fail reason codes and exported diagnostics fields', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [
          {
            id: 'FordRomanQI',
            status: 'fail',
            note: 'reasonCode=G4_QI_SOURCE_NOT_METRIC;reasonCode=G4_QI_MARGIN_EXCEEDED;lhs_Jm3=-2;bound_Jm3=-1;boundComputed_Jm3=-0.75;boundFloor_Jm3=-1;boundUsed_Jm3=-1;boundFloorApplied=true;marginRatio=2;couplingMode=shadow;couplingAlpha=0.5;rhoMetric_Jm3=-10;rhoMetricSource=warp.metric.T00.natario.shift;rhoProxy_Jm3=-5;rhoProxySource=pipeline.rho_static;rhoCoupledShadow_Jm3=-7.5;couplingResidualRel=0.5;couplingComparable=true;couplingEquationRef=semiclassical_coupling+atomic_energy_to_energy_density_proxy;couplingSemantics=diagnostic_only_no_gate_override;metricT00Ref=warp.metric.T00.natario.shift;metricT00Geom=-0.25;metricT00GeomSource=direct_metric_pipeline;metricT00Si=-2.2;metricT00SiFromGeom=-2.2;metricT00SiRelError=0',
          },
          { id: 'ThetaAudit', status: 'pass', note: 'theta ok' },
        ],
      },
      certificate: {
        payload: {
          snapshot: {
            qi_lhs_Jm3: -2,
            qi_bound_Jm3: -1,
            qi_bound_computed_Jm3: -0.75,
            qi_bound_floor_Jm3: -1,
            qi_bound_policy_floor_Jm3: -1,
            qi_bound_env_floor_Jm3: -0.9,
            qi_bound_default_floor_Jm3: -0.5,
            qi_bound_fallback_abs_Jm3: 1,
            qi_bound_used_Jm3: -1,
            qi_bound_floor_applied: true,
            qi_margin_ratio: 2,
            qi_margin_ratio_raw: 2,
            qi_margin_ratio_raw_computed: 2.6666666667,
            qi_uncertainty_sigma_Jm3: 5,
            qi_uncertainty_sigma_measurement_Jm3: 1,
            qi_uncertainty_sigma_model_Jm3: 2,
            qi_uncertainty_sigma_bridge_Jm3: 5,
            qi_uncertainty_sigma_tau_Jm3: 0,
            qi_uncertainty_model_sigma_configured_Jm3: 2,
            qi_uncertainty_model_sigma_source: 'env:QI_UNCERTAINTY_SIGMA_MODEL_JM3',
            qi_uncertainty_model_sigma_rationale: 'configured_model_sigma_applied',
            qi_uncertainty_model_sigma_required: true,
            qi_uncertainty_model_sigma_provenance_ready: true,
            qi_uncertainty_model_sigma_provenance_missing: 'none',
            qi_uncertainty_dominant_component: 'bridge',
            qi_uncertainty_k_sigma: 3,
            qi_uncertainty_slack_policy_Jm3: -1,
            qi_uncertainty_slack_computed_Jm3: -1.25,
            qi_uncertainty_band_lower_policy_Jm3: -16,
            qi_uncertainty_band_upper_policy_Jm3: 14,
            qi_uncertainty_band_lower_computed_Jm3: -16.25,
            qi_uncertainty_band_upper_computed_Jm3: 13.75,
            qi_uncertainty_decision_class: 'indeterminate',
            qi_uncertainty_could_flip: true,
            qi_uncertainty_inputs_missing: 'none',
            qi_coupling_mode: 'shadow',
            qi_coupling_alpha: 0.5,
            qi_rho_metric_Jm3: -10,
            qi_rho_metric_source: 'warp.metric.T00.natario.shift',
            qi_rho_proxy_Jm3: -5,
            qi_rho_proxy_source: 'pipeline.rho_static',
            qi_rho_coupled_shadow_Jm3: -7.5,
            qi_coupling_residual_rel: 0.5,
            qi_coupling_comparable: true,
            qi_coupling_equation_ref: 'semiclassical_coupling+atomic_energy_to_energy_density_proxy',
            qi_coupling_semantics: 'diagnostic_only_no_gate_override',
            qi_rho_source: 'proxy',
            qi_metric_contract_status: 'missing',
            qi_applicability_status: 'PASS',
            qi_curvature_ok: true,
            qi_curvature_ratio: 0.5,
            qi_curvature_enforced: true,
            qi_bound_tau_s: 1,
            qi_tau_configured_s: 1,
            qi_tau_window_s: 0.2,
            qi_tau_pulse_s: 0.01,
            qi_tau_lc_s: 0.5,
            qi_tau_selected_s: 1,
            qi_tau_selected_source: 'configured',
            qi_tau_selector_policy: 'configured',
            qi_tau_selector_fallback_applied: false,
            qi_tau_provenance_ready: true,
            qi_tau_provenance_missing: 'tau_light_crossing_unavailable',
            qi_bound_K: 3,
            qi_safetySigma_Jm3: 4,
            qi_congruent_solve_policy_margin_pass: false,
            qi_congruent_solve_computed_margin_pass: false,
            qi_congruent_solve_applicability_pass: true,
            qi_congruent_solve_metric_pass: false,
            qi_congruent_solve_semantic_pass: true,
            qi_congruent_solve_pass: false,
            qi_congruent_solve_fail_reasons:
              'policy_margin_not_strict_lt_1|computed_margin_not_strict_lt_1|metric_contract_not_ok',
          },
        },
      },
    } as any);
    expect(diagnostics.reasonCode).toEqual(['G4_QI_SOURCE_NOT_METRIC', 'G4_QI_MARGIN_EXCEEDED']);
    expect(diagnostics.lhs_Jm3).toBe(-2);
    expect(diagnostics.bound_Jm3).toBe(-1);
    expect(diagnostics.boundComputed_Jm3).toBe(-0.75);
    expect(diagnostics.boundFloor_Jm3).toBe(-1);
    expect(diagnostics.boundPolicyFloor_Jm3).toBe(-1);
    expect(diagnostics.boundEnvFloor_Jm3).toBe(-0.9);
    expect(diagnostics.boundDefaultFloor_Jm3).toBe(-0.5);
    expect(diagnostics.boundFallbackAbs_Jm3).toBe(1);
    expect(diagnostics.boundUsed_Jm3).toBe(-1);
    expect(diagnostics.boundFloorApplied).toBe(true);
    expect(diagnostics.marginRatio).toBe(2);
    expect(diagnostics.marginRatioRawComputed).toBeCloseTo(2.6666666667);
    expect(diagnostics.uncertaintySigma_Jm3).toBe(5);
    expect(diagnostics.uncertaintySigmaMeasurement_Jm3).toBe(1);
    expect(diagnostics.uncertaintySigmaModel_Jm3).toBe(2);
    expect(diagnostics.uncertaintySigmaBridge_Jm3).toBe(5);
    expect(diagnostics.uncertaintySigmaTau_Jm3).toBe(0);
    expect(diagnostics.uncertaintyModelSigmaConfigured_Jm3).toBe(2);
    expect(diagnostics.uncertaintyModelSigmaSource).toBe('env:QI_UNCERTAINTY_SIGMA_MODEL_JM3');
    expect(diagnostics.uncertaintyModelSigmaRationale).toBe('configured_model_sigma_applied');
    expect(diagnostics.uncertaintyModelSigmaRequired).toBe(true);
    expect(diagnostics.uncertaintyModelSigmaProvenanceReady).toBe(true);
    expect(diagnostics.uncertaintyModelSigmaProvenanceMissing).toBe('none');
    expect(diagnostics.uncertaintyDominantComponent).toBe('bridge');
    expect(diagnostics.uncertaintyBandKSigma).toBe(3);
    expect(diagnostics.uncertaintySlackPolicy_Jm3).toBe(-1);
    expect(diagnostics.uncertaintySlackComputed_Jm3).toBe(-1.25);
    expect(diagnostics.uncertaintyBandLowerPolicy_Jm3).toBe(-16);
    expect(diagnostics.uncertaintyBandUpperPolicy_Jm3).toBe(14);
    expect(diagnostics.uncertaintyBandLowerComputed_Jm3).toBe(-16.25);
    expect(diagnostics.uncertaintyBandUpperComputed_Jm3).toBe(13.75);
    expect(diagnostics.uncertaintyDecisionClass).toBe('indeterminate');
    expect(diagnostics.uncertaintyCouldFlip).toBe(true);
    expect(diagnostics.uncertaintyInputsMissing).toBe('none');
    expect(diagnostics.couplingMode).toBe('shadow');
    expect(diagnostics.couplingAlpha).toBe(0.5);
    expect(diagnostics.rhoMetric_Jm3).toBe(-10);
    expect(diagnostics.rhoMetricSource).toBe('warp.metric.T00.natario.shift');
    expect(diagnostics.rhoProxy_Jm3).toBe(-5);
    expect(diagnostics.rhoProxySource).toBe('pipeline.rho_static');
    expect(diagnostics.rhoCoupledShadow_Jm3).toBe(-7.5);
    expect(diagnostics.couplingResidualRel).toBe(0.5);
    expect(diagnostics.couplingComparable).toBe(true);
    expect(diagnostics.couplingEquationRef).toContain('semiclassical_coupling');
    expect(diagnostics.couplingSemantics).toBe('diagnostic_only_no_gate_override');
    expect(diagnostics.metricContractStatus).toBe('missing');
    expect(diagnostics.metricT00Ref).toBe('warp.metric.T00.natario.shift');
    expect(diagnostics.metricT00Geom).toBe(-0.25);
    expect(diagnostics.metricT00GeomSource).toBe('direct_metric_pipeline');
    expect(diagnostics.metricT00Si).toBe(-2.2);
    expect(diagnostics.metricT00SiFromGeom).toBe(-2.2);
    expect(diagnostics.metricT00SiRelError).toBe(0);
    expect(diagnostics.tauConfigured_s).toBe(1);
    expect(diagnostics.tauWindow_s).toBe(0.2);
    expect(diagnostics.tauPulse_s).toBe(0.01);
    expect(diagnostics.tauLC_s).toBe(0.5);
    expect(diagnostics.tauSelected_s).toBe(1);
    expect(diagnostics.tauSelectedSource).toBe('configured');
    expect(diagnostics.tauSelectorPolicy).toBe('configured');
    expect(diagnostics.tauSelectorFallbackApplied).toBe(false);
    expect(diagnostics.tauProvenanceReady).toBe(true);
    expect(diagnostics.tauProvenanceMissing).toBe('tau_light_crossing_unavailable');
    expect(diagnostics.congruentSolvePolicyMarginPass).toBe(false);
    expect(diagnostics.congruentSolveComputedMarginPass).toBe(false);
    expect(diagnostics.congruentSolveApplicabilityPass).toBe(true);
    expect(diagnostics.congruentSolveMetricPass).toBe(false);
    expect(diagnostics.congruentSolveSemanticPass).toBe(true);
    expect(diagnostics.congruentSolvePass).toBe(false);
    expect(diagnostics.congruentSolveFailReasons).toEqual([
      'policy_margin_not_strict_lt_1',
      'computed_margin_not_strict_lt_1',
      'metric_contract_not_ok',
    ]);
  });

  it('treats null snapshot numerics as missing instead of coercing to 0', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [
          {
            id: 'FordRomanQI',
            status: 'fail',
            note: 'lhs_Jm3=-9;bound_Jm3=-3;marginRatio=3;K=7;safetySigma_Jm3=11',
          },
          { id: 'ThetaAudit', status: 'pass', note: 'theta ok' },
        ],
      },
      certificate: {
        payload: {
          snapshot: {
            qi_lhs_Jm3: null,
            qi_bound_Jm3: null,
            qi_margin_ratio: null,
            qi_bound_K: null,
            qi_safetySigma_Jm3: null,
          },
        },
      },
    } as any);

    expect(diagnostics.lhs_Jm3).toBe(-9);
    expect(diagnostics.bound_Jm3).toBe(-3);
    expect(diagnostics.marginRatio).toBe(3);
    expect(diagnostics.K).toBe(7);
    expect(diagnostics.safetySigma_Jm3).toBe(11);
  });

  it('treats undefined and placeholder snapshot numerics as missing without coercion', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [
          {
            id: 'FordRomanQI',
            status: 'fail',
            note: 'marginRatio=2;K=13;safetySigma_Jm3=17',
          },
          { id: 'ThetaAudit', status: 'pass', note: 'theta ok' },
        ],
      },
      certificate: {
        payload: {
          snapshot: {
            qi_margin_ratio: undefined,
            qi_bound_K: 'unknown',
            qi_safetySigma_Jm3: 'n/a',
            qi_bound_tau_s: '',
          },
        },
      },
    } as any);

    expect(diagnostics.marginRatio).toBe(2);
    expect(diagnostics.K).toBe(13);
    expect(diagnostics.safetySigma_Jm3).toBe(17);
    expect(diagnostics.tau_s).toBeUndefined();
  });

  it('preserves deterministic reasonCode ordering when extracted from notes', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [
          {
            id: 'FordRomanQI',
            status: 'fail',
            note: 'reasonCode=G4_QI_MARGIN_EXCEEDED;reasonCode=G4_QI_SOURCE_NOT_METRIC',
          },
          {
            id: 'ThetaAudit',
            status: 'unknown',
            note: 'reasonCode=G4_QI_SIGNAL_MISSING;reasonCode=G4_QI_MARGIN_EXCEEDED',
          },
        ],
      },
    } as any);

    expect(diagnostics.reasonCode).toEqual([
      'G4_QI_SIGNAL_MISSING',
      'G4_QI_SOURCE_NOT_METRIC',
      'G4_QI_MARGIN_EXCEEDED',
    ]);
  });

  it('does not emit generic synthesized fallback when source values are available', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [
          { id: 'FordRomanQI', status: 'pass', note: 'FordRomanQI evaluated from warp viability.' },
          { id: 'ThetaAudit', status: 'fail', note: 'ThetaAudit evaluated from warp viability.' },
        ],
      },
    } as any);
    expect(diagnostics.source).toBe('evaluator_constraints');
    expect(diagnostics.reasonCode).toEqual([]);
    expect(diagnostics.reason.join(' | ')).not.toContain('synthesized unknown diagnostics');
  });

  it('flags synthesized_unknown when both G4 entries are absent', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [{ id: 'OtherConstraint', status: 'pass', note: 'not part of G4' }],
      },
    } as any);
    expect(diagnostics.fordRomanStatus).toBe('missing');
    expect(diagnostics.thetaAuditStatus).toBe('missing');
    expect(diagnostics.source).toBe('synthesized_unknown');
    expect(diagnostics.reasonCode).toEqual([
      'G4_QI_SIGNAL_MISSING',
    ]);
  });

  it('flags synthesized_unknown for partial G4 payloads without false evaluator attribution', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [{ id: 'ThetaAudit', status: 'pass', note: 'ThetaAudit evaluated from warp viability.' }],
      },
    } as any);
    expect(diagnostics.fordRomanStatus).toBe('missing');
    expect(diagnostics.thetaAuditStatus).toBe('pass');
    expect(diagnostics.source).toBe('synthesized_unknown');
    expect(diagnostics.reasonCode).toEqual(['G4_QI_SIGNAL_MISSING']);
  });



  it('keeps canonical snapshot values when fallback note text is non-numeric', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [
          {
            id: 'FordRomanQI',
            status: 'fail',
            note: 'marginRatioRaw=unknown;marginRatio=n/a;applicabilityStatus=NOT_APPLICABLE;rhoSource=proxy',
          },
          { id: 'ThetaAudit', status: 'pass', note: 'theta ok' },
        ],
      },
      certificate: {
        payload: {
          snapshot: {
            qi_margin_ratio_raw: 0.75,
            qi_margin_ratio_raw_computed: 1.25,
            qi_margin_ratio: 0.5,
            qi_applicability_status: 'PASS',
            qi_rho_source: 'gr.rho_constraint',
          },
        },
      },
    } as any);
    expect(diagnostics.marginRatioRaw).toBe(0.75);
    expect(diagnostics.marginRatioRawComputed).toBe(1.25);
    expect(diagnostics.marginRatio).toBe(0.5);
    expect(diagnostics.applicabilityStatus).toBe('PASS');
    expect(diagnostics.rhoSource).toBe('gr.rho_constraint');
    expect(diagnostics.g4PolicyExceeded).toBeUndefined();
  });

  it('builds qi-forensics payload with finite-or-null numeric hygiene', () => {
    const pack = {
      runId: 'run-1',
      wave: 'A',
      seed: 7,
      completedAt: '2026-02-24T00:00:00.000Z',
      g4Diagnostics: {
        lhs_Jm3: Number.NaN,
        bound_Jm3: -2,
        marginRatioRaw: Infinity,
        marginRatioRawComputed: 3.25,
        uncertaintySigma_Jm3: 9,
        uncertaintySigmaMeasurement_Jm3: 2,
        uncertaintySigmaModel_Jm3: 3,
        uncertaintySigmaBridge_Jm3: 9,
        uncertaintySigmaTau_Jm3: 0,
        uncertaintyDominantComponent: 'bridge',
        uncertaintyBandKSigma: 3,
        uncertaintySlackPolicy_Jm3: -0.5,
        uncertaintySlackComputed_Jm3: -2.5,
        uncertaintyBandLowerPolicy_Jm3: -27.5,
        uncertaintyBandUpperPolicy_Jm3: 26.5,
        uncertaintyBandLowerComputed_Jm3: -29.5,
        uncertaintyBandUpperComputed_Jm3: 24.5,
        uncertaintyDecisionClass: 'indeterminate',
        uncertaintyCouldFlip: true,
        uncertaintyInputsMissing: 'none',
        g4FloorDominated: true,
        g4PolicyExceeded: true,
        g4ComputedExceeded: true,
        g4DualFailMode: 'both',
        marginRatio: 0.5,
        tau_s: undefined,
        tauConfigured_s: 0.005,
        tauWindow_s: 0.01,
        tauPulse_s: Number.NaN,
        tauLC_s: 0.1,
        tauSelected_s: 0.005,
        tauSelectedSource: 'configured',
        tauSelectorPolicy: 'configured',
        tauSelectorFallbackApplied: false,
        tauProvenanceReady: true,
        tauProvenanceMissing: 'tau_pulse_unavailable',
        K: 12,
        safetySigma_Jm3: Number.NaN,
        metricT00Ref: 'warp.metric.T00.natario.shift',
        metricT00Geom: 1.5,
        metricT00GeomSource: 'direct_metric_pipeline',
        metricT00Si: Number.NaN,
        metricT00SiFromGeom: 2.5,
        metricT00SiRelError: 0.01,
        curvatureRatio: 1,
        curvatureEnforced: true,
        curvatureOk: false,
        applicabilityStatus: 'FAIL',
        congruentSolvePolicyMarginPass: true,
        congruentSolveComputedMarginPass: false,
        congruentSolveApplicabilityPass: true,
        congruentSolveMetricPass: true,
        congruentSolveSemanticPass: true,
        congruentSolvePass: false,
        congruentSolveFailReasons: ['computed_margin_not_strict_lt_1'],
        rhoSource: 'gr.rho_constraint',
        reasonCode: ['G4_QI_MARGIN_EXCEEDED'],
      },
    } as any;
    const attempt = {
      certificate: {
        payload: {
          snapshot: {
            qi_metric_derived: true,
            qi_metric_contract_ok: false,
            qi_curvature_scalar: Number.NaN,
            qi_curvature_radius_m: 4,
            qiGuardrail: {
              effectiveRho: Number.NaN,
              rhoOn: -1,
              sampler: 'gaussian',
              fieldType: 'em',
            },
          },
        },
      },
    } as any;
    const artifact = buildQiForensicsArtifact(pack, attempt);
    expect(artifact.lhs_Jm3).toBeNull();
    expect(artifact.bound_Jm3).toBe(-2);
    expect(artifact.marginRatioRaw).toBeNull();
    expect(artifact.marginRatioRawComputed).toBe(3.25);
    expect(artifact.uncertaintySigma_Jm3).toBe(9);
    expect(artifact.uncertaintySigmaMeasurement_Jm3).toBe(2);
    expect(artifact.uncertaintySigmaModel_Jm3).toBe(3);
    expect(artifact.uncertaintySigmaBridge_Jm3).toBe(9);
    expect(artifact.uncertaintySigmaTau_Jm3).toBe(0);
    expect(artifact.uncertaintyDominantComponent).toBe('bridge');
    expect(artifact.uncertaintyBandKSigma).toBe(3);
    expect(artifact.uncertaintySlackPolicy_Jm3).toBe(-0.5);
    expect(artifact.uncertaintySlackComputed_Jm3).toBe(-2.5);
    expect(artifact.uncertaintyBandLowerPolicy_Jm3).toBe(-27.5);
    expect(artifact.uncertaintyBandUpperPolicy_Jm3).toBe(26.5);
    expect(artifact.uncertaintyBandLowerComputed_Jm3).toBe(-29.5);
    expect(artifact.uncertaintyBandUpperComputed_Jm3).toBe(24.5);
    expect(artifact.uncertaintyDecisionClass).toBe('indeterminate');
    expect(artifact.uncertaintyCouldFlip).toBe(true);
    expect(artifact.uncertaintyInputsMissing).toBe('none');
    expect(artifact.g4FloorDominated).toBe(true);
    expect(artifact.g4PolicyExceeded).toBe(true);
    expect(artifact.g4ComputedExceeded).toBe(true);
    expect(artifact.g4DualFailMode).toBe('both');
    expect(artifact.marginRatioClamped).toBe(0.5);
    expect(artifact.effectiveRho_SI_Jm3).toBeNull();
    expect(artifact.rhoOn_SI_Jm3).toBe(-1);
    expect(artifact.metricT00Ref).toBe('warp.metric.T00.natario.shift');
    expect(artifact.metricT00Geom_GeomStress).toBe(1.5);
    expect(artifact.metricT00GeomSource).toBe('direct_metric_pipeline');
    expect(artifact.metricT00Si_Jm3).toBeNull();
    expect(artifact.metricT00SiFromGeom_Jm3).toBe(2.5);
    expect(artifact.metricT00SiRelError).toBe(0.01);
    expect(artifact.curvatureScalar).toBeNull();
    expect(artifact.curvatureRadius_m).toBe(4);
    expect(artifact.tauConfigured_s).toBe(0.005);
    expect(artifact.tauWindow_s).toBe(0.01);
    expect(artifact.tauPulse_s).toBeNull();
    expect(artifact.tauLC_s).toBe(0.1);
    expect(artifact.tauSelected_s).toBe(0.005);
    expect(artifact.tauSelectedSource).toBe('configured');
    expect(artifact.tauSelectorPolicy).toBe('configured');
    expect(artifact.tauSelectorFallbackApplied).toBe(false);
    expect(artifact.tauProvenanceReady).toBe(true);
    expect(artifact.tauProvenanceMissing).toBe('tau_pulse_unavailable');
    expect(artifact.samplingKernelIdentity).toBe('gaussian');
    expect(artifact.samplingKernelNormalization).toBeNull();
    expect(artifact.KUnits).toBe('J*s^4/m^3');
    expect(artifact.KProvenanceCommit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(artifact.KDerivation).toBe('ford_roman_bound_constant_from_qi_guard');
    expect(artifact.curvatureRatioNonDegenerate).toBe(true);
    expect(artifact.congruentSolvePolicyMarginPass).toBe(true);
    expect(artifact.congruentSolveComputedMarginPass).toBe(false);
    expect(artifact.congruentSolveApplicabilityPass).toBe(true);
    expect(artifact.congruentSolveMetricPass).toBe(true);
    expect(artifact.congruentSolveSemanticPass).toBe(true);
    expect(artifact.congruentSolvePass).toBe(false);
    expect(artifact.congruentSolveFailReasons).toEqual(['computed_margin_not_strict_lt_1']);
  });


  it('parses deterministic g4 governance decomposition fields', () => {
    const diagnostics = deriveG4Diagnostics({
      evaluation: {
        constraints: [
          {
            id: 'FordRomanQI',
            status: 'fail',
            note: 'g4FloorDominated=true;g4PolicyExceeded=true;g4ComputedExceeded=true;g4DualFailMode=both',
          },
          { id: 'ThetaAudit', status: 'pass', note: 'ok' },
        ],
      },
      certificate: {
        payload: {
          snapshot: {
            qi_g4_floor_dominated: true,
            qi_g4_policy_exceeded: true,
            qi_g4_computed_exceeded: true,
            qi_g4_dual_fail_mode: 'both',
          },
        },
      },
    } as any);

    expect(diagnostics.g4FloorDominated).toBe(true);
    expect(diagnostics.g4PolicyExceeded).toBe(true);
    expect(diagnostics.g4ComputedExceeded).toBe(true);
    expect(diagnostics.g4DualFailMode).toBe('both');
  });
  it('derives deterministic first-fail from canonical gate order', () => {
    const gateMap = {
      G0: { status: 'PASS', reason: 'ok', source: 'x' },
      G1: { status: 'PASS', reason: 'ok', source: 'x' },
      G2: { status: 'FAIL', reason: 'hard fail', source: 'x' },
      G3: { status: 'FAIL', reason: 'later fail', source: 'x' },
      G4: { status: 'PASS', reason: 'ok', source: 'x' },
      G6: { status: 'PASS', reason: 'ok', source: 'x' },
      G7: { status: 'PASS', reason: 'ok', source: 'x' },
      G8: { status: 'PASS', reason: 'ok', source: 'x' },
    } as const;
    expect(deriveFirstFail(gateMap as any)).toEqual({ firstFail: 'G2', reason: 'hard fail' });
    expect(deriveFirstFail(gateMap as any)).toEqual({ firstFail: 'G2', reason: 'hard fail' });
  });

  it('G7/G8 compare latest attempt semantics for repeated runs', () => {
    const mk = (gateStatusA0: string, gateStatusA1: string, constraintsA0: unknown[], constraintsA1: unknown[]) =>
      ({
        attempts: [
          { evaluation: { gate: { status: gateStatusA0 }, constraints: constraintsA0 } },
          { evaluation: { gate: { status: gateStatusA1 }, constraints: constraintsA1 } },
        ],
      }) as any;

    const runResults = [
      mk('pass', 'fail', [{ id: 'FordRomanQI', status: 'pass' }], [{ id: 'FordRomanQI', status: 'fail' }]),
      mk('pass', 'fail', [{ id: 'FordRomanQI', status: 'pass' }], [{ id: 'FordRomanQI', status: 'fail' }]),
    ];

    const gatesC = buildGateMap('C', runResults, [] as any);
    const gatesD = buildGateMap('D', runResults, [] as any);
    expect(gatesC.G7.status).toBe('PASS');
    expect(gatesD.G8.status).toBe('PASS');
  });

  it('G8 parity ignores volatile constraint note fields and compares semantic signatures', () => {
    const mk = (constraintsA1: unknown[]) =>
      ({
        attempts: [
          { evaluation: { gate: { status: 'fail' }, constraints: [{ id: 'FordRomanQI', status: 'fail' }] } },
          { evaluation: { gate: { status: 'fail' }, constraints: constraintsA1 } },
        ],
      }) as any;

    const runResults = [
      mk([
        {
          id: 'FordRomanQI',
          status: 'fail',
          reasonCode: ['G4_QI_MARGIN_EXCEEDED'],
          note: 'lhs_Jm3=-1.0e9; bound_Jm3=-1.0e9; marginRatioRaw=1',
        },
      ]),
      mk([
        {
          id: 'FordRomanQI',
          status: 'fail',
          reasonCode: ['G4_QI_MARGIN_EXCEEDED'],
          note: 'lhs_Jm3=-9.9e8; bound_Jm3=-9.9e8; marginRatioRaw=1',
        },
      ]),
    ];

    const gatesD = buildGateMap('D', runResults, [] as any);
    expect(gatesD.G8.status).toBe('PASS');
  });

  it('G7/G8 return NOT_READY with explicit missing evaluation reasons', () => {
    const incompleteRuns = [
      { attempts: [{ evaluation: { gate: {}, constraints: [] } }] },
      { attempts: [] },
    ] as any;
    const gatesC = buildGateMap('C', incompleteRuns, [] as any);
    const gatesD = buildGateMap('D', incompleteRuns, [] as any);
    expect(gatesC.G7.status).toBe('NOT_READY');
    expect(gatesC.G7.reason).toContain('missing_latest_evaluation');
    expect(gatesC.G7.reason).toContain('missing_gate_status');
    expect(gatesD.G8.status).toBe('NOT_READY');
    expect(gatesD.G8.reason).toContain('missing_constraints_payload');
  });



  it('parses timeout args strictly as finite integers', () => {
    expect(() => parsePositiveIntArg('abc', 'wave-timeout-ms')).toThrow(/positive integer in milliseconds/);
    expect(() => parsePositiveIntArg('1.2', 'campaign-timeout-ms')).toThrow(/positive integer in milliseconds/);
    expect(() => parsePositiveIntArg('0', 'campaign-timeout-ms')).toThrow(/positive integer in milliseconds/);
    expect(() => parseArgs(['--wave-timeout-ms', 'abc'])).toThrow(/Invalid --wave-timeout-ms value/);
    expect(() => parseArgs(['--campaign-timeout-ms', '1.2'])).toThrow(/Invalid --campaign-timeout-ms value/);
  });

  it('keeps CI fast-path opt-in and independent from --ci', () => {
    const ciOnly = parseArgs(['--ci']);
    expect(ciOnly.ci).toBe(true);
    expect(ciOnly.ciFastPath).toBe(false);

    const ciFast = parseArgs(['--ci', '--ci-fast-path']);
    expect(ciFast.ci).toBe(true);
    expect(ciFast.ciFastPath).toBe(true);

    const localFast = parseArgs(['--ci-fast-path']);
    expect(localFast.ci).toBe(false);
    expect(localFast.ciFastPath).toBe(true);
  });

  it('keeps promotion args optional with deterministic defaults', () => {
    const args = parseArgs([]);
    expect(args.promoteCandidateId).toBeNull();
    expect(args.autoPromoteReadyCandidate).toBe(false);
    expect(args.forcePromotedProfile).toBe(false);
    expect(args.allowExploratoryWaveProfiles).toBe(false);
    expect(typeof args.promotionCheckPath).toBe('string');
    expect(args.promotionCheckPath).toContain('g4-candidate-promotion-check');
  });

  it('parses --force-promoted-profile as an explicit canonical-profile lock', () => {
    const args = parseArgs(['--force-promoted-profile']);
    expect(args.forcePromotedProfile).toBe(true);
    expect(args.promoteCandidateId).toBeNull();
  });

  it('uses baseline wave profiles by default when no promotion flags are set', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-promo-profile-'));
    const promotionPath = path.join(tmpRoot, 'promotion-check.json');
    fs.writeFileSync(
      promotionPath,
      JSON.stringify(
        {
          blockedReason: null,
          candidate: {
            id: 'case_0001',
            params: {
              warpFieldType: 'natario_sdf',
              gammaGeo: 1,
              dutyCycle: 0.12,
              dutyShip: 0.12,
              dutyEffective_FR: 0.12,
              sectorCount: 80,
              concurrentSectors: 2,
              gammaVanDenBroeck: 500,
              qCavity: 100000,
              qSpoilingFactor: 3,
              gap_nm: 8,
              bubbleRadius_m: 2,
              sampler: 'hann',
              fieldType: 'em',
              tau_s_ms: 0.02,
            },
            applicabilityStatus: 'PASS',
            comparabilityClass: 'comparable_canonical',
            marginRatioRaw: 0.1,
            marginRatioRawComputed: 0.1,
          },
          aggregate: {
            candidatePromotionReady: true,
            candidatePromotionStable: true,
          },
        },
        null,
        2,
      ),
    );

    const canonicalProfiles = resolveWaveProfiles({
      promoteCandidateId: null,
      promotionCheckPath: promotionPath,
      allowExploratoryWaveProfiles: false,
    });

    expect(canonicalProfiles.A.options.proposals?.[0]?.label).toContain('wave-a-natario-baseline');
  });

  it('resolves promoted wave profiles when an explicit candidate is requested', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-promo-profile-explicit-'));
    const promotionPath = path.join(tmpRoot, 'promotion-check.json');
    fs.writeFileSync(
      promotionPath,
      JSON.stringify(
        {
          blockedReason: null,
          candidate: {
            id: 'case_0001',
            params: {
              warpFieldType: 'natario_sdf',
              gammaGeo: 1,
              dutyCycle: 0.12,
              dutyShip: 0.12,
              dutyEffective_FR: 0.12,
              sectorCount: 80,
              concurrentSectors: 2,
              gammaVanDenBroeck: 500,
              qCavity: 100000,
              qSpoilingFactor: 3,
              gap_nm: 8,
              bubbleRadius_m: 2,
              sampler: 'hann',
              fieldType: 'em',
              tau_s_ms: 0.02,
            },
            applicabilityStatus: 'PASS',
            comparabilityClass: 'comparable_canonical',
            marginRatioRaw: 0.1,
            marginRatioRawComputed: 0.1,
          },
          aggregate: {
            candidatePromotionReady: true,
            candidatePromotionStable: true,
          },
        },
        null,
        2,
      ),
    );

    const promotedProfiles = resolveWaveProfiles({
      promoteCandidateId: 'case_0001',
      promotionCheckPath: promotionPath,
      allowExploratoryWaveProfiles: false,
    });
    expect(promotedProfiles.A.options.proposals?.[0]?.label).toContain('promoted-case_0001');
    expect((promotedProfiles.A.options.proposals?.[0]?.params as any)?.warpFieldType).toBe('natario_sdf');
    expect((promotedProfiles.A.options.proposals?.[0]?.params as any)?.qi?.tau_s_ms).toBe(0.02);
  });

  it('forces NHM2 promoted profile independently of promotion artifact readiness', () => {
    const profiles = resolveWaveProfiles({
      promoteCandidateId: null,
      promotionCheckPath: path.join(os.tmpdir(), 'missing-promotion-check-forced.json'),
      forcePromotedProfile: true,
      allowExploratoryWaveProfiles: false,
    });

    expect(profiles.A.options.proposals?.[0]?.label).toContain('promoted-profile-NHM2-2026-03-01');
    const params = profiles.A.options.proposals?.[0]?.params as any;
    expect(params?.warpFieldType).toBe('natario_sdf');
    expect(params?.dutyCycle).toBe(0.12);
    expect(params?.gammaVanDenBroeck).toBe(500);
    expect(params?.qi?.sampler).toBe('hann');
    expect(params?.qi?.tau_s_ms).toBe(0.02);
  });

  it('fails closed for promotion profile when candidate is not promotion-ready', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-promo-blocked-'));
    const promotionPath = path.join(tmpRoot, 'promotion-check.json');
    fs.writeFileSync(
      promotionPath,
      JSON.stringify(
        {
          blockedReason: null,
          candidate: {
            id: 'case_0009',
            params: { warpFieldType: 'natario_sdf' },
            applicabilityStatus: 'PASS',
            comparabilityClass: 'comparable_canonical',
            marginRatioRaw: 0.1,
            marginRatioRawComputed: 0.1,
          },
          aggregate: {
            candidatePromotionReady: false,
            candidatePromotionStable: false,
          },
        },
        null,
        2,
      ),
    );

    expect(() =>
      resolveWaveProfiles({
        promoteCandidateId: 'case_0009',
        promotionCheckPath: promotionPath,
        allowExploratoryWaveProfiles: false,
      }),
    ).toThrow(/candidatePromotionReady=false/);
  });

  it('allows legacy exploratory wave profiles only when explicitly opted in', () => {
    const profiles = resolveWaveProfiles({
      promoteCandidateId: null,
      promotionCheckPath: path.join(os.tmpdir(), 'missing-promotion-check.json'),
      allowExploratoryWaveProfiles: true,
    });
    expect(profiles.A.options.proposals?.[0]?.label).toContain('wave-a-natario-baseline');
  });

  it('uses baseline profiles by default when promotion artifact is unavailable', () => {
    const profiles = resolveWaveProfiles({
      promoteCandidateId: null,
      promotionCheckPath: path.join(os.tmpdir(), 'missing-promotion-check.json'),
      allowExploratoryWaveProfiles: false,
    });
    expect(profiles.A.options.proposals?.[0]?.label).toContain('wave-a-natario-baseline');
  });

  it('auto-promotes wave profiles when requested and promotion artifact is ready', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-promo-auto-'));
    const promotionPath = path.join(tmpRoot, 'promotion-check.json');
    fs.writeFileSync(
      promotionPath,
      JSON.stringify(
        {
          blockedReason: null,
          candidate: {
            id: 'case_0001',
            params: {
              warpFieldType: 'natario_sdf',
              gammaGeo: 1,
              dutyCycle: 0.12,
              dutyShip: 0.12,
              dutyEffective_FR: 0.12,
              sectorCount: 80,
              concurrentSectors: 2,
              gammaVanDenBroeck: 500,
              qCavity: 100000,
              qSpoilingFactor: 3,
              gap_nm: 8,
              bubbleRadius_m: 2,
              sampler: 'hann',
              fieldType: 'em',
              tau_s_ms: 0.02,
            },
            applicabilityStatus: 'PASS',
            comparabilityClass: 'comparable_canonical',
            marginRatioRaw: 0.1,
            marginRatioRawComputed: 0.1,
          },
          aggregate: {
            candidatePromotionReady: true,
            candidatePromotionStable: true,
          },
        },
        null,
        2,
      ),
    );

    const autoPromotedProfiles = resolveWaveProfiles({
      promoteCandidateId: null,
      promotionCheckPath: promotionPath,
      autoPromoteReadyCandidate: true,
      allowExploratoryWaveProfiles: false,
    });

    expect(autoPromotedProfiles.A.options.proposals?.[0]?.label).toContain('promoted-case_0001');
    expect((autoPromotedProfiles.A.options.proposals?.[0]?.params as any)?.warpFieldType).toBe('natario_sdf');
    expect((autoPromotedProfiles.A.options.proposals?.[0]?.params as any)?.qi?.tau_s_ms).toBe(0.02);
  });

  it('marks gates NOT_READY when required signals are missing', () => {
    const incompleteRuns = [{ attempts: [{ initial: {}, evaluation: { gate: {}, constraints: [] } }] }] as any;
    const gates = buildGateMap('A', incompleteRuns, [] as any);
    expect(gates.G1.status).toBe('NOT_READY');
    expect(gates.G2.status).toBe('NOT_READY');
    expect(gates.G4.status).toBe('NOT_READY');
  });

  it('cross-wave aggregation uses deterministic precedence', () => {
    const aggregate = aggregateGateStatusAcrossWaves([
      { G7: 'PASS', G8: 'NOT_APPLICABLE' },
      { G7: 'UNKNOWN', G8: 'PASS' },
      { G7: 'NOT_READY', G8: 'PASS' },
      { G7: 'FAIL', G8: 'PASS' },
    ]);
    expect(aggregate.G7).toBe('FAIL');
    expect(aggregate.G8).toBe('PASS');
    expect(deriveCampaignDecision(summarizeScoreboard(aggregate).counts)).toBe('INADMISSIBLE');
  });

  it('G6 reflects raw artifact evidence and explicit missing evaluator signals', () => {
    const runResults = [{ attempts: [] }] as any;
    const runArtifacts = [{ outputPath: __filename, runIndex: 1, startedAt: '', completedAt: '', durationMs: 1, accepted: false, state: 'error', attemptCount: 0 }] as any;
    const gates = buildGateMap('A', runResults, runArtifacts);
    expect(gates.G6.status).toBe('FAIL');
    expect(gates.G6.reason).toContain('Raw run outputs persisted but evaluator signals are missing');
  });

  it('CLI completes within bounded time (no hang)', async () => {
    const cliPath = path.resolve('scripts/warp-full-solve-campaign-cli.ts');
    const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-wave-bounded-'));
    const outDir = path.join(tempRoot, 'out');
    const { stdout } = await execFileAsync(process.execPath, [
      tsxCli,
      cliPath,
      '--wave',
      'A',
      '--out',
      outDir,
      '--ci',
      '--wave-timeout-ms',
      '4000',
      '--campaign-timeout-ms',
      '10000',
    ], {
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });
    expect(stdout).toContain('"ok": true');
  }, 50_000);

  it('synthesizes trailing run artifacts when a multi-run wave exits early', async () => {
    const cliPath = path.resolve('scripts/warp-full-solve-campaign-cli.ts');
    const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-wave-synth-'));
    const outDir = path.join(tempRoot, 'out');
    await execFileAsync(process.execPath, [
      tsxCli,
      cliPath,
      '--wave',
      'C',
      '--out',
      outDir,
      '--ci',
      '--wave-timeout-ms',
      '1',
      '--campaign-timeout-ms',
      '2000',
    ], {
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });
    const run1Path = path.join(outDir, 'C', 'run-1-raw-output.json');
    const run2Path = path.join(outDir, 'C', 'run-2-raw-output.json');
    expect(fs.existsSync(run1Path)).toBe(true);
    expect(fs.existsSync(run2Path)).toBe(true);
    const run2 = JSON.parse(fs.readFileSync(run2Path, 'utf8'));
    expect(run2.runIndex).toBe(2);
    expect(run2.skipped).toBe(true);
    expect(run2.durationMs).toBe(0);
    expect(typeof run2.error).toBe('string');
  }, 50_000);

  it('emits executive translation reference in wave evidence pack', async () => {
    const cliPath = path.resolve('scripts/warp-full-solve-campaign-cli.ts');
    const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-wave-translation-ref-'));
    const outDir = path.join(tempRoot, 'out');
    await execFileAsync(process.execPath, [
      tsxCli,
      cliPath,
      '--wave',
      'C',
      '--out',
      outDir,
      '--ci',
      '--wave-timeout-ms',
      '1',
      '--campaign-timeout-ms',
      '2000',
    ], {
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });
    const evidencePath = path.join(outDir, 'C', 'evidence-pack.json');
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    expect(typeof evidence.executiveTranslationRef).toBe('string');
    expect(String(evidence.executiveTranslationRef)).toContain('docs/audits/research/warp-gates-executive-translation-2026-02-24.md');
  }, 50_000);

  it('temp --out campaign run does not mutate canonical readiness report', async () => {
    const cliPath = path.resolve('scripts/warp-full-solve-campaign-cli.ts');
    const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
    const canonicalReport = path.resolve('docs/audits/research/warp-full-solve-campaign-execution-report-2026-02-24.md');
    const before = fs.readFileSync(canonicalReport, 'utf8');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-noncanonical-report-'));
    const outDir = path.join(tempRoot, 'out');

    await execFileAsync(process.execPath, [
      tsxCli,
      cliPath,
      '--wave',
      'A',
      '--out',
      outDir,
      '--ci',
      '--wave-timeout-ms',
      '1000',
      '--campaign-timeout-ms',
      '5000',
    ], {
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });

    const after = fs.readFileSync(canonicalReport, 'utf8');
    expect(after).toBe(before);
  }, 50_000);


  it('residualTrend is FAIL when non-decreasing and PASS when strictly decreasing', () => {
    const nonDecreasing = computeReproducibility([
      { attempts: [{ initial: { residual: 1 }, evaluation: { gate: { status: 'pass' }, constraints: [] } }] },
      { attempts: [{ initial: { residual: 1 }, evaluation: { gate: { status: 'pass' }, constraints: [] } }] },
    ] as any);
    expect(nonDecreasing.residualTrend.status).toBe('FAIL');
    expect(nonDecreasing.residualTrend.trend).toBe('non_decreasing');

    const decreasing = computeReproducibility([
      { attempts: [{ initial: { residual: 2 }, evaluation: { gate: { status: 'pass' }, constraints: [] } }] },
      { attempts: [{ initial: { residual: 1 }, evaluation: { gate: { status: 'pass' }, constraints: [] } }] },
    ] as any);
    expect(decreasing.residualTrend.status).toBe('PASS');
    expect(decreasing.residualTrend.trend).toBe('decreasing');
  });




  it('computes parity freshness from parity provenance commit vs HEAD in report generation logic', () => {
    const campaignScript = fs.readFileSync(path.resolve('scripts/warp-full-solve-campaign.ts'), 'utf8');
    expect(campaignScript).toContain(`const recoveryParityProvenanceCommit = typeof recoveryParity?.provenance?.commitHash === 'string' ? recoveryParity.provenance.commitHash : null;`);
    expect(campaignScript).toContain('const recoveryParityProvenanceFresh = recoveryParityProvenanceCommit != null && recoveryParityProvenanceCommit === recoveryHeadCommit;');
    expect(campaignScript).not.toContain('recoveryParity?.provenance?.recoveryProvenanceFresh === true');
  });

  it('campaign report template includes recovery/operator/sampling-provenance sections', () => {
    const campaignScript = fs.readFileSync(path.resolve('scripts/warp-full-solve-campaign.ts'), 'utf8');
    expect(campaignScript).toContain('## G4 recovery-search summary');
    expect(campaignScript).toContain('## G4 operator-mapping summary');
    expect(campaignScript).toContain('## G4 sampling/K provenance summary');
    expect(campaignScript).toContain('## G4 curvature applicability summary');
    expect(campaignScript).toContain('## G4 uncertainty-band summary');
    expect(campaignScript).toContain('canonical decision remains authoritative until wave profiles are promoted and rerun.');
  });

  it('marks provenance signals as missing when pipeline provenance fields are unavailable', () => {
    const attempt = {
      initial: { status: 'CERTIFIED' },
      evaluation: {
        gate: { status: 'pass' },
        constraints: [
          { id: 'FordRomanQI', status: 'pass' },
          { id: 'ThetaAudit', status: 'pass' },
        ],
        certificate: { certificateHash: 'abc', integrityOk: true },
      },
    } as any;
    const latestResult = {
      finalState: {
        qi_applicability_status: 'PASS',
        qi_curvature_ok: true,
        qi_curvature_ratio: 0.5,
        qi_quantity_semantic_base_type: 'classical_proxy_from_curvature',
        qi_quantity_semantic_type: 'ren_expectation_timelike_energy_density',
        qi_quantity_semantic_target_type: 'ren_expectation_timelike_energy_density',
        qi_quantity_worldline_class: 'timelike',
        qi_qei_state_class: 'hadamard',
        qi_qei_renormalization_scheme: 'point_splitting',
        qi_qei_sampling_normalization: 'unit_integral',
        qi_qei_operator_mapping: 't_munu_uu_ren',
        qi_quantity_semantic_comparable: true,
        qi_quantity_semantic_bridge_ready: true,
        qi_coupling_equation_ref: 'semiclassical_coupling+atomic_energy_to_energy_density_proxy',
      },
    } as any;
    const { requiredSignals, missingSignals } = collectRequiredSignals(attempt, latestResult);
    expect(requiredSignals.provenance_chart.present).toBe(false);
    expect(requiredSignals.provenance_observer.present).toBe(false);
    expect(requiredSignals.provenance_normalization.present).toBe(false);
    expect(requiredSignals.provenance_unit_system.present).toBe(false);
    expect(requiredSignals.applicability_status.present).toBe(true);
    expect(requiredSignals.applicability_curvature_ok.present).toBe(true);
    expect(requiredSignals.applicability_curvature_ratio.present).toBe(true);
    expect(requiredSignals.operator_worldline_timelike.present).toBe(true);
    expect(requiredSignals.operator_qei_state_hadamard.present).toBe(true);
    expect(requiredSignals.operator_qei_mapping_t_munu_uu_ren.present).toBe(true);
    expect(requiredSignals.operator_semantic_comparable.present).toBe(true);
    expect(requiredSignals.operator_bridge_ready.present).toBe(true);
    expect(requiredSignals.operator_mapping_derivation_ref.present).toBe(true);
    const gateMap = buildGateMissingSignalMap(missingSignals);
    expect(gateMap.G6).toEqual(expect.arrayContaining(['provenance_chart', 'provenance_observer', 'provenance_normalization', 'provenance_unit_system']));
  });

  it('uses attempt grRequest provenance fallback when finalState is restored without metric contract metadata', () => {
    const attempt = {
      initial: { status: 'CERTIFIED' },
      evaluation: {
        gate: { status: 'pass' },
        constraints: [
          { id: 'FordRomanQI', status: 'pass' },
          { id: 'ThetaAudit', status: 'pass' },
        ],
        certificate: { certificateHash: 'abc', integrityOk: true },
      },
      grRequest: {
        warp: {
          metricAdapter: { chart: { label: 'comoving_cartesian' } },
          metricT00Contract: {
            observer: 'eulerian_n',
            normalization: 'si_stress',
            unitSystem: 'SI',
          },
        },
      },
    } as any;
    const latestResult = { finalState: {} } as any;
    const { requiredSignals, missingSignals } = collectRequiredSignals(attempt, latestResult);
    expect(requiredSignals.provenance_chart.present).toBe(true);
    expect(requiredSignals.provenance_observer.present).toBe(true);
    expect(requiredSignals.provenance_normalization.present).toBe(true);
    expect(requiredSignals.provenance_unit_system.present).toBe(true);
    expect(requiredSignals.applicability_status.present).toBe(false);
    expect(requiredSignals.applicability_curvature_ok.present).toBe(false);
    expect(requiredSignals.applicability_curvature_ratio.present).toBe(false);
    expect(requiredSignals.operator_qei_state_hadamard.present).toBe(false);
    expect(requiredSignals.operator_qei_mapping_t_munu_uu_ren.present).toBe(false);
    expect(requiredSignals.operator_semantic_comparable.present).toBe(false);
    expect(requiredSignals.operator_bridge_ready.present).toBe(false);
    expect(requiredSignals.operator_mapping_derivation_ref.present).toBe(false);
    expect(missingSignals).not.toEqual(expect.arrayContaining(['provenance_chart', 'provenance_observer', 'provenance_normalization', 'provenance_unit_system']));
    expect(missingSignals).toEqual(
      expect.arrayContaining([
        'applicability_status',
        'applicability_curvature_ok',
        'applicability_curvature_ratio',
        'operator_qei_state_hadamard',
        'operator_qei_mapping_t_munu_uu_ren',
        'operator_semantic_comparable',
        'operator_bridge_ready',
        'operator_mapping_derivation_ref',
      ]),
    );
  });

  it('uses evaluator snapshot fallback for operator mapping evidence when finalState is sparse', () => {
    const attempt = {
      initial: { status: 'CERTIFIED' },
      evaluation: {
        gate: { status: 'pass' },
        constraints: [
          { id: 'FordRomanQI', status: 'pass' },
          { id: 'ThetaAudit', status: 'pass' },
        ],
        certificate: {
          certificateHash: 'abc',
          integrityOk: true,
          payload: {
            snapshot: {
              qi_applicability_status: 'PASS',
              qi_curvature_ok: true,
              qi_curvature_ratio: 0,
              qi_quantity_semantic_base_type: 'classical_proxy_from_curvature',
              qi_quantity_semantic_type: 'ren_expectation_timelike_energy_density',
              qi_quantity_semantic_target_type: 'ren_expectation_timelike_energy_density',
              qi_quantity_worldline_class: 'timelike',
              qi_qei_state_class: 'hadamard',
              qi_qei_renormalization_scheme: 'point_splitting',
              qi_qei_sampling_normalization: 'unit_integral',
              qi_qei_operator_mapping: 't_munu_uu_ren',
              qi_quantity_semantic_comparable: true,
              qi_quantity_semantic_bridge_ready: true,
              qi_coupling_equation_ref: 'semiclassical_coupling+atomic_energy_to_energy_density_proxy',
            },
          },
        },
      },
      grRequest: {
        warp: {
          metricAdapter: { chart: { label: 'comoving_cartesian' } },
          metricT00Contract: {
            observer: 'eulerian_n',
            normalization: 'si_stress',
            unitSystem: 'SI',
          },
        },
      },
    } as any;
    const latestResult = { finalState: {} } as any;
    const { requiredSignals, missingSignals } = collectRequiredSignals(attempt, latestResult);
    expect(requiredSignals.applicability_status.present).toBe(true);
    expect(requiredSignals.operator_worldline_timelike.present).toBe(true);
    expect(requiredSignals.operator_qei_state_hadamard.present).toBe(true);
    expect(requiredSignals.operator_qei_mapping_t_munu_uu_ren.present).toBe(true);
    expect(requiredSignals.operator_semantic_comparable.present).toBe(true);
    expect(requiredSignals.operator_bridge_ready.present).toBe(true);
    expect(requiredSignals.operator_mapping_derivation_ref.present).toBe(true);
    expect(missingSignals).not.toEqual(
      expect.arrayContaining([
        'applicability_status',
        'operator_worldline_timelike',
        'operator_qei_state_hadamard',
        'operator_qei_mapping_t_munu_uu_ren',
        'operator_semantic_comparable',
        'operator_bridge_ready',
        'operator_mapping_derivation_ref',
      ]),
    );
  });

  it('uses evaluator diagnostics-note fallback for operator mapping evidence when snapshot is sparse', () => {
    const attempt = {
      initial: { status: 'CERTIFIED' },
      evaluation: {
        gate: { status: 'pass' },
        constraints: [
          { id: 'FordRomanQI', status: 'pass', note: null },
          { id: 'ThetaAudit', status: 'pass', note: '|theta|=0.1 max=1 source=test' },
        ],
        notes: [
          'G4 diagnostics: FordRomanQI=pass, ThetaAudit=pass, source=evaluator_constraints. ; applicabilityStatus=PASS; curvatureOk=true; curvatureRatio=0; quantitySemanticBaseType=classical_proxy_from_curvature; quantitySemanticType=ren_expectation_timelike_energy_density; quantitySemanticTargetType=ren_expectation_timelike_energy_density; quantityWorldlineClass=timelike; quantitySemanticComparable=true; quantitySemanticBridgeReady=true; qeiStateClass=hadamard; qeiRenormalizationScheme=point_splitting; qeiSamplingNormalization=unit_integral; qeiOperatorMapping=t_munu_uu_ren; couplingEquationRef=semiclassical_coupling+atomic_energy_to_energy_density_proxy',
        ],
        certificate: { certificateHash: 'abc', integrityOk: true },
      },
      grRequest: {
        warp: {
          metricAdapter: { chart: { label: 'comoving_cartesian' } },
          metricT00Contract: {
            observer: 'eulerian_n',
            normalization: 'si_stress',
            unitSystem: 'SI',
          },
        },
      },
    } as any;
    const latestResult = { finalState: {} } as any;
    const { requiredSignals, missingSignals } = collectRequiredSignals(attempt, latestResult);
    expect(requiredSignals.applicability_status.present).toBe(true);
    expect(requiredSignals.applicability_curvature_ok.present).toBe(true);
    expect(requiredSignals.applicability_curvature_ratio.present).toBe(true);
    expect(requiredSignals.operator_quantity_semantic_base_type.present).toBe(true);
    expect(requiredSignals.operator_quantity_semantic_type.present).toBe(true);
    expect(requiredSignals.operator_quantity_semantic_target_type.present).toBe(true);
    expect(requiredSignals.operator_worldline_timelike.present).toBe(true);
    expect(requiredSignals.operator_qei_state_hadamard.present).toBe(true);
    expect(requiredSignals.operator_qei_renormalization_point_splitting.present).toBe(true);
    expect(requiredSignals.operator_qei_sampling_unit_integral.present).toBe(true);
    expect(requiredSignals.operator_qei_mapping_t_munu_uu_ren.present).toBe(true);
    expect(requiredSignals.operator_semantic_comparable.present).toBe(true);
    expect(requiredSignals.operator_bridge_ready.present).toBe(true);
    expect(requiredSignals.operator_mapping_derivation_ref.present).toBe(true);
    expect(missingSignals).not.toEqual(
      expect.arrayContaining([
        'applicability_status',
        'applicability_curvature_ok',
        'applicability_curvature_ratio',
        'operator_worldline_timelike',
        'operator_qei_state_hadamard',
        'operator_qei_renormalization_point_splitting',
        'operator_qei_sampling_unit_integral',
        'operator_qei_mapping_t_munu_uu_ren',
        'operator_semantic_comparable',
        'operator_bridge_ready',
        'operator_mapping_derivation_ref',
      ]),
    );
  });
  it('campaign export includes curvature applicability fields for waves A/B/C/D', async () => {
    const cliPath = path.resolve('scripts/warp-full-solve-campaign-cli.ts');
    const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-wave-all-applicability-'));
    const outDir = path.join(tempRoot, 'out');
    await execFileAsync(process.execPath, [
      tsxCli,
      cliPath,
      '--wave',
      'all',
      '--out',
      outDir,
      '--ci',
      '--ci-fast-path',
      '--wave-timeout-ms',
      '3000',
      '--campaign-timeout-ms',
      '15000',
    ], {
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
    });
    for (const wave of ['A', 'B', 'C', 'D']) {
      const qifPath = path.join(outDir, wave, 'qi-forensics.json');
      expect(fs.existsSync(qifPath)).toBe(true);
      const qif = JSON.parse(fs.readFileSync(qifPath, 'utf8'));
      expect(qif).toHaveProperty('applicabilityStatus');
      expect(qif).toHaveProperty('curvatureOk');
      expect(qif).toHaveProperty('curvatureRatio');
    }
  }, 100_000);

});

