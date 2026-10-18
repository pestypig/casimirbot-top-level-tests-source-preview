import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateG4CouplingLocalization } from '../scripts/warp-g4-coupling-localization';

describe('warp g4 coupling localization', () => {
  it('is deterministic and ranks dominant coupling terms', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-coupling-local-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outJsonA = path.join(tmpDir, 'loc-a.json');
    const outJsonB = path.join(tmpDir, 'loc-b.json');
    const outMdA = path.join(tmpDir, 'loc-a.md');
    const outMdB = path.join(tmpDir, 'loc-b.md');

    const payload = {
      provenance: { commitHash: 'deadbeef' },
      cases: [
        {
          id: 'case_0001',
          comparabilityClass: 'comparable_canonical',
          applicabilityStatus: 'PASS',
          marginRatioRaw: 1,
          marginRatioRawComputed: 2,
          lhs_Jm3: -10,
          boundComputed_Jm3: -5,
          boundUsed_Jm3: -10,
          metricT00Si_Jm3: -100,
          rhoMetric_Jm3: -1,
          rhoProxy_Jm3: -2,
          rhoCoupledShadow_Jm3: -1.5,
          couplingResidualRel: 0.2,
        },
        {
          id: 'case_0002',
          comparabilityClass: 'comparable_canonical',
          applicabilityStatus: 'PASS',
          marginRatioRaw: 1,
          marginRatioRawComputed: 4,
          lhs_Jm3: -20,
          boundComputed_Jm3: -5,
          boundUsed_Jm3: -20,
          metricT00Si_Jm3: -200,
          rhoMetric_Jm3: -1,
          rhoProxy_Jm3: -2,
          rhoCoupledShadow_Jm3: -1.5,
          couplingResidualRel: 0.2,
        },
        {
          id: 'case_0003',
          comparabilityClass: 'comparable_canonical',
          applicabilityStatus: 'UNKNOWN',
          marginRatioRaw: 1,
          marginRatioRawComputed: 6,
          lhs_Jm3: -30,
          boundComputed_Jm3: -5,
          boundUsed_Jm3: -30,
          metricT00Si_Jm3: -300,
          rhoMetric_Jm3: -1,
          rhoProxy_Jm3: -2,
          rhoCoupledShadow_Jm3: -1.5,
          couplingResidualRel: 0.2,
        },
      ],
    };

    fs.writeFileSync(recoveryPath, `${JSON.stringify(payload, null, 2)}\n`);

    const a = generateG4CouplingLocalization({
      recoveryPath,
      outJsonPath: outJsonA,
      outMdPath: outMdA,
      canonicalRoot: path.join(tmpDir, 'canonical-empty'),
      topN: 3,
      referenceTopN: 2,
    });
    const b = generateG4CouplingLocalization({
      recoveryPath,
      outJsonPath: outJsonB,
      outMdPath: outMdB,
      canonicalRoot: path.join(tmpDir, 'canonical-empty'),
      topN: 3,
      referenceTopN: 2,
    });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const pa = JSON.parse(fs.readFileSync(outJsonA, 'utf8'));
    const pb = JSON.parse(fs.readFileSync(outJsonB, 'utf8'));
    pa.generatedAt = 'fixed';
    pb.generatedAt = 'fixed';
    expect(pa).toEqual(pb);
    expect(pa.termInfluenceRanking[0].field).toBe('metricT00Si_Jm3');
    expect(pa.bestComparableCaseId).toBe('case_0001');
  });

  it('accepts structural-semantic-gap comparables when strict canonical set is empty', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-coupling-local-structural-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outJson = path.join(tmpDir, 'loc.json');
    const outMd = path.join(tmpDir, 'loc.md');

    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          cases: [
            {
              id: 'case_struct_2',
              comparabilityClass: 'comparable_structural_semantic_gap',
              applicabilityStatus: 'UNKNOWN',
              marginRatioRaw: 1,
              marginRatioRawComputed: 3,
              lhs_Jm3: -20,
              boundComputed_Jm3: -5,
              boundUsed_Jm3: -20,
              metricT00Si_Jm3: -90,
            },
            {
              id: 'case_struct_1',
              comparabilityClass: 'comparable_structural_semantic_gap',
              applicabilityStatus: 'UNKNOWN',
              marginRatioRaw: 1,
              marginRatioRawComputed: 2,
              lhs_Jm3: -10,
              boundComputed_Jm3: -5,
              boundUsed_Jm3: -10,
              metricT00Si_Jm3: -100,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = generateG4CouplingLocalization({
      recoveryPath,
      outJsonPath: outJson,
      outMdPath: outMd,
      canonicalRoot: path.join(tmpDir, 'canonical-empty'),
      topN: 2,
      referenceTopN: 1,
    });

    expect(result.ok).toBe(true);
    expect((result as any).canonicalComparableCaseCount).toBe(0);
    expect((result as any).canonicalStructuralComparableCaseCount).toBe(2);

    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.canonicalComparableCaseCount).toBe(0);
    expect(payload.canonicalStructuralComparableCaseCount).toBe(2);
    expect(payload.selectedCaseCount).toBe(2);
    expect(payload.bestComparableCaseId).toBe('case_struct_1');
  });

  it('fails closed when no comparable cases exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-coupling-local-block-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outJson = path.join(tmpDir, 'loc.json');
    const outMd = path.join(tmpDir, 'loc.md');
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
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = generateG4CouplingLocalization({
      recoveryPath,
      outJsonPath: outJson,
      outMdPath: outMd,
      canonicalRoot: path.join(tmpDir, 'canonical-empty'),
    });
    expect(result.ok).toBe(false);
    expect((result as any).blockedReason).toBe('no_canonical_comparable_cases');
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.blockedReason).toBe('no_canonical_comparable_cases');
    expect(payload.termInfluenceRanking).toEqual([]);
  });

  it('emits diagnostic fallback localization for non_comparable_other while remaining fail-closed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-coupling-local-fallback-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outJson = path.join(tmpDir, 'loc.json');
    const outMd = path.join(tmpDir, 'loc.md');
    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          cases: [
            {
              id: 'case_1',
              comparabilityClass: 'non_comparable_other',
              applicabilityStatus: 'UNKNOWN',
              marginRatioRaw: 1,
              marginRatioRawComputed: 5,
              lhs_Jm3: -5,
              boundComputed_Jm3: -1,
              boundUsed_Jm3: -5,
              metricT00Si_Jm3: -100,
            },
            {
              id: 'case_2',
              comparabilityClass: 'non_comparable_other',
              applicabilityStatus: 'UNKNOWN',
              marginRatioRaw: 1,
              marginRatioRawComputed: 3,
              lhs_Jm3: -3,
              boundComputed_Jm3: -1,
              boundUsed_Jm3: -3,
              metricT00Si_Jm3: -90,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = generateG4CouplingLocalization({
      recoveryPath,
      outJsonPath: outJson,
      outMdPath: outMd,
      canonicalRoot: path.join(tmpDir, 'canonical-empty'),
      topN: 2,
      referenceTopN: 1,
    });
    expect(result.ok).toBe(false);
    expect((result as any).blockedReason).toBe('no_canonical_comparable_cases');
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.analysisMode).toBe('diagnostic_fallback_noncomparable_other');
    expect(payload.diagnosticFallbackUsed).toBe(true);
    expect(payload.fallbackPoolCaseCount).toBe(2);
    expect(payload.fallbackBestCaseId).toBe('case_2');
    expect(Array.isArray(payload.termInfluenceRanking)).toBe(true);
    expect(payload.termInfluenceRanking.length).toBeGreaterThan(0);
    expect(Array.isArray(payload.cases)).toBe(true);
    expect(payload.cases.length).toBe(2);
  });

  it('falls back to canonical qi-forensics when recovery has no rows', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-coupling-local-canonical-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outJson = path.join(tmpDir, 'loc.json');
    const outMd = path.join(tmpDir, 'loc.md');
    const canonicalRoot = path.join(tmpDir, 'canonical');
    fs.mkdirSync(path.join(canonicalRoot, 'A'), { recursive: true });
    fs.mkdirSync(path.join(canonicalRoot, 'B'), { recursive: true });
    fs.writeFileSync(
      path.join(canonicalRoot, 'A', 'qi-forensics.json'),
      `${JSON.stringify(
        {
          wave: 'A',
          applicabilityStatus: 'PASS',
          marginRatioRaw: 1,
          marginRatioRawComputed: 2,
          lhs_Jm3: -20,
          boundComputed_Jm3: -10,
          boundUsed_Jm3: -20,
          metricT00Si_Jm3: -100,
        },
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(
      path.join(canonicalRoot, 'B', 'qi-forensics.json'),
      `${JSON.stringify(
        {
          wave: 'B',
          applicabilityStatus: 'PASS',
          marginRatioRaw: 1,
          marginRatioRawComputed: 3,
          lhs_Jm3: -30,
          boundComputed_Jm3: -10,
          boundUsed_Jm3: -30,
          metricT00Si_Jm3: -110,
        },
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(recoveryPath, `${JSON.stringify({ cases: [] }, null, 2)}\n`);

    const result = generateG4CouplingLocalization({
      recoveryPath,
      outJsonPath: outJson,
      outMdPath: outMd,
      canonicalRoot,
      topN: 2,
      referenceTopN: 1,
    });
    expect(result.ok).toBe(false);
    expect((result as any).blockedReason).toBe('no_canonical_comparable_cases');
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.diagnosticFallbackUsed).toBe(true);
    expect(payload.diagnosticFallbackSource).toBe('canonical_qi_forensics');
    expect(payload.fallbackPoolCaseCount).toBe(2);
    expect(payload.fallbackBestCaseId).toBe('canonical_a');
    expect(payload.cases.length).toBe(2);
  });
});
