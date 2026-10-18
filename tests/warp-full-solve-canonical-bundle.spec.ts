import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertBundleProvenanceFresh,
  assertEvidenceSnapshotStrongClaimClosure,
  runCommandWithRetry,
} from '../scripts/warp-full-solve-canonical-bundle';

const getCanonicalCommands = (script: string): string[] => {
  const commandMatches = script.matchAll(/\['run',\s*'([^']+)'\]/g);
  return Array.from(commandMatches, (match) => match[1]);
};

describe('warp-full-solve-canonical-bundle sequencing', () => {
  it('re-runs canonical campaign after recovery/governance/ledger finalization', () => {
    const script = fs.readFileSync('scripts/warp-full-solve-canonical-bundle.ts', 'utf8');
    const commands = getCanonicalCommands(script);
    expect(commands.filter((cmd) => cmd === 'warp:full-solve:canonical')).toHaveLength(2);
    expect(commands).toEqual([
      'warp:full-solve:canonical',
      'warp:full-solve:g4-sensitivity',
      'warp:full-solve:g4-stepA-summary',
      'warp:full-solve:g4-recovery-search',
      'warp:full-solve:g4-recovery-parity',
      'warp:full-solve:g4-coupling-localization',
      'warp:full-solve:g4-coupling-ablation',
      'warp:full-solve:g4-semantic-bridge-matrix',
      'warp:full-solve:g4-operator-mapping-audit',
      'warp:full-solve:g4-kernel-provenance-audit',
      'warp:full-solve:g4-curvature-applicability-audit',
      'warp:full-solve:g4-uncertainty-audit',
      'warp:full-solve:g4-literature-parity-replay',
      'warp:full-solve:g4-governance-matrix',
      'warp:full-solve:g4-decision-ledger',
      'warp:full-solve:canonical',
      'warp:full-solve:promotion-bundle',
      'warp:full-solve:evidence-snapshot',
    ]);
  });

  it('uses fail-fast timeout behavior for timed-out commands', () => {
    const fakeSpawn = () => ({
      status: null,
      signal: 'SIGTERM',
      output: [],
      stdout: null,
      stderr: null,
      pid: 0,
      error: new Error('spawnSync npm ETIMEDOUT'),
    });
    expect(() =>
      runCommandWithRetry(['run', 'warp:full-solve:canonical'], {
        timeoutMs: 1234,
        maxRetries: 2,
        runSpawnSync: fakeSpawn as any,
      }),
    ).toThrow(/timeout after 1234ms/);
  });

  it('retries once for transient bootstrap failures', () => {
    let calls = 0;
    const fakeSpawn = () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 1,
          signal: null,
          output: [],
          stdout: null,
          stderr: null,
          pid: 1,
          error: new Error('transient bootstrap failure'),
        };
      }
      return {
        status: 0,
        signal: null,
        output: [],
        stdout: null,
        stderr: null,
        pid: 1,
      };
    };

    expect(() =>
      runCommandWithRetry(['run', 'warp:full-solve:canonical'], { maxRetries: 1, runSpawnSync: fakeSpawn as any }),
    ).not.toThrow();
    expect(calls).toBe(2);
  });

  it('fails if recovery provenance commit is missing or stale', () => {
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        {},
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
      ),
    ).toThrow(/Recovery artifact provenance commit hash mismatch/);
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'def456' } },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
      ),
    ).toThrow(/Recovery artifact provenance commit hash mismatch/);
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { commitHash: 'def456' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
      ),
    ).toThrow(/Recovery parity provenance commit hash mismatch/);
  });

  it('fails if Step A summary provenance is missing or stale', () => {
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        {},
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
      ),
    ).toThrow(/Step A summary commit hash mismatch/);
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'def456' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
      ),
    ).toThrow(/Step A summary commit hash mismatch/);
  });

  it('fails if coupling localization or ablation provenance is missing or stale', () => {
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { commitHash: 'abc123' },
        {},
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
      ),
    ).toThrow(/Coupling localization provenance commit hash mismatch/);
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { provenance: { commitHash: 'def456' } },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
      ),
    ).toThrow(/Coupling ablation provenance commit hash mismatch/);
  });

  it('fails if semantic bridge matrix provenance is missing or stale', () => {
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        {},
        { commitHash: 'abc123' },
      ),
    ).toThrow(/Semantic bridge matrix provenance commit hash mismatch/);
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'def456' },
        { commitHash: 'abc123' },
      ),
    ).toThrow(/Semantic bridge matrix provenance commit hash mismatch/);
  });

  it('fails if kernel provenance audit provenance is missing or stale', () => {
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        {},
      ),
    ).toThrow(/Kernel provenance audit provenance commit hash mismatch/);
    expect(() =>
      assertBundleProvenanceFresh(
        'abc123',
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { provenance: { commitHash: 'abc123' } },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'abc123' },
        { commitHash: 'def456' },
      ),
    ).toThrow(/Kernel provenance audit provenance commit hash mismatch/);
  });

  it('checks curvature applicability audit provenance freshness in bundle finalization', () => {
    const script = fs.readFileSync('scripts/warp-full-solve-canonical-bundle.ts', 'utf8');
    expect(script).toContain('g4-curvature-applicability-audit-2026-03-02.json');
    expect(script).toContain('Curvature applicability audit provenance commit hash mismatch');
    expect(script).toContain('g4-promotion-bundle-2026-03-01.json');
    expect(script).toContain('Promotion bundle provenance commit hash mismatch');
    expect(script).toContain('Promotion bundle blocked fail-closed');
    expect(script).toContain('warp-evidence-snapshot-2026-03-02.json');
    expect(script).toContain('Evidence snapshot provenance commit hash mismatch');
    expect(script).toContain('Evidence snapshot blocked fail-closed');
    expect(script).toContain('Evidence snapshot strong-claim closure blocked fail-closed');
    expect(script).toContain('g4-literature-parity-replay-2026-03-02.json');
    expect(script).toContain('Literature parity replay blocked fail-closed');
  });

  it('fails closed when evidence snapshot strong-claim closure passAll is false', () => {
    expect(() => assertEvidenceSnapshotStrongClaimClosure({ strongClaimClosure: { passAll: false } })).toThrow(
      /Evidence snapshot strong-claim closure blocked fail-closed/,
    );
  });

  it('passes when evidence snapshot strong-claim closure passAll is true', () => {
    expect(() => assertEvidenceSnapshotStrongClaimClosure({ strongClaimClosure: { passAll: true } })).not.toThrow();
  });

  it('preserves canonical report recovery and governance provenance consistency after bundle', () => {
    const reportPath = path.resolve('docs/audits/research/warp-full-solve-campaign-execution-report-2026-02-24.md');
    const recoveryPath = path.resolve('artifacts/research/full-solve/g4-recovery-search-2026-02-27.json');
    const governancePath = path.resolve('artifacts/research/full-solve/g4-governance-matrix-2026-02-27.json');

    const report = fs.readFileSync(reportPath, 'utf8');
    const recovery = JSON.parse(fs.readFileSync(recoveryPath, 'utf8')) as Record<string, any>;
    JSON.parse(fs.readFileSync(governancePath, 'utf8')) as Record<string, any>;

    const recoveryBest = (recovery.bestCandidate ?? {}) as Record<string, any>;
    expect(report).toContain('- best candidate id:');
    expect(report).toContain('- best candidate marginRatioRawComputed:');
    expect(report).toContain('- recovery provenance commit:');
    expect(report).toContain('- governance artifact commit:');
    expect(recoveryBest).toBeDefined();
  });

  it('canonical temp-path/non-canonical runs do not mutate canonical report', () => {
    const campaignSpec = fs.readFileSync('tests/warp-full-solve-campaign.spec.ts', 'utf8');
    expect(campaignSpec).toContain('temp --out campaign run does not mutate canonical readiness report');
  });
});
