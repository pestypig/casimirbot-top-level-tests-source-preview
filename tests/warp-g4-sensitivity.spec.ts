import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  deriveSensitivityReasonCodes,
  isMetricRhoSource,
  runSensitivityCases,
} from '../scripts/warp-g4-sensitivity';
import { evaluateQiGuardrail, getGlobalPipelineState, updateParameters } from '../server/energy-pipeline';

describe('warp-g4-sensitivity', () => {
  it('is deterministic under fixed seed', () => {
    const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs');
    const script = path.resolve('scripts/warp-g4-sensitivity.ts');
    const outPath = path.join('artifacts/research/full-solve', `g4-sensitivity-${new Date().toISOString().slice(0, 10)}.json`);

    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }

    execFileSync(process.execPath, [tsxCli, script], { stdio: 'ignore' });
    expect(fs.existsSync(outPath)).toBe(true);
    const firstStat = fs.statSync(outPath);
    const a = fs.readFileSync(outPath, 'utf8');

    execFileSync(process.execPath, [tsxCli, script], { stdio: 'ignore' });
    expect(fs.existsSync(outPath)).toBe(true);
    const secondStat = fs.statSync(outPath);
    const b = fs.readFileSync(outPath, 'utf8');

    expect(secondStat.mtimeMs).toBeGreaterThanOrEqual(firstStat.mtimeMs);
    expect(secondStat.mtimeMs > firstStat.mtimeMs || b !== a).toBe(true);

    const pa = JSON.parse(a);
    const pb = JSON.parse(b);
    expect(pa.seed).toBe(424242);
    expect(pb.seed).toBe(424242);
    expect(pa.cases).toEqual(pb.cases);
  }, 120_000);

  it('keeps case evaluations independent from cross-case mutation', async () => {
    const secondary = [{ gap_nm: 0.5, casimirModel: 'ideal_retarded' as const }];
    const [caseA, caseB] = await runSensitivityCases(
      [
        { tau_s: 0.01, sampler: 'gaussian', fieldType: 'em', QI_POLICY_MAX_ZETA: 1 },
        { tau_s: 0.1, sampler: 'boxcar', fieldType: 'em', QI_POLICY_MAX_ZETA: 10 },
      ],
      secondary,
    );
    const [caseBOnly] = await runSensitivityCases(
      [{ tau_s: 0.1, sampler: 'boxcar', fieldType: 'em', QI_POLICY_MAX_ZETA: 10 }],
      secondary,
    );
    expect(caseA).toBeDefined();
    expect(caseB).toEqual(caseBOnly);
  });

  it('applies per-case QI_POLICY_MAX_ZETA override in evaluator output', async () => {
    const baseline = structuredClone(getGlobalPipelineState());
    const next = await updateParameters(structuredClone(baseline), {
      gap_nm: 0.5,
      casimirModel: 'ideal_retarded',
      qi: {
        ...(baseline.qi ?? {}),
        tau_s_ms: 10,
        sampler: 'gaussian',
        fieldType: 'em',
      },
    } as any);

    const low = evaluateQiGuardrail(next, { tau_ms: 10, sampler: 'gaussian', qiPolicyMaxZeta: 1 });
    const high = evaluateQiGuardrail(next, { tau_ms: 10, sampler: 'gaussian', qiPolicyMaxZeta: 10 });

    expect(low.policyLimit).toBe(1);
    expect(high.policyLimit).toBe(10);
    expect(low.marginRatio).not.toBe(high.marginRatio);
  });

  it('classifies metric rho sources with canonical parity', () => {
    expect(isMetricRhoSource('warp.metric.energy')).toBe(true);
    expect(isMetricRhoSource('gr.rho_constraint.si')).toBe(true);
    expect(isMetricRhoSource('gr.metric.natario')).toBe(true);
    expect(isMetricRhoSource('gr.telemetry')).toBe(false);
    expect(isMetricRhoSource('proxy')).toBe(false);
  });

  it('uses unquantized raw ratio for near-threshold margin decision', () => {
    const below = deriveSensitivityReasonCodes({ marginRatioRaw: 0.9999999999, applicabilityStatus: 'PASS', rhoSource: 'gr.metric' });
    const above = deriveSensitivityReasonCodes({ marginRatioRaw: 1.0000000001, applicabilityStatus: 'PASS', rhoSource: 'gr.metric' });

    expect(below).not.toContain('G4_QI_MARGIN_EXCEEDED');
    expect(above).toContain('G4_QI_MARGIN_EXCEEDED');
  });


  it('treats non-finite raw margins as exceeded fail-closed', () => {
    const nanMargin = deriveSensitivityReasonCodes({ marginRatioRaw: Number.NaN, applicabilityStatus: 'PASS', rhoSource: 'gr.metric' });
    const infMargin = deriveSensitivityReasonCodes({ marginRatioRaw: Number.POSITIVE_INFINITY, applicabilityStatus: 'PASS', rhoSource: 'gr.metric' });
    const negInfMargin = deriveSensitivityReasonCodes({ marginRatioRaw: Number.NEGATIVE_INFINITY, applicabilityStatus: 'PASS', rhoSource: 'gr.metric' });

    expect(nanMargin).toContain('G4_QI_MARGIN_EXCEEDED');
    expect(infMargin).toContain('G4_QI_MARGIN_EXCEEDED');
    expect(negInfMargin).toContain('G4_QI_MARGIN_EXCEEDED');
  });


  it('derives scan decision from aggregate scan outcomes', () => {
    const influencePath = path.join('artifacts/research/full-solve', 'g4-influence-scan-2026-02-26.json');
    const data = JSON.parse(fs.readFileSync(influencePath, 'utf8'));
    expect(typeof data.decision.classification).toBe('string');
    expect(typeof data.decision.scanCandidatePassFound).toBe('boolean');
    expect(typeof data.decision.scanAnyApplicabilityPass).toBe('boolean');
    expect(data.decision).toHaveProperty('scanMinMarginRatioRawAmongApplicabilityPass');
  });

  it('keeps display ratio faithful for small finite values', async () => {
    const [single] = await runSensitivityCases(
      [{ tau_s: 0.01, sampler: 'gaussian', fieldType: 'em', QI_POLICY_MAX_ZETA: 1 }],
      [{ gap_nm: 0.5, casimirModel: 'ideal_retarded' }],
    );
    expect(single.marginRatio).toBeGreaterThanOrEqual(1);
    expect(single.marginRatioDisplay).toBe(single.marginRatio);
  });

  it('emits deterministic canonical reason ordering with applicability reason passthrough', () => {
    const reasonCodes = deriveSensitivityReasonCodes({
      applicabilityReasonCode: 'G4_QI_SIGNAL_MISSING',
      applicabilityStatus: 'UNKNOWN',
      marginRatioRaw: 2,
      rhoSource: 'proxy',
    });
    expect(reasonCodes).toEqual([
      'G4_QI_SIGNAL_MISSING',
      'G4_QI_APPLICABILITY_NOT_PASS',
      'G4_QI_MARGIN_EXCEEDED',
      'G4_QI_SOURCE_NOT_METRIC',
    ]);
  });
});
