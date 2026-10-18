import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateStepASummary } from '../scripts/warp-g4-stepA-summary';

const writeQiForensics = (root: string, wave: 'A' | 'B' | 'C' | 'D', payload: Record<string, unknown>) => {
  const waveDir = path.join(root, wave);
  fs.mkdirSync(waveDir, { recursive: true });
  fs.writeFileSync(path.join(waveDir, 'qi-forensics.json'), `${JSON.stringify(payload, null, 2)}\n`);
};

describe('warp-g4-stepA-summary', () => {
  it('builds deterministic comparable summary from canonical wave forensics', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-stepa-'));
    const outPath = path.join(root, 'g4-stepA-summary.json');
    const base = {
      lhs_Jm3: -10,
      boundComputed_Jm3: -20,
      boundUsed_Jm3: -20,
      marginRatioRaw: 0.5,
      marginRatioRawComputed: 0.5,
      applicabilityStatus: 'PASS',
      rhoSource: 'warp.metric.T00.natario.shift',
      quantitySemanticType: 'ren_expectation_timelike_energy_density',
      quantityWorldlineClass: 'timelike',
      quantitySemanticComparable: true,
      quantitySemanticBridgeMode: 'strict_evidence_gated',
      quantitySemanticReason: 'semantic_parity_qei_timelike_ren',
      g4ReasonCodes: [],
    };
    writeQiForensics(root, 'A', base);
    writeQiForensics(root, 'B', base);
    writeQiForensics(root, 'C', base);
    writeQiForensics(root, 'D', base);

    const a = generateStepASummary({ artifactRoot: root, outPath, getCommitHash: () => 'abc1234' });
    const b = generateStepASummary({ artifactRoot: root, outPath, getCommitHash: () => 'abc1234' });
    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(payload.canonicalMissingWaves).toEqual([]);
    expect(payload.canonicalComparableCaseCount).toBe(4);
    expect(payload.canonicalStructuralComparableCaseCount).toBe(4);
    expect(payload.canonicalSemanticGapCaseCount).toBe(0);
    expect(payload.nonComparableCaseCount).toBe(0);
    expect(payload.minMarginRatioRawComputedComparable).toBe(0.5);
    expect(payload.minMarginRatioRawComputedStructuralComparable).toBe(0.5);
    expect(payload.candidatePassFoundCanonicalComparable).toBe(true);
    expect(payload.candidatePassFoundStructuralComparable).toBe(true);
    expect(payload.semanticBridgeMissingTop).toEqual([]);
    expect(payload.structuralSemanticGapTop).toEqual([]);
    expect(payload.provenance.commitHash).toBe('abc1234');
  });

  it('classifies missing signals and contract mismatch into deterministic non-comparable buckets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-stepa-buckets-'));
    const outPath = path.join(root, 'g4-stepA-summary.json');

    writeQiForensics(root, 'A', {
      lhs_Jm3: -10,
      boundComputed_Jm3: -20,
      boundUsed_Jm3: -20,
      marginRatioRaw: 1,
      marginRatioRawComputed: 1,
      applicabilityStatus: 'UNKNOWN',
      rhoSource: 'warp.metric.T00.natario.shift',
      quantitySemanticType: 'ren_expectation_timelike_energy_density',
      quantityWorldlineClass: 'timelike',
      quantitySemanticComparable: true,
      quantitySemanticReason: 'semantic_parity_qei_timelike_ren',
      g4ReasonCodes: ['G4_QI_SIGNAL_MISSING'],
    });
    writeQiForensics(root, 'B', {
      lhs_Jm3: -10,
      boundComputed_Jm3: -20,
      boundUsed_Jm3: -20,
      marginRatioRaw: 1,
      marginRatioRawComputed: 1,
      applicabilityStatus: 'PASS',
      rhoSource: 'lab.synthetic',
      quantitySemanticType: 'ren_expectation_timelike_energy_density',
      quantityWorldlineClass: 'timelike',
      quantitySemanticComparable: true,
      quantitySemanticReason: 'semantic_parity_qei_timelike_ren',
      g4ReasonCodes: ['G4_QI_SOURCE_NOT_METRIC'],
    });
    // Missing wave C/D should be reported in canonicalMissingWaves.

    generateStepASummary({ artifactRoot: root, outPath, getCommitHash: () => 'deadbeef' });
    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));

    expect(payload.canonicalWaveCount).toBe(2);
    expect(payload.canonicalMissingWaves).toEqual(['C', 'D']);
    expect(payload.canonicalComparableCaseCount).toBe(1);
    expect(payload.canonicalStructuralComparableCaseCount).toBe(1);
    expect(payload.canonicalSemanticGapCaseCount).toBe(0);
    expect(payload.nonComparableCaseCount).toBe(1);
    expect(payload.nonComparableBuckets).toEqual({
      non_comparable_missing_signals: 0,
      non_comparable_contract_mismatch: 1,
      non_comparable_other: 0,
    });
    expect(payload.minMarginRatioRawComputedComparable).toBe(1);
    expect(payload.minMarginRatioRawComputedStructuralComparable).toBe(1);
    expect(payload.candidatePassFoundCanonicalComparable).toBe(false);
    expect(payload.candidatePassFoundStructuralComparable).toBe(false);
    expect(Array.isArray(payload.semanticBridgeMissingTop)).toBe(true);
    expect(Array.isArray(payload.structuralSemanticGapTop)).toBe(true);
  });

  it('classifies strict semantic-gated timelike rows as structural comparables', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-stepa-structural-'));
    const outPath = path.join(root, 'g4-stepA-summary.json');
    const base = {
      lhs_Jm3: -10,
      boundComputed_Jm3: -20,
      boundUsed_Jm3: -20,
      marginRatioRaw: 1,
      marginRatioRawComputed: 1,
      applicabilityStatus: 'PASS',
      rhoSource: 'warp.metric.T00.natario.shift',
      quantitySemanticType: 'classical_proxy_from_curvature',
      quantitySemanticTargetType: 'ren_expectation_timelike_energy_density',
      quantityWorldlineClass: 'timelike',
      quantitySemanticComparable: false,
      quantitySemanticBridgeMode: 'strict_evidence_gated',
      quantitySemanticBridgeReady: false,
      quantitySemanticBridgeMissing: 'coupling_semantics_diagnostic_only',
      quantitySemanticReason: 'semantic_mismatch:classical_proxy_from_curvature:timelike',
      g4ReasonCodes: ['G4_QI_MARGIN_EXCEEDED'],
    };
    writeQiForensics(root, 'A', base);
    writeQiForensics(root, 'B', base);
    writeQiForensics(root, 'C', base);
    writeQiForensics(root, 'D', base);

    generateStepASummary({ artifactRoot: root, outPath, getCommitHash: () => 'cafe123' });
    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));

    expect(payload.canonicalComparableCaseCount).toBe(0);
    expect(payload.canonicalStructuralComparableCaseCount).toBe(4);
    expect(payload.canonicalSemanticGapCaseCount).toBe(4);
    expect(payload.nonComparableCaseCount).toBe(0);
    expect(payload.minMarginRatioRawComputedComparable).toBe(null);
    expect(payload.minMarginRatioRawComputedStructuralComparable).toBe(1);
    expect(payload.candidatePassFoundCanonicalComparable).toBe(false);
    expect(payload.candidatePassFoundStructuralComparable).toBe(false);
    expect(payload.structuralSemanticGapTop).toEqual([{ reason: 'coupling_semantics_diagnostic_only', count: 4 }]);
  });
});
