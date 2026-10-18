import {syntheticSolarPortablePackage} from './fixtures/solar-portable-package';
import {webcrypto} from 'node:crypto';
import {beforeAll,afterEach,it,expect,vi} from 'vitest';
import {newDb} from 'pg-mem';
import type {Pool} from 'pg';
import {migration026} from '../server/db/migrations/026_helix_accounts';
import {migration074} from '../server/db/migrations/074_mcp_evidence_observations';
import {HelixMcpEvidenceObservationStore} from '../server/services/mcp-evidence/observation-store';
import {HelixMcpEvidenceReentryLedger} from '../server/services/mcp-evidence/reentry-lifecycle';
import {produceSolarPackageCatalogObservation} from '../server/services/solar-research/package-catalog-observation';
import {SolarResearchProfilePackageReader} from '../server/services/solar-research/profile-package-reader';
import {prepareSolarPackageStorage,SOLAR_PACKAGE_STORAGE_PREFIX} from '../server/services/solar-research/package-storage-codec';
import {requireSolarResearchRetrievalPolicy} from '../server/services/solar-research/retrieval-policy';
import {HELIX_DEVELOPER_ACCOUNT_POLICY,HELIX_USER_ACCOUNT_POLICY} from '../shared/helix-account-session';
import {SOLAR_RESEARCH_READ_SCOPE} from '../shared/solar-research-mcp';
import type {HelixAgentApiPrincipal} from '../server/services/helix-agent-api/types';
let text:string;
beforeAll(async()=>{vi.stubGlobal('crypto',webcrypto);text=await syntheticSolarPortablePackage(true);});
const owner={tenantId:'catalog-tenant',accountProfileId:'catalog-profile'},now=new Date('2026-09-27T00:00:00Z');
function actor():HelixAgentApiPrincipal {return {...owner,issuer:'test',subjectId:'test',accountType:'developer',scopes:new Set([SOLAR_RESEARCH_READ_SCOPE]),tokenExpiresAt:null,
  accountContext:{session_id:null,profile_id:owner.accountProfileId,trusted_account_session:false,account_session:null,account_policy:HELIX_DEVELOPER_ACCOUNT_POLICY}};}
