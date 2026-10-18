import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateG4SemanticBridgeMatrix } from '../scripts/warp-g4-semantic-bridge-matrix';

const sha256File = (filePath: string) => createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

describe('warp g4 semantic bridge matrix', () => {
  it('emits deterministic blocker ranking using isolated temp outputs', () => {
    const canonicalJson = path.join('artifacts', 'research', 'full-solve', 'g4-semantic-bridge-matrix-2026-02-27.json');
    const canonicalMd = path.join('docs', 'audits', 'research', 'warp-g4-semantic-bridge-matrix-2026-02-27.md');
    const beforeJsonHash = fs.existsSync(canonicalJson) ? sha256File(canonicalJson) : null;
    const beforeMdHash = fs.existsSync(canonicalMd) ? sha256File(canonicalMd) : null;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-semantic-bridge-matrix-'));
    const outJson = path.join(tmpDir, 'matrix.json');
    const outMd = path.join(tmpDir, 'matrix.md');
    const result = generateG4SemanticBridgeMatrix({
      rootDir: '.',
      outJsonPath: outJson,
      outMdPath: outMd,
    });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(outJson)).toBe(true);
    expect(fs.existsSync(outMd)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.blockedReason).toBeNull();
    expect(Array.isArray(payload.tokens)).toBe(true);
    expect(payload.tokens.length).toBeGreaterThan(0);
    expect(typeof payload.dominantBlockerToken).toBe('string');
    expect(typeof payload.provenance?.commitHash).toBe('string');
    expect(typeof payload.provenance?.commitHashMatchesHead).toBe('boolean');
    expect(payload.tokens[0]).toHaveProperty('recommendedProbe');
    expect(payload.tokens[0]).toHaveProperty('closurePriority');

    const md = fs.readFileSync(outMd, 'utf8');
    expect(md).toContain('## Top blockers');
    expect(md).toContain('recommended probe');

    const afterJsonHash = fs.existsSync(canonicalJson) ? sha256File(canonicalJson) : null;
    const afterMdHash = fs.existsSync(canonicalMd) ? sha256File(canonicalMd) : null;
    expect(afterJsonHash).toBe(beforeJsonHash);
    expect(afterMdHash).toBe(beforeMdHash);
  });

  it('fails closed when required artifacts are missing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-semantic-bridge-matrix-missing-'));
    const outJson = path.join(tmpRoot, 'matrix.json');
    const outMd = path.join(tmpRoot, 'matrix.md');
    const result = generateG4SemanticBridgeMatrix({
      rootDir: tmpRoot,
      outJsonPath: outJson,
      outMdPath: outMd,
      stepASummaryPath: path.join(tmpRoot, 'missing-stepA.json'),
      recoveryPath: path.join(tmpRoot, 'missing-recovery.json'),
      getCommitHash: () => 'test-commit',
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe('missing_stepA_summary');
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.blockedReason).toBe('missing_stepA_summary');
    expect(payload.tokens).toEqual([]);
  });
});
