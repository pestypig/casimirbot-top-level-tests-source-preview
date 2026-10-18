import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateG4FirstDivergence } from '../scripts/warp-g4-first-divergence';

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const makeRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'g4-first-divergence-'));

const canonicalBase = {
  wave: 'A',
  rhoSource: 'warp.metric.T00.natario.shift',
  metricT00Ref: 'warp.metric.T00.natario.shift',
  metricT00Si_Jm3: -1.87466334759679e17,
  lhs_Jm3: -7.498650107089216e16,
  boundComputed_Jm3: -24,
  K: 3.8e-30,
  tau_s: 0.005,
  boundUsed_Jm3: -7.498650107089216e16,
  boundFloorApplied: true,
  boundPolicyFloor_Jm3: -7.498650107089216e16,
  boundFloor_Jm3: -7.498650107089216e16,
  marginRatioRawComputed: 3124437544620506.5,
  marginRatioRaw: 1,
  applicabilityStatus: 'PASS',
  reasonCode: ['G4_QI_MARGIN_EXCEEDED'],
};

const recoveryCaseBase = {
  id: 'case_0001',
  rhoSource: 'warp.metric.T00.natario.shift',
  metricT00Ref: 'warp.metric.T00.natario.shift',
  metricT00Si_Jm3: -1.87466334759679e17,
  lhs_Jm3: -7.498650107089216e16,
  boundComputed_Jm3: -24,
  K: 3.8e-30,
  tau_s: 0.005,
  boundUsed_Jm3: -7.498650107089216e16,
  boundFloorApplied: true,
  boundPolicyFloor_Jm3: -7.498650107089216e16,
  boundFloor_Jm3: -7.498650107089216e16,
  marginRatioRawComputed: 3124437544620506.5,
  marginRatioRaw: 1,
  applicabilityStatus: 'PASS',
  reasonCode: ['G4_QI_MARGIN_EXCEEDED'],
};

describe('warp-g4-first-divergence', () => {
  it('detects first divergence at source stage', () => {
    const root = makeRoot();
    const canonicalPath = path.join(root, 'A', 'qi-forensics.json');
    const recoveryPath = path.join(root, 'g4-recovery-search-2026-02-27.json');
    const outJson = path.join(root, 'out.json');
    const outMd = path.join(root, 'out.md');

    writeJson(canonicalPath, canonicalBase);
    writeJson(recoveryPath, {
      cases: [
        {
          ...recoveryCaseBase,
          rhoSource: 'warp.metric.T00.natario_sdf.shift',
          metricT00Ref: 'warp.metric.T00.natario_sdf.shift',
        },
      ],
    });

    const result = generateG4FirstDivergence({
      canonicalPath,
      recoveryPath,
      outJsonPath: outJson,
      outMdPath: outMd,
      recoveryCaseId: 'case_0001',
      getCommitHash: () => 'deadbeef',
    });

    expect(result.ok).toBe(true);
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.firstDivergence.stageId).toBe('S0_source');
    expect(payload.firstDivergence.differingFields).toContain('rhoSource');
  });

  it('detects first divergence at bound policy stage when upstream stages match', () => {
    const root = makeRoot();
    const canonicalPath = path.join(root, 'A', 'qi-forensics.json');
    const recoveryPath = path.join(root, 'g4-recovery-search-2026-02-27.json');
    const outJson = path.join(root, 'out.json');

    writeJson(canonicalPath, canonicalBase);
    writeJson(recoveryPath, {
      cases: [
        {
          ...recoveryCaseBase,
          boundUsed_Jm3: -24,
          boundFloorApplied: false,
          boundPolicyFloor_Jm3: -24,
          boundFloor_Jm3: -18,
          marginRatioRawComputed: 1,
          marginRatioRaw: 1,
        },
      ],
    });

    const result = generateG4FirstDivergence({
      canonicalPath,
      recoveryPath,
      outJsonPath: outJson,
      outMdPath: path.join(root, 'out.md'),
      recoveryCaseId: 'case_0001',
      getCommitHash: () => 'deadbeef',
    });

    expect(result.ok).toBe(true);
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.firstDivergence.stageId).toBe('S3_bound_policy');
  });

  it('uses same-rho-source selector and reports no divergence when paths are equal', () => {
    const root = makeRoot();
    const canonicalPath = path.join(root, 'A', 'qi-forensics.json');
    const recoveryPath = path.join(root, 'g4-recovery-search-2026-02-27.json');
    const outJson = path.join(root, 'out.json');

    writeJson(canonicalPath, canonicalBase);
    writeJson(recoveryPath, {
      cases: [
        {
          ...recoveryCaseBase,
          id: 'case_mismatch',
          rhoSource: 'warp.metric.T00.natario_sdf.shift',
          metricT00Ref: 'warp.metric.T00.natario_sdf.shift',
        },
        {
          ...recoveryCaseBase,
          id: 'case_match',
        },
      ],
      bestCandidate: { id: 'case_mismatch' },
    });

    const result = generateG4FirstDivergence({
      canonicalPath,
      recoveryPath,
      selector: 'same-rho-source',
      outJsonPath: outJson,
      outMdPath: path.join(root, 'out.md'),
      getCommitHash: () => 'deadbeef',
    });

    expect(result.ok).toBe(true);
    const payload = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    expect(payload.recovery.caseId).toBe('case_match');
    expect(payload.recovery.selectionReason).toBe('same_rho_source');
    expect(payload.firstDivergence).toBeNull();
  });
});
