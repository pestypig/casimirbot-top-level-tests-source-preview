import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRecoverySearch } from '../scripts/warp-g4-recovery-search';

const writeStepASummary = (
  summaryPath: string,
  canonicalComparableCaseCount: number,
  canonicalStructuralComparableCaseCount: number = canonicalComparableCaseCount,
) => {
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        canonicalComparableCaseCount,
        canonicalStructuralComparableCaseCount,
        nonComparableCaseCount: 0,
        nonComparableBuckets: {
          non_comparable_missing_signals: 0,
          non_comparable_contract_mismatch: 0,
          non_comparable_other: 0,
        },
        minMarginRatioRawComputedComparable: null,
        candidatePassFoundCanonicalComparable: false,
      },
      null,
      2,
    )}\n`,
  );
};

const writeStepBSeed = (summaryPath: string, payload: Record<string, unknown>) => {
  fs.writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`);
};

const writeCouplingLocalizationSeed = (localizationPath: string, payload: Record<string, unknown>) => {
  fs.writeFileSync(localizationPath, `${JSON.stringify(payload, null, 2)}\n`);
};

describe('warp-g4-recovery-search', () => {
  it('is deterministic for fixed seed', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-'));
    const outA = path.join(root, 'a.json');
    const outB = path.join(root, 'b.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    writeStepASummary(stepA, 4);
    await runRecoverySearch({ outPath: outA, stepASummaryPath: stepA, seed: 1234, maxCases: 12, topN: 5, runtimeCapMs: 10_000 });
    writeStepASummary(stepA, 4);
    await runRecoverySearch({ outPath: outB, stepASummaryPath: stepA, seed: 1234, maxCases: 12, topN: 5, runtimeCapMs: 10_000 });
    const a = JSON.parse(fs.readFileSync(outA, 'utf8'));
    const b = JSON.parse(fs.readFileSync(outB, 'utf8'));
    expect(a.caseCount).toBe(12);
    expect(b.caseCount).toBe(12);
    expect(a.cases).toEqual(b.cases);
    expect(a.topRankedApplicabilityPassCases).toEqual(b.topRankedApplicabilityPassCases);
  });

  it('writes bounded deterministic settings and required fields', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-'));
    const out = path.join(root, 'out.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    writeStepASummary(stepA, 4);
    await runRecoverySearch({ outPath: out, stepASummaryPath: stepA, seed: 9, maxCases: 8, runtimeCapMs: 10_000 });
    const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(payload.deterministicSearch.seed).toBe(9);
    expect(payload.deterministicSearch.maxCases).toBe(8);
    expect(payload.caseCount).toBe(8);
    expect(typeof payload.candidatePassFound).toBe('boolean');
    expect(payload.bestCandidate).not.toBeNull();
    expect(payload).toHaveProperty('blockedReason');
    expect(payload).toHaveProperty('stepASummaryPath');
    expect(payload).toHaveProperty('stepBSummaryPath');
    expect(payload).toHaveProperty('stepCSummaryPath');
    expect(Array.isArray(payload.cases)).toBe(true);
    for (const row of payload.cases) {
      expect(row).toHaveProperty('lhs_Jm3');
      expect(row).toHaveProperty('boundComputed_Jm3');
      expect(row).toHaveProperty('boundPolicyFloor_Jm3');
      expect(row).toHaveProperty('boundEnvFloor_Jm3');
      expect(row).toHaveProperty('boundDefaultFloor_Jm3');
      expect(row).toHaveProperty('boundFloor_Jm3');
      expect(row).toHaveProperty('boundUsed_Jm3');
      expect(row).toHaveProperty('marginRatioRaw');
      expect(row).toHaveProperty('marginRatioRawComputed');
      expect(row).toHaveProperty('sumWindowDt');
      expect(row).toHaveProperty('tau_s');
      expect(row).toHaveProperty('tauConfigured_s');
      expect(row).toHaveProperty('tauWindow_s');
      expect(row).toHaveProperty('tauPulse_s');
      expect(row).toHaveProperty('tauLC_s');
      expect(row).toHaveProperty('tauSelected_s');
      expect(row).toHaveProperty('tauSelectedSource');
      expect(row).toHaveProperty('tauSelectorPolicy');
      expect(row).toHaveProperty('tauSelectorFallbackApplied');
      expect(row).toHaveProperty('tauProvenanceReady');
      expect(row).toHaveProperty('tauProvenanceMissing');
      expect(row).toHaveProperty('K');
      expect(row).toHaveProperty('safetySigma_Jm3');
      expect(row).toHaveProperty('applicabilityStatus');
      expect(row).toHaveProperty('reasonCode');
      expect(row).toHaveProperty('rhoSource');
      expect(row).toHaveProperty('classificationTag');
      expect(row).toHaveProperty('comparabilityClass');
      expect(row).toHaveProperty('quantitySemanticType');
      expect(row).toHaveProperty('quantityWorldlineClass');
      expect(row).toHaveProperty('quantitySemanticComparable');
      expect(row).toHaveProperty('quantitySemanticReason');
      expect(row).toHaveProperty('metricT00Geom');
      expect(row).toHaveProperty('metricT00SiFromGeom');
      expect(row).toHaveProperty('metricT00SiRelError');
    }
  });



  it('records dual-semantics fields and new lever coverage', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-'));
    const out = path.join(root, 'duals.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    writeStepASummary(stepA, 4);
    await runRecoverySearch({ outPath: out, stepASummaryPath: stepA, seed: 77, maxCases: 10, topN: 4, runtimeCapMs: 10_000 });
    const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(typeof payload.candidatePassFoundCanonical).toBe('boolean');
    expect(typeof payload.candidatePassFoundComputedOnly).toBe('boolean');
    expect(payload.candidatePassFound).toBe(payload.candidatePassFoundCanonical);
    expect(payload).toHaveProperty('minMarginRatioRawAmongApplicabilityPass');
    expect(payload).toHaveProperty('minMarginRatioRawComputedAmongApplicabilityPass');
    expect(payload.bestCandidateEligibility).toHaveProperty('canonicalPassEligible');
    expect(payload.bestCandidateEligibility).toHaveProperty('counterfactualPassEligible');
    expect(payload.bestCandidateEligibility).toHaveProperty('class');
    for (const row of payload.cases) {
      expect(row.params).toHaveProperty('qCavity');
      expect(row.params).toHaveProperty('qSpoilingFactor');
    }
  });

  it('caps total work and retains deterministic runtime-bounded ordering', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-'));
    const outA = path.join(root, 'cap-a.json');
    const outB = path.join(root, 'cap-b.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    writeStepASummary(stepA, 4);
    await runRecoverySearch({ outPath: outA, stepASummaryPath: stepA, seed: 123, maxCases: 3000, runtimeCapMs: 1_000 });
    writeStepASummary(stepA, 4);
    await runRecoverySearch({ outPath: outB, stepASummaryPath: stepA, seed: 123, maxCases: 3000, runtimeCapMs: 1_000 });
    const a = JSON.parse(fs.readFileSync(outA, 'utf8'));
    const b = JSON.parse(fs.readFileSync(outB, 'utf8'));
    expect(a.deterministicSearch.attemptedCaseUniverse).toBe(16174080);
    expect(a.caseCount).toBeLessThan(3000);
    expect(a.deterministicSearch.executedCaseCount).toBe(a.caseCount);
    expect(a.deterministicSearch.elapsedMs).toBeLessThanOrEqual(2_000);
    expect(a.deterministicSearch.deterministicWalk).toEqual(b.deterministicSearch.deterministicWalk);
    const overlap = Math.min(a.cases.length, b.cases.length);
    expect(a.cases.slice(0, overlap)).toEqual(b.cases.slice(0, overlap));
  });


  it('classifies comparability deterministically and treats Step A input as read-only', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-stepa-'));
    const outA = path.join(root, 'stepa-a.json');
    const outB = path.join(root, 'stepa-b.json');
    const summaryPath = path.join(root, 'g4-stepA-summary.json');

    writeStepASummary(summaryPath, 4);
    const beforeSummary = fs.readFileSync(summaryPath, 'utf8');
    await runRecoverySearch({ outPath: outA, stepASummaryPath: summaryPath, seed: 42, maxCases: 16, topN: 4, runtimeCapMs: 10_000 });
    const payloadA = JSON.parse(fs.readFileSync(outA, 'utf8'));

    writeStepASummary(summaryPath, 4);
    await runRecoverySearch({ outPath: outB, stepASummaryPath: summaryPath, seed: 42, maxCases: 16, topN: 4, runtimeCapMs: 10_000 });
    const afterSummary = fs.readFileSync(summaryPath, 'utf8');
    const payloadB = JSON.parse(fs.readFileSync(outB, 'utf8'));

    expect(payloadA.cases.map((row: any) => row.comparabilityClass)).toEqual(
      payloadB.cases.map((row: any) => row.comparabilityClass),
    );
    expect(afterSummary).toBe(beforeSummary);
    const comparabilityCounts = payloadA.cases.reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.comparabilityClass] = (acc[row.comparabilityClass] ?? 0) + 1;
        return acc;
      },
      {},
    );
    expect(
      (comparabilityCounts.comparable_canonical ?? 0) +
        (comparabilityCounts.comparable_structural_semantic_gap ?? 0) +
        (comparabilityCounts.non_comparable_missing_signals ?? 0) +
        (comparabilityCounts.non_comparable_contract_mismatch ?? 0) +
        (comparabilityCounts.non_comparable_other ?? 0),
    ).toBe(payloadA.caseCount);
  });

  it('fails closed when Step A summary is missing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-stepa-missing-'));
    const out = path.join(root, 'search.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    const stepB = path.join(root, 'g4-stepB-summary.json');
    const stepC = path.join(root, 'g4-stepC-summary.json');

    const result = await runRecoverySearch({
      outPath: out,
      stepASummaryPath: stepA,
      stepBSummaryPath: stepB,
      stepCSummaryPath: stepC,
      seed: 9,
      maxCases: 12,
      runtimeCapMs: 10_000,
    });

    expect(result.ok).toBe(false);
    expect((result as any).blockedReason).toBe('missing_stepA_summary');
    const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(payload.blockedReason).toBe('missing_stepA_summary');
    expect(payload.caseCount).toBe(0);
    expect(payload.cases).toEqual([]);
    const summaryB = JSON.parse(fs.readFileSync(stepB, 'utf8'));
    expect(summaryB.blockedReason).toBe('missing_stepA_summary');
    const summaryC = JSON.parse(fs.readFileSync(stepC, 'utf8'));
    expect(summaryC.blockedReason).toBe('missing_stepA_summary');
    expect(summaryC.bootstrapAttempted).toBe(false);
  });

  it('fails closed when Step A reports zero canonical-comparable coverage', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-stepa-zero-'));
    const out = path.join(root, 'search.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    const stepB = path.join(root, 'g4-stepB-summary.json');
    const stepC = path.join(root, 'g4-stepC-summary.json');
    writeStepASummary(stepA, 0, 0);

    const result = await runRecoverySearch({
      outPath: out,
      stepASummaryPath: stepA,
      stepBSummaryPath: stepB,
      stepCSummaryPath: stepC,
      seed: 7,
      maxCases: 16,
      runtimeCapMs: 10_000,
    });

    expect(result.ok).toBe(false);
    expect((result as any).blockedReason).toBe('no_canonical_comparable_cases');
    const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(payload.blockedReason).toBe('no_canonical_comparable_cases');
    expect(payload.caseCount).toBe(0);
    const summaryB = JSON.parse(fs.readFileSync(stepB, 'utf8'));
    expect(summaryB.blockedReason).toBe('no_canonical_comparable_cases');
    const summaryC = JSON.parse(fs.readFileSync(stepC, 'utf8'));
    expect(summaryC.blockedReason).toBe('no_canonical_comparable_cases');
    expect(summaryC.bootstrapAttempted).toBe(false);
  });

  it('allows exploratory recovery when Step A structural-comparable coverage exists', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-stepa-structural-'));
    const out = path.join(root, 'search.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    const stepB = path.join(root, 'g4-stepB-summary.json');
    const stepC = path.join(root, 'g4-stepC-summary.json');
    writeStepASummary(stepA, 0, 4);

    const result = await runRecoverySearch({
      outPath: out,
      stepASummaryPath: stepA,
      stepBSummaryPath: stepB,
      stepCSummaryPath: stepC,
      seed: 5,
      maxCases: 10,
      runtimeCapMs: 10_000,
    });

    expect(result.ok).toBeTypeOf('boolean');
    expect((result as any).blockedReason).not.toBe('no_canonical_comparable_cases');
    const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(payload.caseCount).toBeGreaterThan(0);
    expect(payload.canonicalComparableCaseCount).toBeTypeOf('number');
    expect(payload.canonicalStructuralComparableCaseCount).toBeTypeOf('number');
  });

  it('does not mutate canonical artifact during temp output runs', async () => {
    const canonical = path.resolve('artifacts/research/full-solve/g4-recovery-search-2026-02-27.json');
    const canonicalStepASummary = path.resolve('artifacts/research/full-solve/g4-stepA-summary.json');
    const before = fs.existsSync(canonical) ? fs.readFileSync(canonical, 'utf8') : null;
    const beforeSummary = fs.existsSync(canonicalStepASummary) ? fs.readFileSync(canonicalStepASummary, 'utf8') : null;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-'));
    const out = path.join(root, 'temp.json');
    const summary = path.join(root, 'g4-stepA-summary.json');
    writeStepASummary(summary, 4);
    await runRecoverySearch({ outPath: out, stepASummaryPath: summary, seed: 7, maxCases: 6, runtimeCapMs: 10_000 });
    const after = fs.existsSync(canonical) ? fs.readFileSync(canonical, 'utf8') : null;
    const afterSummary = fs.existsSync(canonicalStepASummary) ? fs.readFileSync(canonicalStepASummary, 'utf8') : null;
    expect(after).toBe(before);
    expect(afterSummary).toBe(beforeSummary);
  });

  it('writes Step B summary with comparable ranking and tau_s_ms coverage', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-'));
    const out = path.join(root, 'search.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    const stepB = path.join(root, 'g4-stepB-summary.json');
    writeStepASummary(stepA, 4);
    await runRecoverySearch({ outPath: out, stepASummaryPath: stepA, stepBSummaryPath: stepB, seed: 123, maxCases: 24, runtimeCapMs: 10_000 });
    const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
    const summary = JSON.parse(fs.readFileSync(stepB, 'utf8'));
    const tauValues = new Set(payload.cases.map((row: any) => row.params.tau_s_ms));
    for (const tau of [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 8, 10, 20, 35, 50]) {
      expect(tauValues.has(tau)).toBe(true);
    }
    expect(summary.executedCaseCount).toBe(payload.caseCount);
    expect(summary.canonicalComparableCaseCount).toBeTypeOf('number');
    expect(summary.canonicalStructuralComparableCaseCount).toBeTypeOf('number');
    expect([null, 'no_canonical_comparable_cases_after_bootstrap']).toContain(summary.blockedReason);
    expect(Array.isArray(summary.topComparableCandidates)).toBe(true);
    expect(summary.topComparableCandidates.length).toBeLessThanOrEqual(10);
    expect(Array.isArray(summary.leverInfluenceRanking)).toBe(true);
    if (summary.blockedReason === 'no_canonical_comparable_cases_after_bootstrap') {
      expect(summary.leverInfluenceRanking).toEqual([]);
    } else {
      expect(summary.leverInfluenceRanking[0]).toHaveProperty('family');
      expect(summary.leverInfluenceRanking[0]).toHaveProperty('measuredImpactAbsLhsDelta');
    }
  });

  it('uses Step B top candidate and influence seed for deterministic micro-search staging', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-micro-'));
    const out = path.join(root, 'search.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    const stepB = path.join(root, 'g4-stepB-summary.json');
    const localization = path.join(root, 'g4-coupling-localization-2026-02-27.json');
    writeStepASummary(stepA, 0, 4);
    writeStepBSeed(stepB, {
      topComparableCandidates: [
        {
          id: 'seed_case_0099',
          params: {
            warpFieldType: 'lentz',
            gammaGeo: 48,
            dutyCycle: 0.12,
            sectorCount: 200,
            concurrentSectors: 2,
            gammaVanDenBroeck: 20,
            sampler: 'hann',
            fieldType: 'scalar',
            qCavity: 1e7,
            qSpoilingFactor: 1.5,
            tau_s_ms: 35,
            gap_nm: 5,
            bubbleRadius_m: 10,
          },
        },
      ],
      leverInfluenceRanking: [
        { family: 'gammaGeo', measuredImpactAbsLhsDelta: 10, noOpByAbsLhsDelta: false },
        { family: 'warpFieldType', measuredImpactAbsLhsDelta: 6, noOpByAbsLhsDelta: false },
        { family: 'qCavity', measuredImpactAbsLhsDelta: 5, noOpByAbsLhsDelta: false },
      ],
      provenance: { commitHash: 'deadbeef' },
    });
    writeCouplingLocalizationSeed(localization, {
      termInfluenceRanking: [
        { field: 'metricT00Si_Jm3', influenceScore: 3 },
        { field: 'rhoProxy_Jm3', influenceScore: 2 },
      ],
      provenance: { commitHash: 'deadbeef' },
    });

    await runRecoverySearch({
      outPath: out,
      stepASummaryPath: stepA,
      stepBSummaryPath: stepB,
      couplingLocalizationPath: localization,
      useSeedArtifacts: true,
      seed: 101,
      maxCases: 20,
      runtimeCapMs: 10_000,
    });
    const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(payload.deterministicSearch.seedStrategy.centerSource).toBe('stepB_top_comparable');
    expect(payload.deterministicSearch.seedStrategy.centerCaseId).toBe('seed_case_0099');
    expect(payload.deterministicSearch.seedStrategy.prioritizedFamilies).toContain('gammaGeo');
    expect(payload.deterministicSearch.stagedCounts.tauPriorityRows).toBe(13);

    const tauRows = payload.cases.slice(0, 13);
    expect(new Set(tauRows.map((row: any) => row.params.tau_s_ms))).toEqual(
      new Set([0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 8, 10, 20, 35, 50]),
    );
    for (const row of tauRows) {
      expect(row.params.warpFieldType).toBe('lentz');
      expect(row.params.gammaGeo).toBe(48);
      expect(row.params.qCavity).toBe(1e7);
    }
  });

  it('emits Step C summary with bootstrap provenance and fail-closed blocker semantics', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-recovery-stepc-'));
    const out = path.join(root, 'search.json');
    const stepA = path.join(root, 'g4-stepA-summary.json');
    const stepB = path.join(root, 'g4-stepB-summary.json');
    const stepC = path.join(root, 'g4-stepC-summary.json');
    writeStepASummary(stepA, 4);
    await runRecoverySearch({
      outPath: out,
      stepASummaryPath: stepA,
      stepBSummaryPath: stepB,
      stepCSummaryPath: stepC,
      seed: 321,
      maxCases: 14,
      runtimeCapMs: 10_000,
    });
    const summary = JSON.parse(fs.readFileSync(stepC, 'utf8'));
    expect(summary.boundaryStatement).toBe(
      'This campaign defines falsifiable reduced-order full-solve gates and reproducible evidence requirements; it is not a physical warp feasibility claim.',
    );
    expect(summary.bootstrapAttempted).toBe(true);
    expect(typeof summary.bootstrapSucceeded).toBe('boolean');
    expect(typeof summary.bootstrapReason).toBe('string');
    expect(Array.isArray(summary.bootstrapProvenance)).toBe(true);
    expect(summary.executedCaseCount).toBe(14);
    expect(summary.canonicalComparableCaseCount).toBeTypeOf('number');
    expect(summary.canonicalStructuralComparableCaseCount).toBeTypeOf('number');
    expect(summary.nonComparableBuckets).toHaveProperty('non_comparable_missing_signals');
    expect(summary.semanticGapBuckets).toHaveProperty('comparable_structural_semantic_gap');
    expect(Array.isArray(summary.nonComparableDiagnosticsTop)).toBe(true);
    expect(Array.isArray(summary.topComparableCandidates)).toBe(true);
    expect(summary.topComparableCandidates.length).toBeLessThanOrEqual(10);
    expect([null, 'no_canonical_comparable_cases_after_bootstrap']).toContain(summary.blockedReason);
  });


});

