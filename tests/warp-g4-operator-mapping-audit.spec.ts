import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateG4OperatorMappingAudit } from '../scripts/warp-g4-operator-mapping-audit';

const mkWave = (root: string, wave: 'A' | 'B' | 'C' | 'D', overrides: Record<string, unknown> = {}) => {
  const base = {
    quantitySemanticBaseType: 'classical_proxy_from_curvature',
    quantitySemanticType: 'ren_expectation_timelike_energy_density',
    quantitySemanticTargetType: 'ren_expectation_timelike_energy_density',
    quantityWorldlineClass: 'timelike',
    qeiStateClass: 'hadamard',
    qeiRenormalizationScheme: 'point_splitting',
    qeiOperatorMapping: 't_munu_uu_ren',
    qeiSamplingNormalization: 'unit_integral',
    quantitySemanticComparable: true,
    quantitySemanticBridgeReady: true,
    couplingEquationRef: 'semiclassical_coupling+atomic_energy_to_energy_density_proxy',
  };
  const dir = path.join(root, 'artifacts', 'research', 'full-solve', wave);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'qi-forensics.json'), JSON.stringify({ ...base, ...overrides }, null, 2));
};

describe('warp g4 operator mapping audit', () => {
  it('emits deterministic pass payload for fully comparable canonical waves', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-operator-audit-pass-'));
    mkWave(tmpRoot, 'A');
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJson = path.join(tmpRoot, 'out', 'audit.json');
    const outMd = path.join(tmpRoot, 'out', 'audit.md');
    const result = generateG4OperatorMappingAudit({
      rootDir: tmpRoot,
      outJsonPath: outJson,
      outMdPath: outMd,
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(true);
    expect(result.blockedReason).toBeNull();
    expect(fs.existsSync(outJson)).toBe(true);
    expect(fs.existsSync(outMd)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.operatorEvidenceStatus).toBe('pass');
    expect(payload.mappingComparableAll).toBe(true);
    expect(payload.mappingBridgeReadyAll).toBe(true);
    expect(payload.canonicalMissingWaves).toEqual([]);
    expect(Array.isArray(payload.waves)).toBe(true);
    expect(payload.waves).toHaveLength(4);
    expect(payload.waves[0]).toHaveProperty('mappingDerivationRef');
  });

  it('fails closed when qi-forensics is missing for one or more canonical waves', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-operator-audit-missing-'));
    mkWave(tmpRoot, 'A');
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');

    const outJson = path.join(tmpRoot, 'out', 'audit.json');
    const outMd = path.join(tmpRoot, 'out', 'audit.md');
    const result = generateG4OperatorMappingAudit({
      rootDir: tmpRoot,
      outJsonPath: outJson,
      outMdPath: outMd,
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('missing_qi_forensics_wave_artifacts');
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.operatorEvidenceStatus).toBe('blocked');
    expect(payload.canonicalMissingWaves).toContain('D');
  });

  it('fails closed with deterministic reason when mapping is present but non-comparable', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-operator-audit-noncomparable-'));
    mkWave(tmpRoot, 'A', { quantitySemanticComparable: false });
    mkWave(tmpRoot, 'B');
    mkWave(tmpRoot, 'C');
    mkWave(tmpRoot, 'D');

    const outJson = path.join(tmpRoot, 'out', 'audit.json');
    const outMd = path.join(tmpRoot, 'out', 'audit.md');
    const result = generateG4OperatorMappingAudit({
      rootDir: tmpRoot,
      outJsonPath: outJson,
      outMdPath: outMd,
      getCommitHash: () => 'test-commit',
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('operator_mapping_not_comparable');
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.operatorEvidenceStatus).toBe('blocked');
    expect(payload.blockedTokenCounts).toHaveProperty('operator_mapping_not_comparable');
    expect(payload.waves.find((row: any) => row.wave === 'A')?.blockedReasonTokens).toContain('operator_mapping_not_comparable');
  });
});
