import {describe,it,expect,vi,afterEach} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {loadLocalPrimaryObservation} from '../server/services/solar-research/primary-observation';
import {prepareSolarResearchExport} from '../shared/solar-research-export';
import {prepareSolarResearchLiterature} from '../shared/solar-research-literature';
import {prepareSolarBenchmarkSelection} from '../shared/solar-research-benchmark';
import {prepareSolarResearchEvidenceIndex,verifySolarResearchEvidenceIndex} from '../shared/solar-research-evidence-index';
import {prepareSolarResearchEvidencePackage,verifySolarResearchEvidencePackage,SOLAR_EVIDENCE_PACKAGE_MAX_BYTES} from '../shared/solar-research-evidence-package';

const archivePath='.tmp/solar-live-evidence-yJ7Mk1/verified-replay.json';
const present=existsSync(archivePath)&&existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt')&&
  existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
afterEach(()=>vi.unstubAllGlobals());
async function inputs() {
  vi.stubGlobal('crypto',webcrypto);
  const record=await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z');
  const bundle=await prepareSolarResearchExport(record);
  return {bundle,archive:JSON.parse(readFileSync(archivePath,'utf8')),literature:await prepareSolarResearchLiterature(bundle)};
}
describe.skipIf(!present)('real archive and author record evidence index',()=>{
  it('replays a portable package without the original session and rejects nested tampering',async()=>{
    const {bundle,archive,literature}=await inputs();
    const prepared=await prepareSolarResearchEvidencePackage(bundle,archive,{literature});
    const reopened=await verifySolarResearchEvidencePackage(prepared.packageJson);
    expect(reopened).toMatchObject({indexId:prepared.indexId,artifactIntegrityVerified:true,
      quantitativeJoinAllowed:false,scientificAdmission:false,originalFitsIncluded:false});
    expect(reopened.comparison).toEqual(bundle);
    expect((reopened.observationArchive as any).archive_identity.snapshotId).toBe(archive.archive_identity.snapshotId);
    expect(await prepareSolarResearchEvidencePackage(bundle,archive,{literature})).toEqual(prepared);
    const changed=JSON.parse(prepared.packageJson);changed.comparison.tableCsv+='tampered';
    await expect(verifySolarResearchEvidencePackage(JSON.stringify(changed))).rejects.toThrow();
    const extra=JSON.parse(prepared.packageJson);extra.scientificAdmission=true;
    await expect(verifySolarResearchEvidencePackage(JSON.stringify(extra))).rejects.toThrow();
    await expect(verifySolarResearchEvidencePackage(' '.repeat(SOLAR_EVIDENCE_PACKAGE_MAX_BYTES+1))).rejects.toThrow('9 MB');
    const minimal=await prepareSolarResearchEvidencePackage(bundle);
    expect(await verifySolarResearchEvidencePackage(minimal.packageJson)).toMatchObject({observationArchive:null,literature:null,benchmark:null});
    const incomplete=JSON.parse(minimal.packageJson);delete incomplete.literature;
    await expect(verifySolarResearchEvidencePackage(JSON.stringify(incomplete))).rejects.toThrow('explicit replay inputs');
  });
  it('preserves exact identities while rejecting any physical-comparison inference',async()=>{
    const {bundle,archive,literature}=await inputs();
    const output=await prepareSolarResearchEvidenceIndex(bundle,archive,{literature});
    const manifest=JSON.parse(output.manifestJson);
    expect(manifest.comparison.recordId).toBe(bundle.recordId);
    expect(manifest.observationArchive.snapshotId).toBe(archive.archive_identity.snapshotId);
    expect(manifest.literatureContextId).toBe(literature!.associationId);
    expect(manifest.comparison.acquisitionTime).toBeNull();
    expect(manifest.observationArchive.frames[0].acquiredAt).toBe('2026-09-26T22:27:04.842Z');
    expect(manifest).toMatchObject({quantitativeJoinAllowed:false,correlationScore:null,residualScore:null,scientificAdmission:false});
    expect(await prepareSolarResearchEvidenceIndex(bundle,archive,{literature})).toEqual(output);
    expect(await verifySolarResearchEvidenceIndex(bundle,archive,{literature},output)).toMatchObject({artifactIntegrityVerified:true,quantitativeJoinAllowed:false});
    expect(output.manifestJson).not.toContain('map_b64');
  });
  it('represents absent optional inputs explicitly, not as implied matches',async()=>{
    const {bundle}=await inputs();const output=await prepareSolarResearchEvidenceIndex(bundle);
    expect(JSON.parse(output.manifestJson)).toMatchObject({observationArchive:null,literatureContextId:null,benchmarkPlanId:null});
  });
  it('binds a verified declared benchmark without inventing validation performance',async()=>{
    const {bundle,archive}=await inputs();const record=JSON.parse(bundle.recordJson);
    const benchmark=await prepareSolarBenchmarkSelection(bundle,{schemaVersion:'solar-benchmark-selection/1',recordId:bundle.recordId,
      question:'Local evidence association test, not a registered study',frozenAt:'2026-09-26T23:00:00Z',informationCutoff:'2026-09-26T20:00:00Z',
      observationAvailableAt:'2026-09-26T19:00:00Z',kernelsAvailableAt:'2026-09-26T19:00:00Z',modelAvailableAt:null,
      calibrationRows:[],evaluationRows:record.rows.map((row:any)=>row.authorRow),excludedRows:[],
      availabilityProvenance:'operator_declared_not_authenticated',freezeAuthority:'content_identity_only_not_authenticated_preregistration'});
    const output=await prepareSolarResearchEvidenceIndex(bundle,archive,{benchmark});
    expect(JSON.parse(output.manifestJson)).toMatchObject({benchmarkPlanId:benchmark.planId,independentValidation:false,correlationScore:null});
    await expect(prepareSolarResearchEvidenceIndex(bundle,archive,{benchmark:{...benchmark,performanceScore:1}})).rejects.toThrow();
  });
  it('rejects changed source archives, sidecars and index claim promotion',async()=>{
    const {bundle,archive,literature}=await inputs();const output=await prepareSolarResearchEvidenceIndex(bundle,archive,{literature});
    const changed=structuredClone(archive);changed.frames[0].obstime='2026-09-26T22:28:00Z';
    await expect(verifySolarResearchEvidenceIndex(bundle,changed,{literature},output)).rejects.toThrow('archive identity');
    await expect(prepareSolarResearchEvidenceIndex(bundle,archive,{literature:{...literature,bibtex:'different'}})).rejects.toThrow('literature');
    await expect(verifySolarResearchEvidenceIndex(bundle,archive,{literature},{...output,
      manifestJson:output.manifestJson.replace('"quantitativeJoinAllowed": false','"quantitativeJoinAllowed": true')})).rejects.toThrow('index identity');
  });
});
