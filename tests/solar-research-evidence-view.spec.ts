import { describe,expect,it } from 'vitest';
import { existsSync } from 'node:fs';
import { prepareSolarResearchExport } from '../shared/solar-research-export';
import { readSolarResearchEvidenceSlice } from '../shared/solar-research-evidence-view';
import { loadLocalPrimaryObservation } from '../server/services/solar-research/primary-observation';
const present=existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt')&&
  existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
describe('bounded research evidence normalization',()=>{
  it('rejects unbounded and path-bearing arguments before reading evidence',async()=>{
    await expect(readSolarResearchEvidenceSlice(null,{limit:21})).rejects.toThrow();
    await expect(readSolarResearchEvidenceSlice(null,{path:'../secret'})).rejects.toThrow();
  });
  it.skipIf(!present)('preserves identity and missing requirements across pages',async()=>{
    const record=await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z');
    const bundle=await prepareSolarResearchExport(record);
    const first=await readSolarResearchEvidenceSlice(bundle,{limit:20});
    const last=await readSolarResearchEvidenceSlice(bundle,{offset:first.nextOffset,limit:20});
    expect(first.recordId).toBe(bundle.recordId);expect(last.recordId).toBe(first.recordId);
    expect(first.rows).toHaveLength(20);expect(last.rows).toHaveLength(17);expect(last.nextOffset).toBeNull();
    expect(first.assistant_answer).toBe(false);expect(first.terminal_eligible).toBe(false);
    expect(first.missingRequirements).toContain('supported model/reference difference');
    expect(first.fullKernelSupport).toEqual(record.fullKernelSupport);
    expect(first.crossTermIncluded).toBe(false);expect(first.referenceProfileBound).toBe(false);
    expect(first.recordCreatedAt).toBe(record.createdAt);expect(first.acquisitionTime).toBeNull();
    expect(first.acquisitionTimeStatus).toBe('not_bound_by_this_record');
    await expect(readSolarResearchEvidenceSlice(bundle,{recordId:`solar-primary:${'0'.repeat(64)}`}))
      .rejects.toThrow('identity mismatch');
    expect((await readSolarResearchEvidenceSlice(bundle,{recordId:bundle.recordId})).recordId).toBe(bundle.recordId);
    await expect(readSolarResearchEvidenceSlice(bundle,{offset:37})).rejects.toThrow('outside record');
    await expect(readSolarResearchEvidenceSlice({...bundle,tableCsv:'wrong'})).rejects.toThrow();
  });
});
