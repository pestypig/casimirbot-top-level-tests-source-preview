import {existsSync,readFileSync} from 'node:fs';
import {syntheticSolarPortablePackage} from './fixtures/solar-portable-package';
import {createHash,webcrypto} from 'node:crypto';
import {beforeAll,afterEach,it,expect,vi} from 'vitest';
import {readSolarPackageEvidenceView} from '../shared/solar-package-evidence-view';
import {prepareSolarResearchEvidencePackage} from '../shared/solar-research-evidence-package';
import {createSolarEventImageSelection} from '../shared/solar-event-image-selection';
import {createSolarGoesFrameWindow} from '../shared/solar-goes-frame-window';
import {readAuthorizedSolarPackage} from '../server/services/solar-research/authorized-package-reader';
import {HELIX_DEVELOPER_ACCOUNT_POLICY,HELIX_USER_ACCOUNT_POLICY} from '../shared/helix-account-session';
import {SOLAR_RESEARCH_READ_SCOPE} from '../shared/solar-research-mcp';
import type {HelixAgentApiPrincipal} from '../server/services/helix-agent-api/types';
const realPackagePath=process.env.SOLAR_PACKAGE_REPLAY_FIXTURE ?? '.tmp/solar-evidence-package-g7mHIT/portable-evidence.json';
let packageJson:string,packageId:string;
beforeAll(async()=>{vi.stubGlobal('crypto',webcrypto);packageJson=await syntheticSolarPortablePackage(true);packageId='solar-package:'+createHash('sha256').update(packageJson).digest('hex');});
function principal():HelixAgentApiPrincipal {return {tenantId:'view-tenant',accountProfileId:'view-profile',issuer:'test',subjectId:'test',
  accountType:'developer',scopes:new Set([SOLAR_RESEARCH_READ_SCOPE]),tokenExpiresAt:null,
  accountContext:{session_id:null,profile_id:'view-profile',trusted_account_session:false,account_session:null,account_policy:HELIX_DEVELOPER_ACCOUNT_POLICY}};}
