import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateG4CurvatureApplicabilityAudit } from '../scripts/warp-g4-curvature-applicability-audit';

const mkWave = (
  root: string,
  wave: 'A' | 'B' | 'C' | 'D',
  overrides: Record<string, unknown> = {},
) => {
  const base = {
    applicabilityStatus: 'PASS',
    curvatureEnforced: true,
    curvatureOk: true,
    curvatureRatio: 0.25,
    curvatureRatioNonDegenerate: true,
    curvatureFlatSpaceEquivalent: false,
    curvatureScalar: 1.2e-6,
    curvatureRadius_m: 120,
    tau_s: 0.00002,
  };
  const dir = path.join(root, 'artifacts', 'research', 'full-solve', wave);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'qi-forensics.json'), `${JSON.stringify({ ...base, ...overrides }, null, 2)}\n`);
};

describe('warp g4 curvature applicability audit', () => {
  it('emits deterministic pass payload when all waves provide non-degenerate curvature evidence', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-curvature-audit-pass-'));
    mkWave(tmpRoot, 'A');
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const outMdPath = path.join(tmpRoot, 'out', 'audit.md');
    const result = generateG4CurvatureApplicabilityAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath,
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(true);
    expect(result.blockedReason).toBeNull();
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.curvatureEvidenceStatus).toBe('pass');
    expect(payload.canonicalMissingWaves).toEqual([]);
    expect(payload.allWindowEvidenceReady).toBe(true);
    expect(payload.allRatioNonDegenerateEvidence).toBe(true);
    expect(fs.existsSync(outMdPath)).toBe(true);
  });

  it('fails closed when one or more canonical qi-forensics artifacts are missing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-curvature-audit-missing-'));
    mkWave(tmpRoot, 'A');
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4CurvatureApplicabilityAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('missing_qi_forensics_wave_artifacts');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.curvatureEvidenceStatus).toBe('blocked');
    expect(payload.canonicalMissingWaves).toContain('D');
  });

  it('fails closed when curvature ratio evidence is degenerate', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-curvature-audit-degenerate-'));
    mkWave(tmpRoot, 'A', { curvatureRatio: 0, curvatureRatioNonDegenerate: false });
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4CurvatureApplicabilityAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('curvature_ratio_degenerate');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.blockedTokenCounts).toHaveProperty('curvature_ratio_degenerate');
  });

  it('accepts explicit flat-space-equivalent evidence when curvature ratio is exactly zero', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-curvature-audit-flat-'));
    mkWave(tmpRoot, 'A', {
      curvatureRatio: 0,
      curvatureRatioNonDegenerate: false,
      curvatureFlatSpaceEquivalent: true,
      curvatureScalar: 0,
      curvatureRadius_m: null,
    });
    mkWave(tmpRoot, 'B', {
      curvatureRatio: 0,
      curvatureRatioNonDegenerate: false,
      curvatureFlatSpaceEquivalent: true,
      curvatureScalar: 0,
      curvatureRadius_m: null,
    });
    mkWave(tmpRoot, 'C', {
      curvatureRatio: 0,
      curvatureRatioNonDegenerate: false,
      curvatureFlatSpaceEquivalent: true,
      curvatureScalar: 0,
      curvatureRadius_m: null,
    });
    mkWave(tmpRoot, 'D', {
      curvatureRatio: 0,
      curvatureRatioNonDegenerate: false,
      curvatureFlatSpaceEquivalent: true,
      curvatureScalar: 0,
      curvatureRadius_m: null,
    });

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4CurvatureApplicabilityAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(true);
    expect(result.blockedReason).toBeNull();
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.allRatioNonDegenerateEvidence).toBe(false);
    expect(payload.allRatioOrFlatEvidence).toBe(true);
    expect(payload.flatSpaceEquivalentWaveCount).toBe(4);
    expect(payload.curvatureEvidenceStatus).toBe('pass');
  });

  it('fails closed when scalar/radius evidence is missing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-curvature-audit-scalar-missing-'));
    mkWave(tmpRoot, 'A', { curvatureScalar: null, curvatureRadius_m: null });
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJsonPath = path.join(tmpRoot, 'out', 'audit.json');
    const result = generateG4CurvatureApplicabilityAudit({
      rootDir: tmpRoot,
      outJsonPath,
      outMdPath: path.join(tmpRoot, 'out', 'audit.md'),
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('curvature_scalar_radius_missing');
    const payload = JSON.parse(fs.readFileSync(outJsonPath, 'utf8'));
    expect(payload.allScalarRadiusPresent).toBe(false);
    expect(payload.blockedTokenCounts).toHaveProperty('curvature_scalar_radius_missing');
  });
});