afterEach(()=>vi.unstubAllGlobals());
async function source(){vi.stubGlobal('crypto',webcrypto);const prepared=await prepareSolarPackageStorage(owner,text);
  const base=SOLAR_PACKAGE_STORAGE_PREFIX+prepared.packageId+':';
  const entries=[{storage_key:base+'manifest',value:prepared.manifestJson},...prepared.chunks.map(c=>({storage_key:base+'chunk:'+c.ordinal,value:c.value}))]
    .map(e=>({...e,storage_backend:'localStorage' as const,size_bytes:Buffer.byteLength(e.value),updated_at:now.toISOString(),artifact_ids:[prepared.packageId]}));
  return new SolarResearchProfilePackageReader(async()=>({schema:'helix.profile_storage_snapshot.v1',profile_id:owner.accountProfileId,
    storage_backend:'profile_server',entries,artifacts:[],total_entry_bytes:entries.reduce((n,e)=>n+e.size_bytes,0),quota_bytes:5242880,updated_at:null,raw_profile_content_included:true}));
}
it('preserves synthetic owner catalog parity, persists it, reacquires after restart and requires reentry',async()=>{
  const reader=await source(),principal=actor(),direct=await reader.list(owner,0,10);
  const pg=newDb({autoCreateForeignKeyIndices:true}).adapters.createPg(),pool=new pg.Pool() as unknown as Pool;
  try{
    const client=await pool.connect();try{await migration026.run(client,{enablePgvector:false});await migration074.run(client,{enablePgvector:false});}finally{client.release();}
    await pool.query("INSERT INTO helix_accounts(profile_id,display_name,account_type,provider) VALUES ('catalog-profile','Catalog','developer','local')");
    const store=new HelixMcpEvidenceObservationStore({pool,now:()=>now});
    const result=await produceSolarPackageCatalogObservation(principal,reader,store,{},()=>now);
    const {mcp_evidence,...payload}=result;expect(payload).toEqual(direct);expect(mcp_evidence.payload).toEqual(direct);
    expect(payload.packages[0].comparisonRows).toBe(1);expect(payload.packages[0].archiveId).toBeTruthy();expect(mcp_evidence.support_refs).toContain(payload.packages[0].archiveId);
    expect(mcp_evidence.authority.terminal_eligible).toBe(false);expect(mcp_evidence.freshness.state).toBe('not_applicable');
    expect(JSON.stringify(result)).not.toContain('map_b64');expect(JSON.stringify(result)).not.toContain('packageJson');
    expect(await new HelixMcpEvidenceObservationStore({pool,now:()=>now}).get({owner,observationRef:mcp_evidence.observation_ref})).toEqual(mcp_evidence);
    await expect(store.get({owner:{...owner,tenantId:'other'},observationRef:mcp_evidence.observation_ref})).rejects.toMatchObject({code:'observation_owner_mismatch'});
    const ledger=new HelixMcpEvidenceReentryLedger();ledger.publish(mcp_evidence,now.toISOString());
    expect(()=>ledger.select({observationRef:mcp_evidence.observation_ref,forReasoning:true})).toThrow();
    ledger.reenter({observationRef:mcp_evidence.observation_ref,turnId:'catalog-test',reenteredAt:now.toISOString()});
    expect(ledger.select({observationRef:mcp_evidence.observation_ref,forReasoning:true}).selected_for_reasoning).toBe(true);
    requireSolarResearchRetrievalPolicy(principal,mcp_evidence,true);
    const nested={...mcp_evidence,capability_id:'helix.evidence.retrieve',payload:{observation:mcp_evidence}};
    for(const mode of ['scope','policy','surface']){const changed=actor();if(mode==='scope')changed.scopes.clear();if(mode==='policy')changed.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;
      expect(()=>requireSolarResearchRetrievalPolicy(changed,nested,mode!=='surface')).toThrow();}
  }finally{await pool.end();}
});
it('rejects forged/bounded queries before source access and fails closed on wrong source owner',async()=>{
  const principal=actor(),readCatalog=vi.fn(),read=vi.fn(),put=vi.fn();
  for(const input of [{limit:21},{offset:100},{tenantId:'other'}])
    await expect(produceSolarPackageCatalogObservation(principal,{read,readCatalog},{put},input)).rejects.toThrow();
  principal.scopes.clear();await expect(produceSolarPackageCatalogObservation(principal,{read,readCatalog},{put},{})).rejects.toThrow();
  expect(readCatalog).not.toHaveBeenCalled();expect(put).not.toHaveBeenCalled();
  readCatalog.mockResolvedValue({owner:{...owner,tenantId:'wrong'},catalog:{}});
  await expect(produceSolarPackageCatalogObservation(actor(),{read,readCatalog},{put},{})).rejects.toThrow('OWNER_MISMATCH');
  expect(put).not.toHaveBeenCalled();
});
it.each(['scope','policy','owner'])('rejects %s change during durable storage',async mode=>{
  const reader=await source(),principal=actor(),put=vi.fn(async()=>{
    if(mode==='scope')principal.scopes.clear();if(mode==='policy')principal.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;if(mode==='owner')principal.tenantId='other';});
  await expect(produceSolarPackageCatalogObservation(principal,reader,{put},{},()=>now)).rejects.toThrow();expect(put).toHaveBeenCalledOnce();
});
it('rejects page substitution and storage failure without a success envelope',async()=>{
  const reader=await source(),catalog=await reader.list(owner),put=vi.fn();
  await expect(produceSolarPackageCatalogObservation(actor(),{read:vi.fn(),readCatalog:async()=>({owner,catalog:{...catalog,offset:1}})},{put},{})).rejects.toThrow('PAGE_INVALID');
  expect(put).not.toHaveBeenCalled();put.mockRejectedValue(new Error('durable storage failed'));
  await expect(produceSolarPackageCatalogObservation(actor(),reader,{put},{})).rejects.toThrow('durable storage failed');
});
it('handles an empty owner catalog without inventing evidence refs',async()=>{
  const reader=await source(),empty=await reader.list({...owner,tenantId:'different'}),put=vi.fn();
  const result=await produceSolarPackageCatalogObservation(actor(),{read:vi.fn(),readCatalog:async()=>({owner,catalog:empty})},{put},{});
  expect(result.totalPackages).toBe(0);expect(result.packages).toEqual([]);expect(result.mcp_evidence.support_refs).toEqual([]);
  expect(result.mcp_evidence.authority.terminal_eligible).toBe(false);expect(put).toHaveBeenCalledOnce();
});
