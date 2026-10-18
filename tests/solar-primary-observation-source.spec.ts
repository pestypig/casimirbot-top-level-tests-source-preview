import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeBoundPrimaryObservation, loadLocalPrimaryObservation } from '../server/services/solar-research/primary-observation';

const intake=path.resolve('artifacts/research/g1-basu-author-intake-20260924');
const present=['cdif.txt','avker.BP04_B4752dRF'].every(file=>existsSync(path.join(intake,file)));
describe('source-bound primary observation intake',()=>{
  it('rejects arbitrary and oversized bytes rather than inventing observations',()=>{
    expect(()=>decodeBoundPrimaryObservation(Buffer.from('fixture'),Buffer.from('fixture'),Buffer.from('operator'),
      '2026-09-26T20:00:00Z')).toThrow('HASH_MISMATCH');
    expect(()=>decodeBoundPrimaryObservation(Buffer.alloc(10_001),Buffer.alloc(0),Buffer.alloc(0),
      '2026-09-26T20:00:00Z')).toThrow('SIZE_LIMIT');
  });
  it.skipIf(!present)('loads 37 real observation rows without model predictions',async()=>{
    const record=await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z');
    expect(record.rows).toHaveLength(37);expect(record.rows[0].authorRow).toBe(1);
    expect(record.rows.at(-1)?.authorRow).toBe(73);
    expect(record.rows[0].observed).toBe(0.00199792);
    expect(record.rows.every(row=>row.primaryPrediction===null && row.residual===null)).toBe(true);
    expect(record.modelDifference).toBeNull();expect(record.fixtureOnly).toBe(false);
    expect(record.admissionAllowed).toBe(false);
  });
  it.skipIf(!present)('rejects tampered author bytes',async()=>{
    const [solution,kernels]=await Promise.all(['cdif.txt','avker.BP04_B4752dRF'].map(file=>readFile(path.join(intake,file))));
    solution[0]^=1;
    expect(()=>decodeBoundPrimaryObservation(solution,kernels,Buffer.from('operator'),'2026-09-26T20:00:00Z'))
      .toThrow('HASH_MISMATCH');
  });
});
