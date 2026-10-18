import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOUNDARY_STATEMENT, generateG4DecisionLedger } from '../scripts/generate-g4-decision-ledger';

const writeJson = (p: string, v: unknown) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
};

const makeRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'g4-ledger-'));

const seedBase = (root: string) => {
  writeJson(path.join(root, 'campaign-gate-scoreboard-2026-02-24.json'), {
    decision: 'INADMISSIBLE',
    statusCounts: { PASS: 7, FAIL: 1, UNKNOWN: 0, NOT_READY: 0, NOT_APPLICABLE: 1 },
  });
  writeJson(path.join(root, 'campaign-first-fail-map-2026-02-24.json'), {
    globalFirstFail: 'G4',
  });
  writeJson(path.join(root, 'g4-influence-scan-2026-02-26.json'), {
    decision: {
      classification: 'applicability_limited',
      scanCandidatePassFound: false,
      scanAnyApplicabilityPass: false,
      scanMinMarginRatioRawAmongApplicabilityPass: null,
    },
    rankedEffects: [],
  });
};

const writeWave = (root: string, wave: string, marginRatioRaw = 1) => {
  writeJson(path.join(root, wave, 'evidence-pack.json'), {
    g4Diagnostics: {
      marginRatioRaw,
      applicabilityStatus: 'PASS',
      boundComputed_Jm3: -18,
      boundUsed_Jm3: -100,
      boundFloorApplied: true,
    },
  });
};

