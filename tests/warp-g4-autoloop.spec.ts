import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAutoloop } from '../scripts/warp-g4-autoloop';

const writeJson = (base: string, rel: string, payload: unknown) => {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(payload, null, 2)}\n`);
};

const seedArtifacts = (dir: string, parityMode: string = 'margin_limited', includePromotionBundle = true) => {
  writeJson(dir, 'artifacts/research/full-solve/campaign-gate-scoreboard-2026-02-24.json', { decision: 'INADMISSIBLE', gateStatus: { G4: 'FAIL' } });
  writeJson(dir, 'artifacts/research/full-solve/campaign-first-fail-map-2026-02-24.json', { firstFail: { gate: 'G4' } });
  writeJson(dir, 'artifacts/research/full-solve/g4-decision-ledger-2026-02-26.json', { canonicalDecisionClass: 'margin_limited' });
  writeJson(dir, 'artifacts/research/full-solve/g4-governance-matrix-2026-02-27.json', { canonicalAuthoritativeClass: 'margin_limited' });
  writeJson(dir, 'artifacts/research/full-solve/g4-recovery-search-2026-02-27.json', { provenance: { commitHash: 'abc' } });
  writeJson(dir, 'artifacts/research/full-solve/g4-recovery-parity-2026-02-27.json', { dominantFailureMode: parityMode, provenance: { commitHash: 'abc' } });
  if (includePromotionBundle) {
    writeJson(dir, 'artifacts/research/full-solve/g4-promotion-bundle-2026-03-01.json', {
      blockedReason: null,
      candidateId: 'case_0001',
      promotionLaneExecuted: true,
      promotionLaneDecision: 'REDUCED_ORDER_ADMISSIBLE',
      promotionLaneFirstFail: 'none',
      promotionLaneG4ComparablePassAllWaves: true,
    });
  }
  writeJson(dir, 'artifacts/casimir-verify.json', { verdict: 'FAIL', integrityOk: false });
  writeJson(dir, 'docs/ethos/ideology.json', { rootId: 'mission-ethos', nodes: [{ id: 'mission-ethos', title: 'Mission Ethos', children: ['integrity-protocols'] }] });
  writeJson(dir, 'artifacts/research/full-solve/g4-autoloop-state.json', { iterationCount: 0, stallCounter: 0, class: 'evidence_path_blocked' });
  const reportPath = path.join(dir, 'docs', 'audits', 'research', 'warp-full-solve-campaign-execution-report-2026-02-24.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, '# report\n');
};

describe('warp g4 autoloop', () => {
  it('writes deterministic state/history/prompt artifacts in analyze mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');

    seedArtifacts(dir, 'applicability_limited');

    const statePath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json');
    const historyPath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl');
    const promptPath = path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md');

    const result = runAutoloop([
      '--mode',
      'analyze',
      '--artifact-root',
      artifactRoot,
      '--state-path',
      statePath,
      '--history-path',
      historyPath,
      '--prompt-path',
      promptPath,
      '--casimir-path',
      path.join(dir, 'artifacts/casimir-verify.json'),
    ]);

    expect(result.ok).toBe(true);
    expect(fs.existsSync(statePath)).toBe(true);
    expect(fs.existsSync(historyPath)).toBe(true);
    expect(fs.existsSync(promptPath)).toBe(true);

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.class).toBe('margin_limited');
    expect(state.solved).toBe(false);
    expect(state.iterationCount).toBe(1);
    expect(state.remainingIterations).toBe(9);
    expect(state.parityFreshness).toBe('stale_or_missing');
    expect(state.promotionDelta.class).toBe('candidate_viable');
    expect(state.promotionDelta.promotable).toBe(true);

    const prompt = fs.readFileSync(promptPath, 'utf8');
    expect(prompt).toContain('## Canonical vs Promotion Delta');
    expect(prompt).toContain('promotion delta class: candidate_viable');
    expect(prompt).toContain('Ideology context is advisory only and cannot override evidence gates, guardrails, or completion criteria.');
    expect(prompt).toContain('This campaign defines falsifiable reduced-order full-solve gates and reproducible evidence requirements; it is not a physical warp feasibility claim.');
  });

  it('returns status summary in status mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-status-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');
    seedArtifacts(dir);

    const result = runAutoloop([
      '--mode',
      'status',
      '--artifact-root',
      artifactRoot,
      '--casimir-path',
      path.join(dir, 'artifacts/casimir-verify.json'),
      '--state-path',
      path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json'),
      '--history-path',
      path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl'),
      '--prompt-path',
      path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md'),
    ]);

    expect(result.ok).toBe(true);
    expect(result.class).toBe('margin_limited');
    expect(fs.existsSync(path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl'))).toBe(false);
  });

  it('fails closed on iteration budget exhaustion when maxIterations is 0', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-budget-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');
    const statePath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json');
    const casimirPath = path.join(dir, 'artifacts/casimir-verify.json');

    seedArtifacts(dir);

    const result = runAutoloop([
      '--mode',
      'analyze',
      '--max-iterations',
      '0',
      '--artifact-root',
      artifactRoot,
      '--casimir-path',
      casimirPath,
      '--state-path',
      statePath,
      '--history-path',
      path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl'),
      '--prompt-path',
      path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md'),
    ]);

    expect(result.ok).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.class).toBe('budget_exhausted');
    expect(state.stopReason).toBe('max_iterations_reached');
  });

  it('increments stall counter and emits stalled after repeated identical class', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-stall-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');
    const statePath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json');
    const historyPath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl');
    const promptPath = path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md');
    const casimirPath = path.join(dir, 'artifacts/casimir-verify.json');

    seedArtifacts(dir);

    runAutoloop([
      '--mode',
      'analyze',
      '--stall-cycles',
      '1',
      '--artifact-root',
      artifactRoot,
      '--casimir-path',
      casimirPath,
      '--state-path',
      statePath,
      '--history-path',
      historyPath,
      '--prompt-path',
      promptPath,
    ]);

    const result = runAutoloop([
      '--mode',
      'analyze',
      '--stall-cycles',
      '1',
      '--artifact-root',
      artifactRoot,
      '--casimir-path',
      casimirPath,
      '--state-path',
      statePath,
      '--history-path',
      historyPath,
      '--prompt-path',
      promptPath,
    ]);

    expect(result.ok).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.class).toBe('stalled');
    expect(state.stopReason).toBe('stall_cycles_reached');
    expect(state.stallCounter).toBeGreaterThanOrEqual(1);
  });

  it('runs cycle rail once and persists state/history/prompt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-cycle-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');
    const statePath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json');
    const historyPath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl');
    const promptPath = path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md');
    const casimirPath = path.join(dir, 'artifacts/casimir-verify.json');

    seedArtifacts(dir);
    let cycleRuns = 0;

    const result = runAutoloop(
      [
        '--mode',
        'cycle',
        '--artifact-root',
        artifactRoot,
        '--casimir-path',
        casimirPath,
        '--state-path',
        statePath,
        '--history-path',
        historyPath,
        '--prompt-path',
        promptPath,
      ],
      {
        runCycle: () => {
          cycleRuns += 1;
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(cycleRuns).toBe(1);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.mode).toBe('cycle');
    expect(state.stopReason).toBe('cycle_complete');
    expect(state.iterationCount).toBe(1);
    expect(fs.readFileSync(promptPath, 'utf8')).toContain('This campaign defines falsifiable reduced-order full-solve gates and reproducible evidence requirements; it is not a physical warp feasibility claim.');
    expect(fs.readFileSync(historyPath, 'utf8').trim().length).toBeGreaterThan(0);
  });

  it('fails closed on cycle budget exhaustion when maxIterations is 0', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-cycle-budget-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');
    const statePath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json');

    seedArtifacts(dir);

    const result = runAutoloop([
      '--mode',
      'cycle',
      '--max-iterations',
      '0',
      '--artifact-root',
      artifactRoot,
      '--casimir-path',
      path.join(dir, 'artifacts/casimir-verify.json'),
      '--state-path',
      statePath,
      '--history-path',
      path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl'),
      '--prompt-path',
      path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md'),
    ]);

    expect(result.ok).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.class).toBe('budget_exhausted');
    expect(state.stopReason).toBe('max_iterations_reached');
  });

  it('progresses stall counter over repeated cycle runs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-cycle-stall-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');
    const statePath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json');

    seedArtifacts(dir);

    runAutoloop(
      [
        '--mode',
        'cycle',
        '--stall-cycles',
        '1',
        '--artifact-root',
        artifactRoot,
        '--casimir-path',
        path.join(dir, 'artifacts/casimir-verify.json'),
        '--state-path',
        statePath,
        '--history-path',
        path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl'),
        '--prompt-path',
        path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md'),
      ],
      { runCycle: () => undefined },
    );

    runAutoloop(
      [
        '--mode',
        'cycle',
        '--stall-cycles',
        '1',
        '--artifact-root',
        artifactRoot,
        '--casimir-path',
        path.join(dir, 'artifacts/casimir-verify.json'),
        '--state-path',
        statePath,
        '--history-path',
        path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl'),
        '--prompt-path',
        path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md'),
      ],
      { runCycle: () => undefined },
    );

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.class).toBe('stalled');
    expect(state.stopReason).toBe('stall_cycles_reached');
    expect(state.stallCounter).toBeGreaterThanOrEqual(1);
  });

  it('does not mutate repository canonical report when using temp paths', () => {
    const repoReportPath = path.join(process.cwd(), 'docs/audits/research/warp-full-solve-campaign-execution-report-2026-02-24.md');
    const before = fs.existsSync(repoReportPath) ? fs.readFileSync(repoReportPath, 'utf8') : null;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-cycle-report-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');
    seedArtifacts(dir);

    runAutoloop(
      [
        '--mode',
        'cycle',
        '--artifact-root',
        artifactRoot,
        '--casimir-path',
        path.join(dir, 'artifacts/casimir-verify.json'),
        '--state-path',
        path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json'),
        '--history-path',
        path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl'),
        '--prompt-path',
        path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md'),
      ],
      { runCycle: () => undefined },
    );

    const after = fs.existsSync(repoReportPath) ? fs.readFileSync(repoReportPath, 'utf8') : null;
    expect(after).toBe(before);
  });

  it('accepts UTF-16LE JSON casimir artifact without crashing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-utf16-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');
    const statePath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json');
    const casimirPath = path.join(dir, 'artifacts/casimir-verify.json');

    seedArtifacts(dir);
    fs.mkdirSync(path.dirname(casimirPath), { recursive: true });
    fs.writeFileSync(casimirPath, JSON.stringify({ verdict: 'PASS', integrityOk: true }, null, 2), 'utf16le');

    const result = runAutoloop([
      '--mode',
      'status',
      '--artifact-root',
      artifactRoot,
      '--casimir-path',
      casimirPath,
      '--state-path',
      statePath,
      '--history-path',
      path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl'),
      '--prompt-path',
      path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md'),
    ]);

    expect(result.ok).toBe(true);
    expect(result.class).toBe('margin_limited');
  });

  it('marks promotion delta missing when promotion bundle artifact is unavailable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-autoloop-promo-missing-'));
    const artifactRoot = path.join(dir, 'artifacts', 'research', 'full-solve');
    const statePath = path.join(dir, 'artifacts/research/full-solve/g4-autoloop-state.json');

    seedArtifacts(dir, 'margin_limited', false);

    runAutoloop([
      '--mode',
      'analyze',
      '--artifact-root',
      artifactRoot,
      '--casimir-path',
      path.join(dir, 'artifacts/casimir-verify.json'),
      '--state-path',
      statePath,
      '--history-path',
      path.join(dir, 'artifacts/research/full-solve/g4-autoloop-history.jsonl'),
      '--prompt-path',
      path.join(dir, 'docs/audits/research/warp-g4-autoloop-next-prompt.md'),
    ]);

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.promotionDelta.class).toBe('missing');
    expect(state.promotionDelta.reason).toBe('promotion_bundle_missing');
  });
});
