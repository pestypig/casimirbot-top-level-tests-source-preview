import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateG4CouplingAblation } from '../scripts/warp-g4-coupling-ablation';

const writeJson = (filePath: string, payload: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

describe('warp-g4-coupling-ablation', () => {
  it('fails closed when localization artifact is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-coupling-ablation-'));
    const outJsonPath = path.join(root, 'out', 'ablation.json');
    const outMdPath = path.join(root, 'out', 'ablation.md');
    const result = generateG4CouplingAblation({
      localizationPath: path.join(root, 'missing.json'),
      outJsonPath,
      outMdPath,
      topN: 5,
    });
    expect(result.ok).toBe(false);
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8')) as Record<string, any>;
    expect(payload.blockedReason).toBe('coupling_localization_missing');
    expect(payload.analysisMode).toBe('blocked');
    expect(payload.topAblations).toEqual([]);
  });

  it('computes deterministic counterfactual ablation ranking', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-coupling-ablation-'));
    const localizationPath = path.join(root, 'localization.json');
    const outJsonPath = path.join(root, 'out', 'ablation.json');
    const outMdPath = path.join(root, 'out', 'ablation.md');
    writeJson(localizationPath, {
      analysisMode: 'diagnostic_fallback_noncomparable_other',
      diagnosticFallbackUsed: true,
      diagnosticFallbackSource: 'canonical_qi_forensics',
      provenance: { commitHash: 'abc123' },
      cases: [
        {
          id: 'case_a',
          applicabilityStatus: 'PASS',
          marginRatioRawComputed: 1.5,
          termDeltas: [
            { field: 'metricT00Si_Jm3', value: 10, referenceMean: 12 },
            { field: 'rhoMetric_Jm3', value: 8, referenceMean: 7 },
          ],
        },
        {
          id: 'case_b',
          applicabilityStatus: 'PASS',
          marginRatioRawComputed: 2.2,
          termDeltas: [{ field: 'metricT00Si_Jm3', value: 14, referenceMean: 12 }],
        },
      ],
      termInfluenceRanking: [
        {
          field: 'metricT00Si_Jm3',
          influenceScore: 3.5,
          slopeToMarginRatioRawComputed: -0.3,
          pearsonRWithMarginRatioRawComputed: 0.8,
        },
        {
          field: 'rhoMetric_Jm3',
          influenceScore: 1.2,
          slopeToMarginRatioRawComputed: 0.1,
          pearsonRWithMarginRatioRawComputed: 0.4,
        },
      ],
    });

    const result = generateG4CouplingAblation({
      localizationPath,
      outJsonPath,
      outMdPath,
      topN: 2,
    });
    expect(result.ok).toBe(true);
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8')) as Record<string, any>;
    expect(payload.blockedReason).toBe(null);
    expect(payload.baselineCaseId).toBe('case_a');
    expect(payload.baselineMarginRatioRawComputed).toBe(1.5);
    expect(payload.topAblations).toHaveLength(2);
    expect(payload.topAblations[0].field).toBe('metricT00Si_Jm3');
    expect(payload.topAblations[0].counterfactualMarginRatioRawComputed).toBe(0.9);
    expect(payload.topAblations[0].counterfactualPass).toBe(true);
    expect(payload.candidatePassFoundCounterfactual).toBe(true);
  });
});

