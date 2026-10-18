import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRecoveryParity } from '../scripts/warp-g4-recovery-parity';

describe('warp g4 recovery parity', () => {
  it('is deterministic for fixed input and emits stable mismatch reasons', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-parity-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outA = path.join(tmpDir, 'parity-a.json');
    const outB = path.join(tmpDir, 'parity-b.json');

    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          topComparableCandidates: [
            {
              id: 'case_0001',
              params: {
                warpFieldType: 'natario',
                gammaGeo: 1,
                dutyCycle: 0.02,
                dutyShip: 0.02,
                dutyEffective_FR: 0.02,
                sectorCount: 80,
                concurrentSectors: 1,
                gammaVanDenBroeck: 0.8,
                sampler: 'gaussian',
                fieldType: 'em',
                qCavity: 1e5,
                qSpoilingFactor: 1,
                tau_s_ms: 5,
                gap_nm: 0.4,
                bubbleRadius_m: 2,
              },
              applicabilityStatus: 'PASS',
              marginRatioRaw: 1.2,
              marginRatioRawComputed: 1.2,
              lhs_Jm3: -10,
              boundComputed_Jm3: -8,
              boundUsed_Jm3: -8,
              boundFloorApplied: true,
              rhoSource: 'warp.metric.T00.natario.shift',
              quantitySemanticType: 'ren_expectation_timelike_energy_density',
              quantityWorldlineClass: 'timelike',
              quantitySemanticComparable: true,
              quantitySemanticReason: 'semantic_parity_qei_timelike_ren',
              reasonCode: [],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const a = await runRecoveryParity({ topN: 1, recoveryPath, outPath: outA });
    const b = await runRecoveryParity({ topN: 1, recoveryPath, outPath: outB });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const payloadA = JSON.parse(fs.readFileSync(outA, 'utf8'));
    const payloadB = JSON.parse(fs.readFileSync(outB, 'utf8'));
    payloadA.generatedAt = 'fixed';
    payloadB.generatedAt = 'fixed';

    expect(payloadA).toEqual(payloadB);
    expect(payloadA.selectionPolicy).toBe('comparable_canonical');
    expect(['match', 'mismatch']).toContain(payloadA.candidates[0].parityStatus);
    expect(typeof payloadA.candidates[0].mismatchReason).toBe('string');
    expect(payloadA.boundaryStatement).toBe(
      'This campaign defines falsifiable reduced-order full-solve gates and reproducible evidence requirements; it is not a physical warp feasibility claim.',
    );
  });

  it('preserves canonical PASS applicability for comparable pass candidates', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-parity-pass-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outPath = path.join(tmpDir, 'parity.json');

    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          topComparableCandidates: [
            {
              id: 'case_pass',
              params: {
                warpFieldType: 'natario_sdf',
                gammaGeo: 1,
                dutyCycle: 0.12,
                dutyShip: 0.12,
                dutyEffective_FR: 0.12,
                sectorCount: 80,
                concurrentSectors: 2,
                gammaVanDenBroeck: 500,
                sampler: 'hann',
                fieldType: 'em',
                qCavity: 1e5,
                qSpoilingFactor: 3,
                tau_s_ms: 0.02,
                gap_nm: 8,
                bubbleRadius_m: 2,
              },
              applicabilityStatus: 'PASS',
              marginRatioRaw: 0.12890679702998561,
              marginRatioRawComputed: 0.12890679702998561,
              lhs_Jm3: -3.0937631287227165,
              boundComputed_Jm3: -24.00000000002375,
              boundUsed_Jm3: -24.00000000002375,
              boundFloorApplied: false,
              rhoSource: 'warp.metric.T00.natario_sdf.shift',
              quantitySemanticType: 'ren_expectation_timelike_energy_density',
              quantityWorldlineClass: 'timelike',
              quantitySemanticComparable: true,
              quantitySemanticReason: 'semantic_parity_qei_timelike_ren',
              reasonCode: [],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = await runRecoveryParity({ topN: 1, recoveryPath, outPath });
    expect(result.ok).toBe(true);
    expect(result.selectionPolicy).toBe('comparable_canonical');
    expect(result.anyCanonicalPassCandidate).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(payload.candidates[0].parity.applicabilityStatus).toBe('PASS');
    expect(payload.candidates[0].parity.marginRatioRaw).toBeLessThan(1);
  });

  it('fails closed with empty selection when no canonical or structural comparable candidates exist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-parity-fallback-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outPath = path.join(tmpDir, 'parity.json');

    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          cases: [
            {
              id: 'case_b',
              params: { sampler: 'gaussian', tau_s_ms: 5 },
              applicabilityStatus: 'FAIL',
              marginRatioRawComputed: 2,
              marginRatioRaw: 3,
            },
            {
              id: 'case_a',
              params: { sampler: 'gaussian', tau_s_ms: 5 },
              applicabilityStatus: 'FAIL',
              marginRatioRawComputed: 1,
              marginRatioRaw: 3,
            },
            {
              id: 'case_c',
              params: { sampler: 'gaussian', tau_s_ms: 5 },
              applicabilityStatus: 'UNKNOWN',
              marginRatioRawComputed: 1,
              marginRatioRaw: 3,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = await runRecoveryParity({ topN: 2, recoveryPath, outPath });
    expect(result.ok).toBe(true);
    expect(result.selectionPolicy).toBe('fallback_no_canonical_structural_comparable');
    expect((result as any).blockedReason).toBe('no_canonical_structural_comparable_candidates');

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(payload.selectionPolicy).toBe('fallback_no_canonical_structural_comparable');
    expect(payload.blockedReason).toBe('no_canonical_structural_comparable_candidates');
    expect(payload.candidateCountChecked).toBe(0);
    expect(payload.candidates).toEqual([]);
  });



  it('emits stable comparability bucket accounting from recovery cases', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-parity-buckets-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outPath = path.join(tmpDir, 'parity.json');

    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          cases: [
            {
              id: 'case_cmp',
              params: { sampler: 'gaussian', tau_s_ms: 5 },
              applicabilityStatus: 'FAIL',
              marginRatioRawComputed: 2,
              marginRatioRaw: 2,
              lhs_Jm3: -5,
              boundComputed_Jm3: -2,
              boundUsed_Jm3: -5,
              rhoSource: 'warp.metric.T00.natario.shift',
              quantitySemanticType: 'ren_expectation_timelike_energy_density',
              quantityWorldlineClass: 'timelike',
              quantitySemanticComparable: true,
              quantitySemanticReason: 'semantic_parity_qei_timelike_ren',
              reasonCode: [],
            },
            {
              id: 'case_missing',
              params: { sampler: 'gaussian', tau_s_ms: 5 },
              applicabilityStatus: 'FAIL',
              marginRatioRawComputed: null,
              marginRatioRaw: null,
              lhs_Jm3: null,
              boundComputed_Jm3: null,
              boundUsed_Jm3: null,
              rhoSource: 'warp.metric.T00.natario.shift',
              reasonCode: ['G4_QI_SIGNAL_MISSING'],
            },
            {
              id: 'case_contract',
              params: { sampler: 'gaussian', tau_s_ms: 5 },
              applicabilityStatus: 'FAIL',
              marginRatioRawComputed: 2,
              marginRatioRaw: 2,
              lhs_Jm3: -5,
              boundComputed_Jm3: -2,
              boundUsed_Jm3: -5,
              rhoSource: 'lab.synthetic',
              reasonCode: ['G4_QI_SOURCE_NOT_METRIC'],
            },
          ],
        },
        null,
        2,
      )}
`,
    );

    const result = await runRecoveryParity({ topN: 3, recoveryPath, outPath });
    expect(result.ok).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(payload.comparability.canonicalComparableCaseCount).toBe(1);
    expect(payload.comparability.nonComparableCaseCount).toBe(2);
    expect(payload.comparability.nonComparableBuckets).toEqual({
      non_comparable_missing_signals: 1,
      non_comparable_contract_mismatch: 1,
      non_comparable_other: 0,
    });
  });

  it('keeps UNKNOWN applicability structurally comparable when canonical signal fields are present', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-parity-unknown-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outPath = path.join(tmpDir, 'parity.json');

    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          cases: [
            {
              id: 'case_unknown',
              params: { sampler: 'gaussian', tau_s_ms: 5 },
              applicabilityStatus: 'UNKNOWN',
              marginRatioRawComputed: 2,
              marginRatioRaw: 2,
              lhs_Jm3: -5,
              boundComputed_Jm3: -2,
              boundUsed_Jm3: -5,
              rhoSource: 'warp.metric.T00.natario.shift',
              quantitySemanticType: 'ren_expectation_timelike_energy_density',
              quantityWorldlineClass: 'timelike',
              quantitySemanticComparable: true,
              quantitySemanticReason: 'semantic_parity_qei_timelike_ren',
              reasonCode: [],
            },
          ],
        },
        null,
        2,
      )}
`,
    );

    const result = await runRecoveryParity({ topN: 1, recoveryPath, outPath });
    expect(result.ok).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(payload.comparability.canonicalComparableCaseCount).toBe(1);
    expect(payload.comparability.canonicalStructuralComparableCaseCount).toBe(1);
    expect(payload.selectionPolicy).toBe('comparable_canonical');
    expect(payload.candidateCountChecked).toBe(1);
  });

  it('selects structural-semantic-gap candidates when canonical set is empty', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-parity-structural-'));
    const recoveryPath = path.join(tmpDir, 'recovery.json');
    const outPath = path.join(tmpDir, 'parity.json');

    fs.writeFileSync(
      recoveryPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          cases: [
            {
              id: 'case_struct',
              params: { sampler: 'gaussian', tau_s_ms: 5 },
              applicabilityStatus: 'UNKNOWN',
              marginRatioRawComputed: 2,
              marginRatioRaw: 2,
              lhs_Jm3: -5,
              boundComputed_Jm3: -2,
              boundUsed_Jm3: -5,
              rhoSource: 'warp.metric.T00.natario.shift',
              quantitySemanticType: 'classical_proxy_from_curvature',
              quantitySemanticTargetType: 'ren_expectation_timelike_energy_density',
              quantityWorldlineClass: 'timelike',
              quantitySemanticComparable: false,
              quantitySemanticBridgeReady: false,
              reasonCode: [],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = await runRecoveryParity({ topN: 1, recoveryPath, outPath });
    expect(result.ok).toBe(true);
    expect(result.selectionPolicy).toBe('comparable_structural_semantic_gap');
    expect((result as any).blockedReason).toBe(null);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(payload.comparability.canonicalComparableCaseCount).toBe(0);
    expect(payload.comparability.semanticGapCaseCount).toBe(1);
    expect(payload.comparability.canonicalStructuralComparableCaseCount).toBe(1);
    expect(payload.selectionPool.structuralSemanticGapCandidateCount).toBe(1);
    expect(payload.candidateCountChecked).toBe(1);
  });

  it('treats tiny relative numeric drift as a parity match for large magnitudes', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g4-parity-relative-'));
    const recoverySeedPath = path.join(tmpDir, 'recovery-seed.json');
    const recoveryDriftPath = path.join(tmpDir, 'recovery-drift.json');
    const outA = path.join(tmpDir, 'parity-seed.json');
    const outB = path.join(tmpDir, 'parity-drift.json');

    const params = {
      warpFieldType: 'natario',
      gammaGeo: 1,
      dutyCycle: 0.02,
      dutyShip: 0.02,
      dutyEffective_FR: 0.02,
      sectorCount: 80,
      concurrentSectors: 1,
      gammaVanDenBroeck: 0.8,
      sampler: 'gaussian',
      fieldType: 'em',
      qCavity: 1e5,
      qSpoilingFactor: 1,
      tau_s_ms: 5,
      gap_nm: 0.4,
      bubbleRadius_m: 2,
    };

    fs.writeFileSync(
      recoverySeedPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          topComparableCandidates: [
            {
              id: 'case_seed',
              params,
              applicabilityStatus: 'PASS',
              marginRatioRaw: 1,
              marginRatioRawComputed: 1,
              lhs_Jm3: -18,
              boundComputed_Jm3: -18,
              boundUsed_Jm3: -18,
              boundFloorApplied: false,
              rhoSource: 'warp.metric.T00.natario.shift',
              quantitySemanticType: 'ren_expectation_timelike_energy_density',
              quantityWorldlineClass: 'timelike',
              quantitySemanticComparable: true,
              quantitySemanticReason: 'semantic_parity_qei_timelike_ren',
              reasonCode: [],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    await runRecoveryParity({ topN: 1, recoveryPath: recoverySeedPath, outPath: outA });
    const seedPayload = JSON.parse(fs.readFileSync(outA, 'utf8'));
    const parity = seedPayload.candidates[0].parity;

    const drift = (value: number | null) => (typeof value === 'number' ? value * (1 + 5e-10) : value);

    fs.writeFileSync(
      recoveryDriftPath,
      `${JSON.stringify(
        {
          provenance: { commitHash: 'deadbeef' },
          topComparableCandidates: [
            {
              id: 'case_seed',
              params,
              applicabilityStatus: parity.applicabilityStatus,
              marginRatioRaw: drift(parity.marginRatioRaw),
              marginRatioRawComputed: drift(parity.marginRatioRawComputed),
              lhs_Jm3: drift(parity.lhs_Jm3),
              boundComputed_Jm3: drift(parity.boundComputed_Jm3),
              boundUsed_Jm3: drift(parity.boundUsed_Jm3),
              boundFloorApplied: parity.boundFloorApplied,
              rhoSource: 'warp.metric.T00.natario.shift',
              quantitySemanticType: 'ren_expectation_timelike_energy_density',
              quantityWorldlineClass: 'timelike',
              quantitySemanticComparable: true,
              quantitySemanticReason: 'semantic_parity_qei_timelike_ren',
              reasonCode: [],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    await runRecoveryParity({ topN: 1, recoveryPath: recoveryDriftPath, outPath: outB });
    const driftPayload = JSON.parse(fs.readFileSync(outB, 'utf8'));
    expect(driftPayload.candidates[0].parityStatus).toBe('match');
    expect(driftPayload.candidates[0].mismatchReason).toBe('none');
  });
});