describe('g4-decision-ledger generator', () => {
  it('keeps canonical override over scan decision class', () => {
    const root = makeRoot();
    seedBase(root);
    for (const wave of ['A', 'B', 'C', 'D']) writeWave(root, wave, 1);
    const out = path.join(root, 'out.json');
    generateG4DecisionLedger({
      rootDir: root,
      outPath: out,
      scoreboardPath: path.join(root, 'campaign-gate-scoreboard-2026-02-24.json'),
      firstFailPath: path.join(root, 'campaign-first-fail-map-2026-02-24.json'),
      influencePath: path.join(root, 'g4-influence-scan-2026-02-26.json'),
      getCommitHash: () => 'deadbeef',
    });
    const ledger = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(ledger.canonicalDecisionClass).toBe('margin_limited');
    expect(ledger.scanDecisionClass).toBe('applicability_limited');
    expect(ledger.finalDecisionClass).toBe('margin_limited');
  });

  it('fails closed when canonical wave evidence is missing', () => {
    const root = makeRoot();
    seedBase(root);
    for (const wave of ['A', 'B', 'C']) writeWave(root, wave, 1);
    const out = path.join(root, 'out.json');
    generateG4DecisionLedger({
      rootDir: root,
      outPath: out,
      scoreboardPath: path.join(root, 'campaign-gate-scoreboard-2026-02-24.json'),
      firstFailPath: path.join(root, 'campaign-first-fail-map-2026-02-24.json'),
      influencePath: path.join(root, 'g4-influence-scan-2026-02-26.json'),
      getCommitHash: () => 'deadbeef',
    });
    const ledger = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(ledger.canonicalDecisionClass).toBe('evidence_path_blocked');
    expect(ledger.finalDecisionClass).toBe('evidence_path_blocked');
    expect(ledger.canonicalMissingWaves).toEqual(['D']);
  });



  it('integrates recovery search block and fails closed when missing', () => {
    const root = makeRoot();
    seedBase(root);
    for (const wave of ['A', 'B', 'C', 'D']) writeWave(root, wave, 1);
    const out = path.join(root, 'out.json');
    generateG4DecisionLedger({
      rootDir: root,
      outPath: out,
      scoreboardPath: path.join(root, 'campaign-gate-scoreboard-2026-02-24.json'),
      firstFailPath: path.join(root, 'campaign-first-fail-map-2026-02-24.json'),
      influencePath: path.join(root, 'g4-influence-scan-2026-02-26.json'),
      getCommitHash: () => 'deadbeef',
    });
    const ledger = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(ledger.recoverySearch.failClosedReason).toBe('recovery_artifact_missing');
    expect(ledger.recoverySearch.caseCount).toBe(null);
    expect(ledger.couplingAblation.failClosedReason).toBe('coupling_ablation_artifact_missing');
    expect(ledger.couplingAblation.artifactPath).toBe(null);
  });

  it('integrates recovery search artifact summary', () => {
    const root = makeRoot();
    seedBase(root);
    for (const wave of ['A', 'B', 'C', 'D']) writeWave(root, wave, 1);
    writeJson(path.join(root, 'g4-recovery-search-2026-02-27.json'), {
      generatedAt: '2026-02-27T00:00:00.000Z',
      caseCount: 3,
      candidatePassFound: false,
      candidatePassFoundCanonical: false,
      candidatePassFoundComputedOnly: true,
      minMarginRatioRawAmongApplicabilityPass: 1.3,
      minMarginRatioRawComputedAmongApplicabilityPass: 0.92,
      bestCandidateEligibility: { canonicalPassEligible: false, counterfactualPassEligible: true, class: 'counterfactual_only' },
      bestCandidate: { id: 'case_0001', marginRatioRawComputed: 0.92, marginRatioRaw: 1.3, applicabilityStatus: 'PASS' },
      topRankedApplicabilityPassCases: [{ id: 'case_0001' }],
    });
    const out = path.join(root, 'out.json');
    generateG4DecisionLedger({
      rootDir: root,
      outPath: out,
      scoreboardPath: path.join(root, 'campaign-gate-scoreboard-2026-02-24.json'),
      firstFailPath: path.join(root, 'campaign-first-fail-map-2026-02-24.json'),
      influencePath: path.join(root, 'g4-influence-scan-2026-02-26.json'),
      recoveryPath: path.join(root, 'g4-recovery-search-2026-02-27.json'),
      getCommitHash: () => 'deadbeef',
    });
    const ledger = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(ledger.recoverySearch.caseCount).toBe(3);
    expect(ledger.recoverySearch.candidatePassFound).toBe(false);
    expect(ledger.recoverySearch.candidatePassFoundCanonical).toBe(false);
    expect(ledger.recoverySearch.candidatePassFoundComputedOnly).toBe(true);
    expect(ledger.recoverySearch.minMarginRatioRawAmongApplicabilityPass).toBe(1.3);
    expect(ledger.recoverySearch.minMarginRatioRawComputedAmongApplicabilityPass).toBe(0.92);
    expect(ledger.recoverySearch.bestCandidateEligibility.class).toBe('counterfactual_only');
    expect(ledger.recoverySearch.bestCandidate.id).toBe('case_0001');
    expect(ledger.recoverySearch.blockedReason).toBe(null);
    expect(ledger.recoverySearch.failClosedReason).toBe(null);
  });

  it('integrates coupling ablation summary', () => {
    const root = makeRoot();
    seedBase(root);
    for (const wave of ['A', 'B', 'C', 'D']) writeWave(root, wave, 1);
    writeJson(path.join(root, 'g4-coupling-ablation-2026-02-27.json'), {
      generatedAt: '2026-02-27T00:00:00.000Z',
      analysisMode: 'diagnostic_fallback_noncomparable_other',
      baselineCaseId: 'canonical_a',
      baselineMarginRatioRawComputed: 1498144.75,
      bestCounterfactualMarginRatioRawComputed: 1498100.12,
      candidatePassFoundCounterfactual: false,
      topAblations: [
        {
          field: 'metricT00Si_Jm3',
          estimationMode: 'linear_slope_reference_substitution',
          slopeToMarginRatioRawComputed: 2.5,
          counterfactualMarginRatioRawComputed: 1498100.12,
          counterfactualPass: false,
        },
      ],
    });
    const out = path.join(root, 'out.json');
    generateG4DecisionLedger({
      rootDir: root,
      outPath: out,
      scoreboardPath: path.join(root, 'campaign-gate-scoreboard-2026-02-24.json'),
      firstFailPath: path.join(root, 'campaign-first-fail-map-2026-02-24.json'),
      influencePath: path.join(root, 'g4-influence-scan-2026-02-26.json'),
      couplingAblationPath: path.join(root, 'g4-coupling-ablation-2026-02-27.json'),
      getCommitHash: () => 'deadbeef',
    });
    const ledger = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(ledger.couplingAblation.analysisMode).toBe('diagnostic_fallback_noncomparable_other');
    expect(ledger.couplingAblation.baselineCaseId).toBe('canonical_a');
    expect(ledger.couplingAblation.bestCounterfactualMarginRatioRawComputed).toBe(1498100.12);
    expect(ledger.couplingAblation.candidatePassFoundCounterfactual).toBe(false);
    expect(ledger.couplingAblation.topAblations).toHaveLength(1);
    expect(ledger.couplingAblation.failClosedReason).toBe(null);
  });

  it('propagates explicit coupling ablation blockedReason as fail-closed reason', () => {
    const root = makeRoot();
    seedBase(root);
    for (const wave of ['A', 'B', 'C', 'D']) writeWave(root, wave, 1);
    writeJson(path.join(root, 'g4-coupling-ablation-2026-02-27.json'), {
      generatedAt: '2026-02-27T00:00:00.000Z',
      blockedReason: 'coupling_localization_missing',
      topAblations: [],
    });
    const out = path.join(root, 'out.json');
    generateG4DecisionLedger({
      rootDir: root,
      outPath: out,
      scoreboardPath: path.join(root, 'campaign-gate-scoreboard-2026-02-24.json'),
      firstFailPath: path.join(root, 'campaign-first-fail-map-2026-02-24.json'),
      influencePath: path.join(root, 'g4-influence-scan-2026-02-26.json'),
      couplingAblationPath: path.join(root, 'g4-coupling-ablation-2026-02-27.json'),
      getCommitHash: () => 'deadbeef',
    });
    const ledger = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(ledger.couplingAblation.blockedReason).toBe('coupling_localization_missing');
    expect(ledger.couplingAblation.failClosedReason).toBe('coupling_localization_missing');
  });

  it('propagates explicit recovery blockedReason as fail-closed reason', () => {
    const root = makeRoot();
    seedBase(root);
    for (const wave of ['A', 'B', 'C', 'D']) writeWave(root, wave, 1);
    writeJson(path.join(root, 'g4-recovery-search-2026-02-27.json'), {
      generatedAt: '2026-02-27T00:00:00.000Z',
      caseCount: 160,
      blockedReason: 'no_canonical_comparable_cases_after_bootstrap',
      candidatePassFound: false,
      candidatePassFoundCanonical: false,
      candidatePassFoundComputedOnly: false,
      topRankedApplicabilityPassCases: [],
    });
    const out = path.join(root, 'out.json');
    generateG4DecisionLedger({
      rootDir: root,
      outPath: out,
      scoreboardPath: path.join(root, 'campaign-gate-scoreboard-2026-02-24.json'),
      firstFailPath: path.join(root, 'campaign-first-fail-map-2026-02-24.json'),
      influencePath: path.join(root, 'g4-influence-scan-2026-02-26.json'),
      recoveryPath: path.join(root, 'g4-recovery-search-2026-02-27.json'),
      getCommitHash: () => 'deadbeef',
    });
    const ledger = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(ledger.recoverySearch.blockedReason).toBe('no_canonical_comparable_cases_after_bootstrap');
    expect(ledger.recoverySearch.failClosedReason).toBe('no_canonical_comparable_cases_after_bootstrap');
  });

  it('emits deterministic mismatch reason and required metadata', () => {
    const root = makeRoot();
    seedBase(root);
    for (const wave of ['A', 'B', 'C', 'D']) writeWave(root, wave, 1);
    const out = path.join(root, 'out.json');
    generateG4DecisionLedger({
      rootDir: root,
      outPath: out,
      scoreboardPath: path.join(root, 'campaign-gate-scoreboard-2026-02-24.json'),
      firstFailPath: path.join(root, 'campaign-first-fail-map-2026-02-24.json'),
      influencePath: path.join(root, 'g4-influence-scan-2026-02-26.json'),
      getCommitHash: () => 'deadbeef',
    });
    const ledger = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(ledger.classificationMismatch).toBe(true);
    expect(ledger.classificationMismatchReason).toBe(
      'canonical_authoritative_override: canonical=margin_limited;scan=applicability_limited',
    );
    expect(ledger.commitHash).toBe('deadbeef');
    expect(ledger.commitHashShapeValid).toBe(true);
    expect(ledger.commitHashResolvable).toBe(false);
    expect(ledger.commitHashMatchesHead).toBe(false);
    expect(ledger.boundaryStatement).toBe(BOUNDARY_STATEMENT);
  });
});
