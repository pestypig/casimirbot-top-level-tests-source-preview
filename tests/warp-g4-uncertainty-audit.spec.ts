import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateG4UncertaintyAudit } from '../scripts/warp-g4-uncertainty-audit';

const mkWave = (
  root: string,
  wave: 'A' | 'B' | 'C' | 'D',
  overrides: Record<string, unknown> = {},
) => {
  const base = {
    applicabilityStatus: 'PASS',
    uncertaintyDecisionClass: 'robust_pass',
    uncertaintyCouldFlip: false,
    uncertaintySigma_Jm3: 5,
    uncertaintySigmaMeasurement_Jm3: 1,
    uncertaintySigmaModel_Jm3: 3,
    uncertaintySigmaBridge_Jm3: 5,
    uncertaintySigmaTau_Jm3: 0,
    uncertaintyDominantComponent: 'bridge',
    uncertaintyBandKSigma: 3,
    uncertaintySlackPolicy_Jm3: 1,
    uncertaintySlackComputed_Jm3: 0.8,
    uncertaintyBandLowerPolicy_Jm3: -2,
    uncertaintyBandUpperPolicy_Jm3: 3,
    uncertaintyBandLowerComputed_Jm3: -2.2,
    uncertaintyBandUpperComputed_Jm3: 2.8,
  };
  const dir = path.join(root, 'artifacts', 'research', 'full-solve', wave);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'qi-forensics.json'), `${JSON.stringify({ ...base, ...overrides }, null, 2)}\n`);
};

describe('warp g4 uncertainty audit', () => {
  it('emits deterministic pass payload when all waves are robust and no-flip', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-uncertainty-audit-pass-'));
    mkWave(tmpRoot, 'A');
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const outMdPath = path.join(tmpRoot, 'out', 'audit.md');
    const result = generateG4UncertaintyAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath,
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(true);
    expect(result.blockedReason).toBeNull();
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.uncertaintyEvidenceStatus).toBe('pass');
    expect(payload.canonicalMissingWaves).toEqual([]);
    expect(payload.allDecisionRobustPass).toBe(true);
    expect(payload.anyCouldFlip).toBe(false);
    expect(payload.allSlackPositive).toBe(true);
    expect(payload.dominantComponentCounts).toHaveProperty('bridge');
    expect(fs.existsSync(outMdPath)).toBe(true);
  });

  it('fails closed when one or more canonical qi-forensics artifacts are missing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-uncertainty-audit-missing-'));
    mkWave(tmpRoot, 'A');
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4UncertaintyAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('missing_qi_forensics_wave_artifacts');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.uncertaintyEvidenceStatus).toBe('blocked');
    expect(payload.canonicalMissingWaves).toContain('D');
  });

  it('fails closed when uncertainty decision class is not robust_pass', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-uncertainty-audit-indeterminate-'));
    mkWave(tmpRoot, 'A', { uncertaintyDecisionClass: 'indeterminate' });
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4UncertaintyAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('uncertainty_decision_not_robust_pass');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.blockedTokenCounts).toHaveProperty('uncertainty_decision_not_robust_pass');
  });

  it('fails closed when uncertainty could_flip is true even under robust_pass class', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-uncertainty-audit-flip-'));
    mkWave(tmpRoot, 'A', { uncertaintyCouldFlip: true });
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4UncertaintyAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('uncertainty_could_flip_true');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.anyCouldFlip).toBe(true);
    expect(payload.blockedTokenCounts).toHaveProperty('uncertainty_could_flip_true');
  });
});
