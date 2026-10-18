import {describe,it,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {loadLocalPrimaryObservation} from '../server/services/solar-research/primary-observation';
import {prepareSolarResearchExport} from '../shared/solar-research-export';
import {prepareSolarBenchmarkSelection,verifySolarBenchmarkReplay} from '../shared/solar-research-benchmark';
const present=existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt')&&existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
async function inputs() {
  const record=await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z');
  const bundle=await prepareSolarResearchExport(record);
  const plan={schemaVersion:'solar-benchmark-selection/1',recordId:bundle.recordId,question:'Replay a declared selection; not a model-validation result.',
    frozenAt:'2026-09-26T21:00:00Z',informationCutoff:'2026-09-26T20:00:00Z',observationAvailableAt:'2026-09-26T19:00:00Z',
    kernelsAvailableAt:'2026-09-26T19:00:00Z',modelAvailableAt:null,calibrationRows:record.rows.slice(0,10).map(row=>row.authorRow),
    evaluationRows:record.rows.slice(10).map(row=>row.authorRow),excludedRows:[],availabilityProvenance:'operator_declared_not_authenticated',
    freezeAuthority:'content_identity_only_not_authenticated_preregistration'};
  return {bundle,plan};
}
describe.skipIf(!present)('benchmark selection on real retained rows',()=>{
  it('produces deterministic identity/table without inventing model scores or independent validation',async()=>{
    const {bundle,plan}=await inputs();const output=await prepareSolarBenchmarkSelection(bundle,plan);
    expect(await prepareSolarBenchmarkSelection(bundle,plan)).toEqual(output);
    expect(output.tableCsv.trim().split('\n')).toHaveLength(38);
    expect(output).toMatchObject({recordId:bundle.recordId,fixtureOnly:false,performanceScore:null,independentValidation:false});
    expect((await verifySolarBenchmarkReplay(bundle,output)).artifactIntegrityVerified).toBe(true);
    await expect(verifySolarBenchmarkReplay(bundle,{...output,tableCsv:output.tableCsv+'tampered'})).rejects.toThrow();
    await expect(verifySolarBenchmarkReplay(bundle,{...output,scientificAdmission:true})).rejects.toThrow();
  });
  it.each(['overlap','missing','unknown','future','identity','model'])('rejects %s',async kind=>{
    const {bundle,plan}=await inputs();
    if(kind==='overlap')plan.evaluationRows.push(plan.calibrationRows[0]);
    if(kind==='missing')plan.evaluationRows.pop();
    if(kind==='unknown')plan.evaluationRows.push(76);
    if(kind==='future')plan.observationAvailableAt='2026-09-26T20:30:00Z';
    if(kind==='identity')plan.recordId=`solar-primary:${'a'.repeat(64)}`;
    if(kind==='model')Object.assign(plan,{modelAvailableAt:'2026-09-26T19:00:00Z'});
    await expect(prepareSolarBenchmarkSelection(bundle,plan)).rejects.toThrow();
  });
});
