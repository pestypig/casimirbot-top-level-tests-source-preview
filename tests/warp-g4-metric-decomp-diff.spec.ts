import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateG4MetricDecompDiff } from '../scripts/warp-g4-metric-decomp-diff';

describe('warp g4 metric decomposition diff', () => {
  it('is deterministic and flags abnormal metric-term candidates', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-metric-diff-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outJsonA = path.join(tmpDir, 'diff-a.json');
    const outJsonB = path.join(tmpDir, 'diff-b.json');
    const outMdA = path.join(tmpDir, 'diff-a.md');
    const outMdB = path.join(tmpDir, 'diff-b.md');

    const payload = {
      provenance: { commitHash: 'deadbeef' },
      cases: [
        {
          id: 'case_ref_1',
          comparabilityClass: 'comparable_canonical',
          applicabilityStatus: 'PASS',
          marginRatioRawComputed: 1.5,
          marginRatioRaw: 1.5,
          rhoSource: 'warp.metric.T00.natario.shift',
          metricT00Ref: 'warp.metric.T00.natario.shift',
          metricT00Si_Jm3: -100,
          metricStressRhoSiMean_Jm3: -101,
          metricStressRhoGeomMean_Geom: -1e-8,
          metricStressKTraceMean: 0.2,
          metricStressKSquaredMean: 0.04,
          metricStressStep_m: 0.01,
          metricStressScale_m: 2,
        },
        {
          id: 'case_ref_2',
          comparabilityClass: 'comparable_canonical',
          applicabilityStatus: 'PASS',
          marginRatioRawComputed: 1.6,
          marginRatioRaw: 1.6,
          rhoSource: 'warp.metric.T00.natario.shift',
          metricT00Ref: 'warp.metric.T00.natario.shift',
          metricT00Si_Jm3: -102,
          metricStressRhoSiMean_Jm3: -103,
          metricStressRhoGeomMean_Geom: -1.01e-8,
          metricStressKTraceMean: 0.21,
          metricStressKSquaredMean: 0.045,
          metricStressStep_m: 0.0101,
          metricStressScale_m: 2.01,
        },
        {
          id: 'case_cmp_abnormal',
          comparabilityClass: 'comparable_canonical',
          applicabilityStatus: 'UNKNOWN',
          marginRatioRawComputed: 3.2,
          marginRatioRaw: 1,
          rhoSource: 'warp.metric.T00.natario.shift',
          metricT00Ref: 'warp.metric.T00.natario.shift',
          metricT00Si_Jm3: -10000000,
          metricStressRhoSiMean_Jm3: -9000000,
          metricStressRhoGeomMean_Geom: -1e-3,
          metricStressKTraceMean: 25,
          metricStressKSquaredMean: 100,
          metricStressStep_m: 1,
          metricStressScale_m: 50,
        },
      ],
    };
    fs.writeFileSync(recoveryPath, `${JSON.stringify(payload, null, 2)}\n`);

    const a = generateG4MetricDecompDiff({
      recoveryPath,
      outJsonPath: outJsonA,
      outMdPath: outMdA,
      referenceTopN: 2,
      candidateTopN: 3,
    });
    const b = generateG4MetricDecompDiff({
      recoveryPath,
      outJsonPath: outJsonB,
      outMdPath: outMdB,
      referenceTopN: 2,
      candidateTopN: 3,
    });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const pa = JSON.parse(fs.readFileSync(outJsonA, 'utf8'));
    const pb = JSON.parse(fs.readFileSync(outJsonB, 'utf8'));
    pa.generatedAt = 'fixed';
    pb.generatedAt = 'fixed';
    expect(pa).toEqual(pb);
    expect(pa.anyAbnormalCandidates).toBe(true);
    expect(pa.selectionMode).toBe('canonical');
    expect(pa.comparableCaseCounts.canonicalComparable).toBe(3);
    expect(pa.comparableCaseCounts.structuralComparable).toBe(3);
    const abnormal = pa.candidates.find((entry: any) => entry.id === 'case_cmp_abnormal');
    expect(abnormal).toBeTruthy();
    expect(abnormal.abnormal).toBe(true);
    expect(abnormal.abnormalTerms).toContain('metricT00Si_Jm3');
  });

  it('fails closed when no comparable canonical cases exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-metric-diff-blocked-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outJson = path.join(tmpDir, 'diff.json');
    const outMd = path.join(tmpDir, 'diff.md');
    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          cases: [
            {
              id: 'case_1',
              comparabilityClass: 'non_comparable_missing_signals',
              applicabilityStatus: 'UNKNOWN',
              marginRatioRawComputed: null,
              rhoSource: 'lab.synthetic',
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    const result = generateG4MetricDecompDiff({
      recoveryPath,
      outJsonPath: outJson,
      outMdPath: outMd,
    });
    expect(result.ok).toBe(false);
    expect((result as any).blockedReason).toBe('no_structural_comparable_cases');
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.blockedReason).toBe('no_structural_comparable_cases');
    expect(payload.anyAbnormalCandidates).toBe(false);
  });

  it('uses structural-semantic-gap fallback when canonical comparable cohort is absent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-metric-diff-structural-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outJson = path.join(tmpDir, 'diff.json');
    const outMd = path.join(tmpDir, 'diff.md');
    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          cases: [
            {
              id: 'case_structural_1',
              comparabilityClass: 'comparable_structural_semantic_gap',
              applicabilityStatus: 'UNKNOWN',
              marginRatioRawComputed: 1.2,
              marginRatioRaw: 1,
              rhoSource: 'warp.metric.T00.natario.shift',
              metricT00Ref: 'warp.metric.T00.natario.shift',
              metricT00Si_Jm3: -100,
              metricStressRhoSiMean_Jm3: -100,
              metricStressRhoGeomMean_Geom: -1e-8,
              metricStressKTraceMean: 0.2,
              metricStressKSquaredMean: 0.04,
              metricStressStep_m: 0.01,
              metricStressScale_m: 1,
            },
            {
              id: 'case_structural_2',
              comparabilityClass: 'comparable_structural_semantic_gap',
              applicabilityStatus: 'UNKNOWN',
              marginRatioRawComputed: 1.3,
              marginRatioRaw: 1,
              rhoSource: 'warp.metric.T00.natario.shift',
              metricT00Ref: 'warp.metric.T00.natario.shift',
              metricT00Si_Jm3: -90,
              metricStressRhoSiMean_Jm3: -90,
              metricStressRhoGeomMean_Geom: -0.9e-8,
              metricStressKTraceMean: 0.19,
              metricStressKSquaredMean: 0.041,
              metricStressStep_m: 0.011,
              metricStressScale_m: 1.1,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = generateG4MetricDecompDiff({
      recoveryPath,
      outJsonPath: outJson,
      outMdPath: outMd,
      referenceTopN: 2,
      candidateTopN: 2,
    });

    expect(result.ok).toBe(true);
    expect((result as any).selectionMode).toBe('structural_semantic_gap_fallback');

    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.selectionMode).toBe('structural_semantic_gap_fallback');
    expect(payload.comparableCaseCounts.canonicalComparable).toBe(0);
    expect(payload.comparableCaseCounts.structuralComparable).toBe(2);
    expect(payload.reference.mode).toContain('structural_semantic_gap');
  });
});
