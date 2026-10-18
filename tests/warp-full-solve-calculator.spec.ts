import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runWarpFullSolveCalculator } from '../scripts/warp-full-solve-calculator';

const BOUNDARY_STATEMENT =
  'This campaign defines falsifiable reduced-order full-solve gates and reproducible evidence requirements; it is not a physical warp feasibility claim.';
const SOLUTION_CATEGORY = 'Needle Hull Mark 2';
const PROFILE_VERSION = 'NHM2-2026-03-01';

describe('warp-full-solve-calculator', () => {
  it('writes a deterministic promoted-profile calculator artifact by default', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-calculator-default-'));
    const outPath = path.join(tmpRoot, 'calculator.json');

    const result = await runWarpFullSolveCalculator({
      outPath,
      getCommitHash: () => 'deadbeef',
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(outPath)).toBe(true);
    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8')) as Record<string, any>;
    expect(payload.boundaryStatement).toBe(BOUNDARY_STATEMENT);
    expect(payload.profile.base).toBe('promoted');
    expect(payload.profile.solutionCategory).toBe(SOLUTION_CATEGORY);
    expect(payload.profile.profileVersion).toBe(PROFILE_VERSION);
    expect(payload.provenance.commitHash).toBe('deadbeef');
    expect(typeof payload.result.lhs_Jm3).toBe('number');
    expect(typeof payload.result.boundComputed_Jm3).toBe('number');
    expect(Array.isArray(payload.result.reasonCode)).toBe(true);
    expect(typeof payload.result.congruentSolvePass).toBe('boolean');
  });

  it('applies input overrides and records input provenance', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warp-calculator-override-'));
    const outPath = path.join(tmpRoot, 'calculator.json');
    const inputPath = path.join(tmpRoot, 'input.json');
    fs.writeFileSync(
      inputPath,
      JSON.stringify(
        {
          label: 'override-profile',
          params: {
            warpFieldType: 'natario',
            gammaGeo: 2,
          },
          qi: {
            sampler: 'gaussian',
            tau_s_ms: 5,
          },
        },
        null,
        2,
      ),
    );

    const result = await runWarpFullSolveCalculator({
      inputPath,
      outPath,
      getCommitHash: () => 'cafebabe',
    });

    expect(result.ok).toBe(true);
    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8')) as Record<string, any>;
    expect(payload.label).toBe('override-profile');
    expect(payload.input.inputPath).toBe(inputPath);
    expect(payload.profile.solutionCategory).toBe(SOLUTION_CATEGORY);
    expect(payload.profile.profileVersion).toBe(PROFILE_VERSION);
    expect(payload.input.overrides.params.warpFieldType).toBe('natario');
    expect(payload.input.overrides.qi.sampler).toBe('gaussian');
    expect(payload.provenance.commitHash).toBe('cafebabe');
    expect(['candidate_pass_found', 'margin_limited', 'applicability_limited', 'evidence_path_blocked']).toContain(
      payload.result.decisionClass,
    );
  });
});
