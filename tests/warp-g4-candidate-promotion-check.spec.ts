import { describe, expect, it } from 'vitest';
import {
  aggregateGateMaps,
  assessPromotionMismatch,
  choosePromotionCandidate,
  derivePromotionReadiness,
} from '../scripts/warp-g4-candidate-promotion-check';

describe('warp-g4-candidate-promotion-check', () => {
  it('selects best candidate when canonical comparable pass exists', () => {
    const recovery = {
      bestCandidate: {
        id: 'case_0001',
        applicabilityStatus: 'PASS',
        marginRatioRaw: 0.5,
        marginRatioRawComputed: 0.5,
        comparabilityClass: 'comparable_canonical',
        params: { tau_s_ms: 0.02 },
      },
      topComparableCandidates: [],
    };

    const selected = choosePromotionCandidate(recovery);
    expect(selected.blockedReason).toBeNull();
    expect(selected.candidate?.id).toBe('case_0001');
  });

  it('fails closed when no canonical comparable pass candidate exists', () => {
    const recovery = {
      bestCandidate: {
        id: 'case_0099',
        applicabilityStatus: 'PASS',
        marginRatioRaw: 1,
        marginRatioRawComputed: 1.1,
        comparabilityClass: 'comparable_canonical',
        params: { tau_s_ms: 0.02 },
      },
      topComparableCandidates: [
        {
          id: 'case_0042',
          applicabilityStatus: 'UNKNOWN',
          marginRatioRaw: 0.9,
          marginRatioRawComputed: 0.9,
          comparabilityClass: 'comparable_canonical',
          params: { tau_s_ms: 0.05 },
        },
      ],
    };

    const selected = choosePromotionCandidate(recovery);
    expect(selected.candidate).toBeNull();
    expect(selected.blockedReason).toBe('no_pass_comparable_candidate_in_recovery_artifact');
  });

  it('aggregates gate maps using canonical precedence', () => {
    const aggregated = aggregateGateMaps([
      {
        wave: 'A',
        gateMap: {
          G4: { status: 'PASS', reason: 'ok', source: 'test' },
          G7: { status: 'NOT_APPLICABLE', reason: 'n/a', source: 'test' },
        },
      },
      {
        wave: 'B',
        gateMap: {
          G4: { status: 'FAIL', reason: 'margin', source: 'test' },
          G7: { status: 'PASS', reason: 'ok', source: 'test' },
        },
      },
    ]);

    expect(aggregated.G4.status).toBe('FAIL');
    expect(aggregated.G7.status).toBe('PASS');
  });

  it('classifies param carry mismatch when rho source and tau diverge from candidate', () => {
    const candidate = {
      id: 'case_0001',
      params: { warpFieldType: 'natario_sdf', tau_s_ms: 0.02 },
      applicabilityStatus: 'PASS',
      marginRatioRawComputed: 0.12,
      comparabilityClass: 'comparable_canonical',
    };
    const mismatch = assessPromotionMismatch(
      candidate,
      {
        lhs_Jm3: -3.09,
        boundComputed_Jm3: -24,
        marginRatioRawComputed: 0.12,
        applicabilityStatus: 'PASS',
        rhoSource: 'warp.metric.T00.natario_sdf.shift',
        tauConfigured_s: 0.00002,
        tauSelected_s: 0.00002,
      },
      {
        source: 'evaluator_constraints',
        fordRomanStatus: 'fail',
        thetaAuditStatus: 'pass',
        reason: [],
        reasonCode: [],
        rhoSource: 'warp.metric.T00.natario.shift',
        marginRatioRawComputed: 1000,
        tauConfigured_s: 0.005,
      } as any,
    );
    expect(mismatch.class).toBe('param_carry_mismatch');
    expect(mismatch.reasons.some((reason) => reason.startsWith('rho_source_mismatch'))).toBe(true);
    expect(mismatch.reasons.some((reason) => reason.startsWith('tau_mismatch'))).toBe(true);
  });

  it('marks promotion ready when G4 is PASS and no fail/not-ready/unknown gate exists', () => {
    const readiness = derivePromotionReadiness({
      G0: { status: 'PASS', reason: 'ok', source: 'test' },
      G1: { status: 'PASS', reason: 'ok', source: 'test' },
      G2: { status: 'PASS', reason: 'ok', source: 'test' },
      G3: { status: 'PASS', reason: 'ok', source: 'test' },
      G4: { status: 'PASS', reason: 'ok', source: 'test' },
      G5: { status: 'NOT_APPLICABLE', reason: 'n/a', source: 'test' },
      G6: { status: 'PASS', reason: 'ok', source: 'test' },
      G7: { status: 'PASS', reason: 'ok', source: 'test' },
      G8: { status: 'PASS', reason: 'ok', source: 'test' },
    });

    expect(readiness.aggregateDecision).toBe('REDUCED_ORDER_ADMISSIBLE');
    expect(readiness.aggregateFirstFail.firstFail).toBe('none');
    expect(readiness.aggregateG4).toBe('PASS');
    expect(readiness.candidatePromotionReady).toBe(true);
  });

  it('marks promotion not ready when a non-pass gate enters not-ready/unknown precedence', () => {
    const readiness = derivePromotionReadiness({
      G0: { status: 'PASS', reason: 'ok', source: 'test' },
      G1: { status: 'PASS', reason: 'ok', source: 'test' },
      G2: { status: 'PASS', reason: 'ok', source: 'test' },
      G3: { status: 'PASS', reason: 'ok', source: 'test' },
      G4: { status: 'PASS', reason: 'ok', source: 'test' },
      G5: { status: 'NOT_APPLICABLE', reason: 'n/a', source: 'test' },
      G6: { status: 'PASS', reason: 'ok', source: 'test' },
      G7: { status: 'UNKNOWN', reason: 'signal', source: 'test' },
      G8: { status: 'PASS', reason: 'ok', source: 'test' },
    });

    expect(readiness.aggregateDecision).toBe('NOT_READY');
    expect(readiness.aggregateFirstFail.firstFail).toBe('G7');
    expect(readiness.candidatePromotionReady).toBe(false);
  });
});
