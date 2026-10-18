import {describe,it,expect,vi,afterEach} from 'vitest';
import {existsSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {loadLocalPrimaryObservation} from '../server/services/solar-research/primary-observation';
import {prepareSolarResearchExport} from '../shared/solar-research-export';
import {prepareSolarResearchLiterature,verifySolarResearchLiterature} from '../shared/solar-research-literature';

const present=existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt') &&
  existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
afterEach(()=>vi.unstubAllGlobals());
async function input() {
  vi.stubGlobal('crypto',webcrypto);
  const record=await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z');
  return {record,bundle:await prepareSolarResearchExport(record)};
}
describe.skipIf(!present)('bound paper context without scientific promotion',()=>{
  it('prepares deterministic context without changing the existing comparison',async()=>{
    const {record,bundle}=await input();const before=JSON.stringify(bundle);
    const context=(await prepareSolarResearchLiterature(bundle))!;
    expect(await prepareSolarResearchLiterature(bundle)).toEqual(context);
    expect(JSON.stringify(bundle)).toBe(before);
    expect(await prepareSolarResearchExport(record)).toEqual(bundle);
    expect(await verifySolarResearchLiterature(bundle,context)).toMatchObject({recordId:bundle.recordId,scientificAdmission:false});
    expect(JSON.parse(context.manifestJson)).toMatchObject({recordId:bundle.recordId,
      sourceIdentityAuthenticated:false,redistributionPermissionGranted:false,
      relation:'published_method_and_row_alignment_context'});
    expect(context.bibtex).toContain('10.1088/0004-637X/699/2/1403');
  });
  it('does not map unrelated source hashes or fixtures to this paper',async()=>{
    const {record}=await input();
    const other=await prepareSolarResearchExport({...record,observation:{...record.observation,sha256:'a'.repeat(64)}});
    expect(await prepareSolarResearchLiterature(other)).toBeUndefined();
    const fixture=await prepareSolarResearchExport({...record,fixtureOnly:true,observation:{...record.observation,kind:'fixture'}});
    expect(await prepareSolarResearchLiterature(fixture)).toBeUndefined();
  });
  it('rejects citation, manifest, scientific-claim and identity tampering',async()=>{
    const {bundle}=await input();const context=(await prepareSolarResearchLiterature(bundle))!;
    for(const value of [
      {...context,bibtex:context.bibtex+'altered'},
      {...context,associationId:'solar-literature:'+'a'.repeat(64)},
      {...context,manifestJson:context.manifestJson.replace('"scientificAdmission": false','"scientificAdmission": true')},
    ])await expect(verifySolarResearchLiterature(bundle,value)).rejects.toThrow('identity or recipe');
  });
  it('refuses applying a citation sidecar to a different comparison or invalid bundle',async()=>{
    const {record,bundle}=await input();const context=await prepareSolarResearchLiterature(bundle);
    const changed=await prepareSolarResearchExport({...record,createdAt:'2026-09-26T21:00:00Z'});
    await expect(verifySolarResearchLiterature(changed,context)).rejects.toThrow('identity or recipe');
    await expect(prepareSolarResearchLiterature({...bundle,tableCsv:bundle.tableCsv+'altered'})).rejects.toThrow('integrity');
  });
});