afterEach(()=>vi.unstubAllGlobals());
it.skipIf(!existsSync(realPackagePath))('preserves exact real archive/paper/index identities and bounded numerical rows without pixels',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const packageJson=readFileSync(realPackagePath,'utf8');
  const packageId='solar-package:'+createHash('sha256').update(packageJson).digest('hex');
  const payload=JSON.parse(packageJson);
  const view=await readSolarPackageEvidenceView(packageJson,{packageId,rowLimit:2,frameLimit:1});
  expect(view.indexId).toBe(payload.index.indexId);expect(view.comparison.recordId).toBe(payload.comparison.recordId);
  expect(view.comparison.rows).toHaveLength(2);expect(view.comparison.nextOffset).toBe(2);
  expect(view.archive?.snapshotId).toBe(payload.observationArchive.archive_identity.snapshotId);
  expect(view.archive?.frames[0].normalization?.fitsExptimeSecondsDeclared).toBe(2.000037);
  expect(view.literature?.associationId).toBe(payload.literature.associationId);expect(view.benchmark).toBeNull();
  expect(view).toMatchObject({pixelsIncluded:false,quantitativeJoinAllowed:false,correlationScore:null,reentry_required:true,scientificAdmission:false});
  expect(JSON.stringify(view)).not.toContain('map_b64');expect(JSON.stringify(view)).not.toContain('packageJson');
  expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(128000);
});
it('preserves synthetic archive/index identity and negative claims without retained inputs or pixels',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const payload=JSON.parse(packageJson);
  const view=await readSolarPackageEvidenceView(packageJson,{packageId,rowLimit:1,frameLimit:1});
  expect(view.indexId).toBe(payload.index.indexId);
  expect(view.archive?.snapshotId).toBe(payload.observationArchive.archive_identity.snapshotId);
  expect(view.comparison.rows).toHaveLength(1);
  expect(view.comparison.nextOffset).toBeNull();
  expect(view.literature).toBeNull();
  expect(view).toMatchObject({pixelsIncluded:false,quantitativeJoinAllowed:false,correlationScore:null,reentry_required:true,scientificAdmission:false});
  expect(JSON.stringify(view)).not.toContain('map_b64');
  expect(JSON.stringify(view)).not.toContain('packageJson');
});
it('exposes only the selected event/frame assertion through the bounded package view',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const original=JSON.parse(packageJson);
  const archive=structuredClone(original.observationArchive);
  delete archive.archive_identity;
  const acquired=archive.frames[0].obstime as string;
  archive.selected_event_context=createSolarEventImageSelection({id:'ivo://hek/FL-example',event_type:'FL',
    start_time:acquired,frm_name:'catalog reporter'},0,archive.frames.length);
  archive.selected_goes_window=createSolarGoesFrameWindow({frames:archive.frames,selectedFrameIndex:0,
    bins:[{start:'2026-09-26T23:55:00Z',end:'2026-09-27T00:00:00Z',mean_long:1e-7}]});
  const prepared=await prepareSolarResearchEvidencePackage(original.comparison,archive);
  const selectedPackageId='solar-package:'+createHash('sha256').update(prepared.packageJson).digest('hex');
  const view=await readSolarPackageEvidenceView(prepared.packageJson,{packageId:selectedPackageId,rowLimit:1,frameLimit:1});
  expect(view.archive?.eventSelection).toMatchObject({eventId:'ivo://hek/FL-example',
    selectedFrameIndex:0,imageAcquiredAt:acquired,imageOffsetFromEventStartSeconds:0,
    relationship:'contextual_co_occurrence_only',sourceIdentityAuthenticated:false,scientificAdmission:false});
  expect(view.quantitativeJoinAllowed).toBe(false);
  expect(view.archive?.graphSelection).toMatchObject({selectedFrameIndex:0,frameAcquiredAt:acquired,
    relationship:'temporal_context_only',bins:[{meanLongWm2:1e-7}],sourceFilesAuthenticated:false,
    scientificAdmission:false});
  expect(JSON.stringify(view)).not.toContain('map_b64');
  expect(JSON.parse(prepared.packageJson).index.manifestJson).toContain('selectedEventContext');
  const actor=principal();
  const store={read:vi.fn(async(owner:any)=>({owner,packageId:selectedPackageId,packageJson:prepared.packageJson}))};
  const viaOwner=await readAuthorizedSolarPackage(actor,store,{packageId:selectedPackageId,rowLimit:1,frameLimit:1});
  expect(viaOwner.archive?.eventSelection?.eventId).toBe('ivo://hek/FL-example');
  expect(viaOwner.archive?.graphSelection?.bins).toHaveLength(1);
  expect(store.read).toHaveBeenCalledTimes(1);
});
it('rejects oversized/forged queries and identity substitutions',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  for(const query of [{packageId,rowLimit:21},{packageId,frameLimit:21},{packageId,tenantId:'other'},
    {packageId,frameOffset:1},{packageId:'solar-package:'+'0'.repeat(64)}])
    await expect(readSolarPackageEvidenceView(packageJson,query)).rejects.toThrow();
});
it('checks scope/policy before reading and owner before decoding package content',async()=>{
  const actor=principal(),store={read:vi.fn()};actor.scopes.clear();
  await expect(readAuthorizedSolarPackage(actor,store,{packageId})).rejects.toThrow();expect(store.read).not.toHaveBeenCalled();
  const publicActor=principal();publicActor.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;
  await expect(readAuthorizedSolarPackage(publicActor,store,{packageId})).rejects.toThrow('POLICY_BLOCKED');expect(store.read).not.toHaveBeenCalled();
  store.read.mockResolvedValue({owner:{tenantId:'other',accountProfileId:'view-profile'},packageId,packageJson:'invalid'});
  await expect(readAuthorizedSolarPackage(principal(),store,{packageId})).rejects.toThrow('OWNER_MISMATCH');
});
it('rechecks scope after asynchronous storage access and does not return revoked evidence',async()=>{
  vi.stubGlobal('crypto',webcrypto);const actor=principal();
  const store={read:vi.fn(async(owner:any)=>{actor.scopes.clear();return {owner,packageId,packageJson};})};
  await expect(readAuthorizedSolarPackage(actor,store,{packageId})).rejects.toThrow();
});
it('returns the bounded view through a verified owner without a separate storage or reasoning loop',async()=>{
  vi.stubGlobal('crypto',webcrypto);const actor=principal();
  const store={read:vi.fn(async(owner:any)=>({owner,packageId,packageJson}))};
  expect((await readAuthorizedSolarPackage(actor,store,{packageId,rowLimit:1})).comparison.rows).toHaveLength(1);
  expect(store.read).toHaveBeenCalledTimes(1);
});
