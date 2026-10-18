import { describe, expect, it } from 'vitest';
import { extractG4ConstraintDiagnostics } from '../server/gr/gr-evaluation';

describe('gr-evaluation G4 diagnostics provenance', () => {
  it('reports evaluator_constraints with concrete hard statuses', () => {
    const result = extractG4ConstraintDiagnostics([
      { id: 'FordRomanQI', severity: 'HARD', status: 'pass', note: 'computed from live evaluator' },
      { id: 'ThetaAudit', severity: 'HARD', status: 'fail', note: 'theta out of band' },
    ] as any);

    expect(result.fordRomanStatus).toBe('pass');
    expect(result.thetaAuditStatus).toBe('fail');
    expect(result.source).toBe('evaluator_constraints');
    expect(result.reasonCode).toEqual([]);
  });

  it('reports synthesized_unknown with deterministic reasonCode extraction', () => {
    const result = extractG4ConstraintDiagnostics([
      {
        id: 'FordRomanQI',
        severity: 'HARD',
        status: 'unknown',
        note: 'reasonCode=G4_QI_SIGNAL_MISSING;source=synthesized_unknown;FordRomanQI missing from warp-viability evaluator constraints.',
      },
      {
        id: 'ThetaAudit',
        severity: 'HARD',
        status: 'unknown',
        note: 'reasonCode=G4_QI_SIGNAL_MISSING;source=synthesized_unknown;ThetaAudit missing from warp-viability evaluator constraints.',
      },
    ] as any);

    expect(result.source).toBe('synthesized_unknown');
    expect(result.reasonCode).toEqual(['G4_QI_SIGNAL_MISSING']);
    expect(result.reason.join(' | ')).toContain('source=synthesized_unknown');
  });

  it('marks source synthesized when both hard constraints are absent', () => {
    const result = extractG4ConstraintDiagnostics([] as any);

    expect(result.fordRomanStatus).toBe('missing');
    expect(result.thetaAuditStatus).toBe('missing');
    expect(result.source).toBe('synthesized_unknown');
    expect(result.reasonCode).toEqual(['G4_QI_SIGNAL_MISSING']);
  });

  it('marks source synthesized with deterministic reason code for partial hard-constraint payload', () => {
    const result = extractG4ConstraintDiagnostics([
      { id: 'FordRomanQI', severity: 'HARD', status: 'pass', note: 'computed from live evaluator' },
    ] as any);

    expect(result.fordRomanStatus).toBe('pass');
    expect(result.thetaAuditStatus).toBe('missing');
    expect(result.source).toBe('synthesized_unknown');
    expect(result.reasonCode).toEqual(['G4_QI_SIGNAL_MISSING']);
  });

  it('extracts deterministic applicability fields when curvature data is present', () => {
    const result = extractG4ConstraintDiagnostics([
      {
        id: 'FordRomanQI',
        severity: 'HARD',
        status: 'fail',
        note: 'applicabilityStatus=NOT_APPLICABLE;curvatureOk=false;curvatureRatio=2.5;reasonCode=G4_QI_CURVATURE_WINDOW_FAIL',
      },
      { id: 'ThetaAudit', severity: 'HARD', status: 'pass', note: 'theta ok' },
    ] as any);

    expect(result.applicabilityStatus).toBe('NOT_APPLICABLE');
    expect(result.curvatureOk).toBe(false);
    expect(result.curvatureRatio).toBe(2.5);
    expect(result.reasonCode).toContain('G4_QI_CURVATURE_WINDOW_FAIL');
  });

});
