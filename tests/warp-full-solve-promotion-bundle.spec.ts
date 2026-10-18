import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPromotionBundle } from '../scripts/warp-full-solve-promotion-bundle';

const SOLUTION_CATEGORY = 'Needle Hull Mark 2';
const PROFILE_VERSION = 'NHM2-2026-03-01';

const writeJson = (filePath: string, payload: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

const writeStrongClaimAudits = (rootDir: string, commitHash = 'abc123') => {
  writeJson(path.join(rootDir, 'artifacts/research/full-solve/g4-operator-mapping-audit-2026-03-02.json'), {
    operatorEvidenceStatus: 'pass',
    blockedReason: null,
    provenance: { commitHash },
  });
  writeJson(path.join(rootDir, 'artifacts/research/full-solve/g4-kernel-provenance-audit-2026-03-02.json'), {
    kernelEvidenceStatus: 'pass',
    blockedReason: null,
    provenance: { commitHash },
  });
  writeJson(path.join(rootDir, 'artifacts/research/full-solve/g4-curvature-applicability-audit-2026-03-02.json'), {
    curvatureEvidenceStatus: 'pass',
    blockedReason: null,
    provenance: { commitHash },
  });
  writeJson(path.join(rootDir, 'artifacts/research/full-solve/g4-uncertainty-audit-2026-03-02.json'), {
    uncertaintyEvidenceStatus: 'pass',
    blockedReason: null,
    provenance: { commitHash },
  });
};

describe('warp-full-solve-promotion-bundle', () => {
  it('fails closed when promotion-check artifact is missing after generation command', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-promotion-bundle-missing-'));
    const promotionCheckPath = path.join(tmpRoot, 'promotion-check.json');
    const outPath = path.join(tmpRoot, 'promotion-bundle.json');

    const result = runPromotionBundle({
      rootDir: tmpRoot,
      promotionCheckPath,
      outPath,
      runCommand: () => undefined,
      getCommitHash: () => 'abc123',
    });

    expect(result.blockedReason).toBe('promotion_check_missing_after_generation');
    expect(result.promotionLaneExecuted).toBe(false);
    expect(result.candidateId).toBeNull();
    expect(result.solutionCategory).toBe(SOLUTION_CATEGORY);
    expect(result.promotedProfileVersion).toBe(PROFILE_VERSION);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it('fails closed when promotion-check candidate readiness is false', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-promotion-bundle-not-ready-'));
    const promotionCheckPath = path.join(tmpRoot, 'promotion-check.json');
    const outPath = path.join(tmpRoot, 'promotion-bundle.json');

    writeJson(promotionCheckPath, {
      blockedReason: null,
      candidate: {
        id: 'case_0001',
      },
      aggregate: {
        candidatePromotionReady: false,
        candidatePromotionStable: false,
      },
      provenance: {
        commitHash: 'abc123',
      },
    });

    const result = runPromotionBundle({
      rootDir: tmpRoot,
      promotionCheckPath,
      outPath,
      runCommand: () => undefined,
      getCommitHash: () => 'abc123',
    });

    expect(result.blockedReason).toBe('promotion_check_not_ready:ready=false;stable=false');
    expect(result.promotionLaneExecuted).toBe(false);
    expect(result.candidateId).toBeNull();
    expect(result.solutionCategory).toBe(SOLUTION_CATEGORY);
    expect(result.promotedProfileVersion).toBe(PROFILE_VERSION);
  });

  it('runs promoted lane and emits deterministic summary when promotion check is ready', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-promotion-bundle-pass-'));
    const promotionCheckPath = path.join(tmpRoot, 'promotion-check.json');
    const promotionLaneOutDir = path.join(tmpRoot, 'promotion-lane');
    const outPath = path.join(tmpRoot, 'promotion-bundle.json');
    const commandCalls: string[] = [];

    writeJson(promotionCheckPath, {
      blockedReason: null,
      candidate: {
        id: 'case_0001',
      },
      aggregate: {
        candidatePromotionReady: true,
        candidatePromotionStable: true,
      },
      provenance: {
        commitHash: 'abc123',
      },
    });
    writeJson(path.join(promotionLaneOutDir, 'campaign-gate-scoreboard-2026-02-24.json'), {
      decision: 'REDUCED_ORDER_ADMISSIBLE',
      statusCounts: { PASS: 8, FAIL: 0, UNKNOWN: 0, NOT_READY: 0, NOT_APPLICABLE: 1 },
    });
    writeJson(path.join(promotionLaneOutDir, 'campaign-first-fail-map-2026-02-24.json'), {
      globalFirstFail: 'none',
    });
    writeStrongClaimAudits(tmpRoot);
    for (const wave of ['A', 'B', 'C', 'D']) {
      writeJson(path.join(promotionLaneOutDir, wave, 'qi-forensics.json'), {
        lhs_Jm3: -3.09,
        boundComputed_Jm3: -24,
        boundUsed_Jm3: -24,
        marginRatioRawComputed: 0.12,
        applicabilityStatus: 'PASS',
        rhoSource: 'warp.metric.T00.natario_sdf.shift',
      });
    }

    const result = runPromotionBundle({
      rootDir: tmpRoot,
      promotionCheckPath,
      promotionLaneOutDir,
      outPath,
      requestedCandidateId: 'case_0001',
      runCommand: (args) => {
        commandCalls.push(args.join(' '));
      },
      getCommitHash: () => 'abc123',
    });

    expect(result.blockedReason).toBeNull();
    expect(result.candidateId).toBe('case_0001');
    expect(result.promotionLaneExecuted).toBe(true);
    expect(result.promotionLaneDecision).toBe('REDUCED_ORDER_ADMISSIBLE');
    expect(result.promotionLaneFirstFail).toBe('none');
    expect(result.promotionLaneG4ComparablePassAllWaves).toBe(true);
    expect(result.solutionCategory).toBe(SOLUTION_CATEGORY);
    expect(result.promotedProfileVersion).toBe(PROFILE_VERSION);
    expect(result.promotionLaneCounts?.PASS).toBe(8);
    expect(commandCalls).toHaveLength(2);
    expect(commandCalls[0]).toContain('warp:full-solve:g4-candidate-promotion-check');
    expect(commandCalls[0]).toContain('-- --lane fixed_candidate');
    expect(commandCalls[1]).toContain('warp:full-solve:campaign');
    expect(commandCalls[1]).toContain('--promote-candidate-id case_0001');

    const persisted = JSON.parse(fs.readFileSync(outPath, 'utf8')) as Record<string, unknown>;
    expect(persisted.blockedReason).toBeNull();
    expect((persisted as any).solutionCategory).toBe(SOLUTION_CATEGORY);
    expect((persisted as any).promotedProfileVersion).toBe(PROFILE_VERSION);
    expect((persisted as any).governance?.canonicalDecisionRemainsAuthoritative).toBe(true);
  });

  it('fails closed when strong-claim evidence artifacts are missing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-promotion-bundle-strong-claim-missing-'));
    const promotionCheckPath = path.join(tmpRoot, 'promotion-check.json');
    const outPath = path.join(tmpRoot, 'promotion-bundle.json');
    const commandCalls: string[] = [];

    writeJson(promotionCheckPath, {
      blockedReason: null,
      candidate: { id: 'case_0001' },
      aggregate: {
        candidatePromotionReady: true,
        candidatePromotionStable: true,
      },
      provenance: {
        commitHash: 'abc123',
      },
    });

    const result = runPromotionBundle({
      rootDir: tmpRoot,
      promotionCheckPath,
      outPath,
      runCommand: (args) => {
        commandCalls.push(args.join(' '));
      },
      getCommitHash: () => 'abc123',
    });

    expect(result.blockedReason).toBe(
      'promotion_strong_claim_blocked:strong_claim_evidence_missing:artifacts/research/full-solve/g4-operator-mapping-audit-2026-03-02.json',
    );
    expect(result.promotionLaneExecuted).toBe(false);
    expect(result.candidateId).toBe('case_0001');
    expect(result.candidatePromotionReady).toBe(true);
    expect(result.candidatePromotionStable).toBe(true);
    expect(commandCalls).toHaveLength(1);
    expect(commandCalls[0]).toContain('warp:full-solve:g4-candidate-promotion-check');
  });

  it('fails closed when promotion-check provenance commit is stale vs HEAD', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-promotion-bundle-stale-'));
    const promotionCheckPath = path.join(tmpRoot, 'promotion-check.json');
    const outPath = path.join(tmpRoot, 'promotion-bundle.json');

    writeJson(promotionCheckPath, {
      blockedReason: null,
      candidate: { id: 'case_0001' },
      aggregate: {
        candidatePromotionReady: true,
        candidatePromotionStable: true,
      },
      provenance: {
        commitHash: 'def456',
      },
    });

    const result = runPromotionBundle({
      rootDir: tmpRoot,
      promotionCheckPath,
      outPath,
      runCommand: () => undefined,
      getCommitHash: () => 'abc123',
    });

    expect(result.blockedReason).toBe('promotion_check_commit_stale:promotion_check=def456;head=abc123');
    expect(result.promotionLaneExecuted).toBe(false);
  });
});
