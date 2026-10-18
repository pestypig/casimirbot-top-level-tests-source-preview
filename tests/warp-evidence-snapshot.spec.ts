import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateWarpEvidenceSnapshot } from '../scripts/warp-evidence-snapshot';

const writeJson = (filePath: string, payload: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

const writeText = (filePath: string, text: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
};

describe('warp evidence snapshot generator', () => {
  it('emits deterministic pass payload for readable files and passing closure specs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-snapshot-pass-'));
    writeText(path.join(root, 'WARP_AGENTS.md'), 'warp policy');
    writeJson(path.join(root, 'artifacts/research/full-solve/campaign-gate-scoreboard-2026-02-24.json'), {
      decision: 'REDUCED_ORDER_ADMISSIBLE',
      counts: { PASS: 8, FAIL: 0, UNKNOWN: 0, NOT_READY: 0, NOT_APPLICABLE: 1 },
    });
    writeJson(path.join(root, 'artifacts/research/full-solve/campaign-first-fail-map-2026-02-24.json'), {
      globalFirstFail: 'none',
    });
    writeJson(path.join(root, 'artifacts/research/full-solve/g4-calculator-2026-03-01.json'), {
      decisionClass: 'candidate_pass_found',
      congruentSolvePass: true,
      marginRatioRawComputed: 0.12,
      applicabilityStatus: 'PASS',
    });
    writeJson(path.join(root, 'artifacts/research/full-solve/g4-candidate-promotion-check-2026-03-01.json'), {
      aggregate: { decision: 'ADMISSIBLE', firstFail: { firstFail: 'none' }, candidatePromotionReady: true, candidatePromotionStable: true },
    });
    writeJson(path.join(root, 'artifacts/research/full-solve/g4-promotion-bundle-2026-03-01.json'), {
      blockedReason: null,
      promotionLaneExecuted: true,
    });
    writeJson(path.join(root, 'artifacts/research/full-solve/g4-operator-mapping-audit-2026-03-02.json'), {
      operatorEvidenceStatus: 'pass',
    });
    writeJson(path.join(root, 'artifacts/research/full-solve/g4-kernel-provenance-audit-2026-03-02.json'), {
      kernelEvidenceStatus: 'pass',
    });
    writeJson(path.join(root, 'artifacts/research/full-solve/g4-curvature-applicability-audit-2026-03-02.json'), {
      curvatureEvidenceStatus: 'pass',
    });
    writeJson(path.join(root, 'artifacts/research/full-solve/g4-uncertainty-audit-2026-03-02.json'), {
      uncertaintyEvidenceStatus: 'pass',
    });
    writeJson(path.join(root, 'artifacts/research/full-solve/g4-literature-parity-replay-2026-03-02.json'), {
      parityEvidenceStatus: 'pass',
      blockedReason: null,
    });
    for (const wave of ['A', 'B', 'C', 'D']) {
      writeJson(path.join(root, 'artifacts/research/full-solve', wave, 'evidence-pack.json'), {
        reproducibility: { repeatedRunGateAgreement: { status: 'PASS' } },
      });
    }
    writeText(
      path.join(root, 'artifacts/training-trace.jsonl'),
      `${JSON.stringify({ traceId: 'adapter:a', runId: 1, pass: true, firstFail: null, certificateHash: 'hash', integrityOk: true })}\n`,
    );
    writeText(
      path.join(root, 'artifacts/training-trace-export.jsonl'),
      `${JSON.stringify({ traceId: 'adapter:b', runId: 2, pass: true, firstFail: null, certificateHash: 'hash', integrityOk: true })}\n`,
    );

    const outPath = path.join(root, 'out', 'snapshot.json');
    const result = generateWarpEvidenceSnapshot({
      rootDir: root,
      outPath,
      requiredPaths: ['WARP_AGENTS.md', 'artifacts/training-trace.jsonl', 'artifacts/training-trace-export.jsonl'],
      getCommitHash: () => 'abc1234',
    });

    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    const snapshot = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(snapshot.blocked).toBe(false);
    expect(snapshot.commitHash).toBe('abc1234');
    expect(snapshot.strongClaimClosure.specStatus.A_operatorMapping.status).toBe('pass');
    expect(snapshot.strongClaimClosure.specStatus.B_samplingKernelProvenance.status).toBe('pass');
    expect(snapshot.strongClaimClosure.specStatus.C_curvatureApplicability.status).toBe('pass');
    expect(snapshot.strongClaimClosure.specStatus.D_uncertaintyDecisionBand.status).toBe('pass');
    expect(snapshot.strongClaimClosure.specStatus.E_literatureParityReplay.status).toBe('pass');
    expect(snapshot.strongClaimClosure.specStatus.F_reproducibilityAgreement.status).toBe('pass');
    expect(snapshot.strongClaimClosure.specStatus.G_promotionReadinessAndStability.status).toBe('pass');
    expect(snapshot.strongClaimClosure.passAll).toBe(true);
  });

  it('fails closed when a required local file is unreadable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-snapshot-blocked-'));
    writeText(path.join(root, 'WARP_AGENTS.md'), 'warp policy');
    const outPath = path.join(root, 'out', 'snapshot.json');
    const result = generateWarpEvidenceSnapshot({
      rootDir: root,
      outPath,
      requiredPaths: ['WARP_AGENTS.md', 'artifacts/training-trace.jsonl'],
      getCommitHash: () => 'abc1234',
    });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.stopReason).toContain('artifacts/training-trace.jsonl');
    const snapshot = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(snapshot.blocked).toBe(true);
    expect(snapshot.stopReason).toContain('artifacts/training-trace.jsonl');
    const missingRow = snapshot.requiredFiles.find((row: any) => row.path === 'artifacts/training-trace.jsonl');
    expect(missingRow?.readable).toBe(false);
  });
});
