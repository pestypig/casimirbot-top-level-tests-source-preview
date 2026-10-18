import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { generateG4GovernanceMatrix } from '../scripts/warp-g4-governance-matrix';

const sha256File = (filePath: string) =>
  createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

describe('warp g4 governance matrix', () => {
  it('emits deterministic mismatch explanation and dual fail classification using isolated temp outputs', () => {
    const canonicalJson = path.join('artifacts', 'research', 'full-solve', 'g4-governance-matrix-2026-02-27.json');
    const canonicalMd = path.join('docs', 'audits', 'research', 'warp-g4-governance-matrix-2026-02-27.md');
    const beforeJsonHash = fs.existsSync(canonicalJson) ? sha256File(canonicalJson) : null;
    const beforeMdHash = fs.existsSync(canonicalMd) ? sha256File(canonicalMd) : null;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-governance-matrix-'));
    const outJson = path.join(tmpDir, 'matrix.json');
    const outMd = path.join(tmpDir, 'matrix.md');
    const result = generateG4GovernanceMatrix({
      rootDir: '.',
      outJsonPath: outJson,
      outMdPath: outMd,
    });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(result.json)).toBe(true);
    expect(fs.existsSync(result.markdown)).toBe(true);
    expect(result.json).toBe(outJson);
    expect(result.markdown).toBe(outMd);

    const json = JSON.parse(fs.readFileSync(result.json, 'utf8'));
    expect(Array.isArray(json.rows)).toBe(true);
    expect(json.rows.length).toBe(4);
    expect(json.commitHashShapeValid).toBe(true);
    expect(typeof json.commitHashResolvable).toBe('boolean');
    expect(typeof json.commitHashMatchesHead).toBe('boolean');
    if (json.commitHashMatchesHead) {
      expect(json.commitHashResolvable).toBe(true);
    }
    expect(Array.isArray(json.canonicalMissingWaves)).toBe(true);
    expect(json.canonicalMissingWaves).toEqual([]);
    expect(json.canonicalAuthoritativeClass).toBe('both');
    expect(json.computedOnlyCounterfactualClass).toBe('computed-bound dominated');
    expect(json.mismatch).toBe(true);
    expect(String(json.mismatchReason)).toContain('canonical_authoritative_uses_policy_bound');
    for (const row of json.rows) {
      expect(row.g4DualFailMode).toBe('both');
      expect(row.canonicalAuthoritativeClass).toBe('both');
      expect(row.computedOnlyCounterfactualClass).toBe('computed-bound dominated');
      expect(row.mismatch).toBe(true);
      expect(String(row.mismatchReason)).toContain('canonical=both;counterfactual=computed-bound dominated');
    }

    const md = fs.readFileSync(outMd, 'utf8');
    expect(md).toContain('computed-only counterfactual class (non-authoritative)');

    const afterJsonHash = fs.existsSync(canonicalJson) ? sha256File(canonicalJson) : null;
    const afterMdHash = fs.existsSync(canonicalMd) ? sha256File(canonicalMd) : null;
    expect(afterJsonHash).toBe(beforeJsonHash);
    expect(afterMdHash).toBe(beforeMdHash);
  });

  it('fails closed to evidence_path_blocked for aggregate disagreement across waves', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-governance-wave-disagree-'));
    const artifactsRoot = path.join(tmpRoot, 'artifacts', 'research', 'full-solve');
    fs.mkdirSync(artifactsRoot, { recursive: true });

    const waveData = [
      { wave: 'A', marginRatioRaw: 2, marginRatioRawComputed: 0.5 },
      { wave: 'B', marginRatioRaw: 0.5, marginRatioRawComputed: 2 },
    ] as const;

    for (const entry of waveData) {
      const waveDir = path.join(artifactsRoot, entry.wave);
      fs.mkdirSync(waveDir, { recursive: true });
      fs.writeFileSync(
        path.join(waveDir, 'evidence-pack.json'),
        JSON.stringify(
          {
            g4Diagnostics: {
              lhs_Jm3: -2,
              boundComputed_Jm3: -1,
              boundUsed_Jm3: -1,
              boundFloorApplied: false,
              marginRatioRaw: entry.marginRatioRaw,
              marginRatioRawComputed: entry.marginRatioRawComputed,
              applicabilityStatus: 'PASS',
            },
          },
          null,
          2,
        ),
      );
    }

    const result = generateG4GovernanceMatrix({
      rootDir: tmpRoot,
      outJsonPath: path.join(tmpRoot, 'matrix.json'),
      outMdPath: path.join(tmpRoot, 'matrix.md'),
      waves: ['A', 'B'],
      getCommitHash: () => 'test-commit',
    });

    expect(result.payload.canonicalAuthoritativeClass).toBe('evidence_path_blocked');
    expect(result.payload.mismatch).toBe(true);
    expect(result.payload.mismatchReason).toContain('canonical_authoritative_aggregate_wave_disagreement');
  });

  it('fails closed when required wave evidence is missing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-governance-missing-wave-'));
    const artifactsRoot = path.join(tmpRoot, 'artifacts', 'research', 'full-solve');
    fs.mkdirSync(path.join(artifactsRoot, 'A'), { recursive: true });
    fs.writeFileSync(
      path.join(artifactsRoot, 'A', 'evidence-pack.json'),
      JSON.stringify(
        {
          g4Diagnostics: {
            lhs_Jm3: -2,
            boundComputed_Jm3: -1,
            boundUsed_Jm3: -1,
            boundFloorApplied: false,
            marginRatioRaw: 2,
            marginRatioRawComputed: 2,
            applicabilityStatus: 'PASS',
          },
        },
        null,
        2,
      ),
    );

    const result = generateG4GovernanceMatrix({
      rootDir: tmpRoot,
      outJsonPath: path.join(tmpRoot, 'matrix.json'),
      outMdPath: path.join(tmpRoot, 'matrix.md'),
      waves: ['A', 'B'],
      getCommitHash: () => 'test-commit',
    });

    expect(result.payload.canonicalAuthoritativeClass).toBe('evidence_path_blocked');
    expect(result.payload.canonicalMissingWaves).toEqual(['B']);
    expect(result.payload.mismatch).toBe(true);
    expect(String(result.payload.mismatchReason)).toContain('canonical_authoritative_aggregate_missing_required_waves');
    expect(result.payload.rows.find((row: any) => row.wave === 'B')?.evidencePresent).toBe(false);
  });
});
