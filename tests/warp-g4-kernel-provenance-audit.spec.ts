import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateG4KernelProvenanceAudit } from '../scripts/warp-g4-kernel-provenance-audit';

const mkWave = (
  root: string,
  wave: 'A' | 'B' | 'C' | 'D',
  overrides: Record<string, unknown> = {},
) => {
  const tau_s = 0.00002;
  const K = 3.8e-30;
  const boundComputed_Jm3 = -K / Math.pow(tau_s, 4);
  const base = {
    samplingKernelIdentity: 'gaussian',
    samplingKernelNormalization: 'unit_integral',
    tau_s,
    K,
    KUnits: 'J*s^4/m^3',
    KDerivation: 'ford_roman_bound_constant_from_qi_guard',
    KProvenanceCommit: 'abc1234',
    boundComputed_Jm3,
  };
  const dir = path.join(root, 'artifacts', 'research', 'full-solve', wave);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'qi-forensics.json'), `${JSON.stringify({ ...base, ...overrides }, null, 2)}\n`);
};

describe('warp g4 kernel provenance audit', () => {
  it('emits deterministic pass payload for complete canonical wave evidence', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-kernel-audit-pass-'));
    mkWave(tmpRoot, 'A');
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const outMdPath = path.join(tmpRoot, 'out', 'audit.md');
    const result = generateG4KernelProvenanceAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath,
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(true);
    expect(result.blockedReason).toBeNull();
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.kernelEvidenceStatus).toBe('pass');
    expect(payload.normalizationPassAll).toBe(true);
    expect(payload.unitsPassAll).toBe(true);
    expect(payload.derivationPassAll).toBe(true);
    expect(payload.provenanceCommitValidAll).toBe(true);
    expect(payload.replayPassAll).toBe(true);
    expect(payload.canonicalMissingWaves).toEqual([]);
    expect(payload.waves).toHaveLength(4);
    expect(fs.existsSync(outMdPath)).toBe(true);
  });

  it('fails closed when one or more canonical qi-forensics artifacts are missing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-kernel-audit-missing-'));
    mkWave(tmpRoot, 'A');
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4KernelProvenanceAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('missing_qi_forensics_wave_artifacts');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.canonicalMissingWaves).toContain('D');
    expect(payload.kernelEvidenceStatus).toBe('blocked');
  });

  it('fails closed when sampling normalization deviates from unit_integral', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-kernel-audit-norm-'));
    mkWave(tmpRoot, 'A', { samplingKernelNormalization: 'window_power' });
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4KernelProvenanceAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('sampling_kernel_normalization_mismatch');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.blockedTokenCounts).toHaveProperty('sampling_kernel_normalization_mismatch');
  });

  it('fails closed when replay kernel-scale cannot be computed deterministically', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-kernel-audit-replay-'));
    mkWave(tmpRoot, 'A', { K: 0 });
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4KernelProvenanceAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('replay_consistency_failed');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.replayPassAll).toBe(false);
    expect(payload.blockedTokenCounts).toHaveProperty('replay_consistency_failed');
  });
});
