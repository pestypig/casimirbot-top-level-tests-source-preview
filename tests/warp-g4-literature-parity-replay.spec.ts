import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { generateG4LiteratureParityReplay } from '../scripts/warp-g4-literature-parity-replay';

const writeJson = (filePath: string, payload: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
};

const writeAuditFixture = (root: string, commitHash: string, waveOverrides: Record<string, unknown> = {}) => {
  const waves = ['A', 'B', 'C', 'D'];
  const kernelRows = waves.map((wave) => ({
    wave,
    samplingKernelIdentity: 'gaussian',
    samplingKernelNormalization: 'unit_integral',
    tau_s: 0.00002,
    K: 3.8e-30,
    KUnits: 'J*s^4/m^3',
    KDerivation: 'ford_roman_bound_constant_from_qi_guard',
    KProvenanceCommit: commitHash,
    boundComputed_Jm3: -24,
    replayKernelScale: 1010526315790.474,
    normalizationPass: true,
    unitsPass: true,
    derivationPass: true,
    provenanceCommitValid: true,
    replayPass: true,
  }));
  const operatorRows = waves.map((wave) => ({
    wave,
    qeiStateClass: 'hadamard',
    qeiRenormalizationScheme: 'point_splitting',
    qeiOperatorMapping: 't_munu_uu_ren',
    mappingComparable: true,
    mappingBridgeReady: true,
  }));
  const curvatureRows = waves.map((wave) => ({
    wave,
    applicabilityPass: true,
    ratioOrFlatEvidence: true,
    windowEvidenceReady: true,
  }));
  const uncertaintyRows = waves.map((wave) => ({
    wave,
    robustPass: true,
    couldFlip: false,
    slackPositive: true,
  }));
  const ledgerWaves = Object.fromEntries(
    waves.map((wave) => [
      wave,
      {
        applicabilityStatus: 'PASS',
        marginRatioRaw: 0.12890679702998564,
      },
    ]),
  );

  writeJson(path.join(root, 'artifacts/research/full-solve/g4-kernel-provenance-audit-2026-03-02.json'), {
    kernelEvidenceStatus: 'pass',
    waves: kernelRows,
    provenance: { commitHash },
  });
  writeJson(path.join(root, 'artifacts/research/full-solve/g4-operator-mapping-audit-2026-03-02.json'), {
    operatorEvidenceStatus: 'pass',
    waves: operatorRows,
    provenance: { commitHash },
  });
  writeJson(path.join(root, 'artifacts/research/full-solve/g4-curvature-applicability-audit-2026-03-02.json'), {
    curvatureEvidenceStatus: 'pass',
    waves: curvatureRows,
    provenance: { commitHash },
  });
  writeJson(path.join(root, 'artifacts/research/full-solve/g4-uncertainty-audit-2026-03-02.json'), {
    uncertaintyEvidenceStatus: 'pass',
    waves: uncertaintyRows,
    provenance: { commitHash },
  });
  writeJson(path.join(root, 'artifacts/research/full-solve/g4-decision-ledger-2026-02-26.json'), {
    commitHash,
    waves: { ...ledgerWaves, ...waveOverrides },
  });
};

describe('warp-g4-literature-parity-replay', () => {
  it('emits deterministic pass payload when all parity channels pass', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-g4-literature-parity-pass-'));
    const headCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    writeAuditFixture(root, headCommit);
    const outJsonPath = path.join(root, 'out', 'parity.json');
    const outMdPath = path.join(root, 'out', 'parity.md');

    const result = generateG4LiteratureParityReplay({
      rootDir: root,
      outJsonPath,
      outMdPath,
      getCommitHash: () => headCommit,
    });

    expect(result.ok).toBe(true);
    expect(result.blockedReason).toBeNull();
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.parityEvidenceStatus).toBe('pass');
    expect(payload.allWaveParityPass).toBe(true);
    expect(payload.candidateComparablePassAllWaves).toBe(true);
    expect(payload.provenance.commitHashMatchesHead).toBe(true);
    expect(payload.provenance.artifactCommitsMatchHead).toBe(true);
    expect(fs.readFileSync(outMdPath, 'utf8')).toContain('G4 Literature Parity Replay');
  });

  it('fails closed when one wave loses comparability', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-g4-literature-parity-blocked-'));
    const headCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    writeAuditFixture(root, headCommit, { A: { applicabilityStatus: 'UNKNOWN', marginRatioRaw: 1 } });
    const outJsonPath = path.join(root, 'out', 'parity.json');

    const result = generateG4LiteratureParityReplay({
      rootDir: root,
      outJsonPath,
      getCommitHash: () => headCommit,
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('literature_parity_not_pass');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.parityEvidenceStatus).toBe('blocked');
    expect(payload.topMismatches[0].wave).toBe('A');
  });
});
