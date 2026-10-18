import {syntheticSolarPortablePackage} from './fixtures/solar-portable-package';
import {createHash,webcrypto} from 'node:crypto';
import {beforeAll,afterEach,it,expect,vi} from 'vitest';
import {newDb} from 'pg-mem';
import type {Pool} from 'pg';
import {migration026} from '../server/db/migrations/026_helix_accounts';
import {migration074} from '../server/db/migrations/074_mcp_evidence_observations';
import {HelixMcpEvidenceObservationStore} from '../server/services/mcp-evidence/observation-store';
import {HelixMcpEvidenceReentryLedger} from '../server/services/mcp-evidence/reentry-lifecycle';
import {produceSolarPackageEvidenceObservation} from '../server/services/solar-research/package-evidence-observation';
import {readAuthorizedSolarPackage} from '../server/services/solar-research/authorized-package-reader';
import {requireSolarResearchRetrievalPolicy} from '../server/services/solar-research/retrieval-policy';
import {HELIX_DEVELOPER_ACCOUNT_POLICY,HELIX_USER_ACCOUNT_POLICY} from '../shared/helix-account-session';
import {SOLAR_RESEARCH_READ_SCOPE} from '../shared/solar-research-mcp';
import type {HelixAgentApiPrincipal} from '../server/services/helix-agent-api/types';
let packageJson:string,packageId:string;
beforeAll(async()=>{vi.stubGlobal('crypto',webcrypto);packageJson=await syntheticSolarPortablePackage(true);packageId='solar-package:'+createHash('sha256').update(packageJson).digest('hex');});
const owner={tenantId:'package-tenant',accountProfileId:'package-profile'};
const now=new Date('2026-09-26T23:30:00Z');
const packages={read:async()=>({owner,packageId,packageJson})};
function principal():HelixAgentApiPrincipal {return {...owner,issuer:'test',subjectId:'test',accountType:'developer',
  scopes:new Set([SOLAR_RESEARCH_READ_SCOPE]),tokenExpiresAt:null,
  accountContext:{session_id:null,profile_id:owner.accountProfileId,trusted_account_session:false,account_session:null,account_policy:HELIX_DEVELOPER_ACCOUNT_POLICY}};}
afterEach(()=>vi.unstubAllGlobals());
it('persists synthetic package metadata before publication, reacquires it and requires reasoning reentry',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const pg=newDb({autoCreateForeignKeyIndices:true}).adapters.createPg();const pool=new pg.Pool() as unknown as Pool;
  try {
    const client=await pool.connect();try {await migration026.run(client,{enablePgvector:false});await migration074.run(client,{enablePgvector:false});}finally{client.release();}
    await pool.query("INSERT INTO helix_accounts(profile_id,display_name,account_type,provider) VALUES ('package-profile','Package','developer','local')");
    const store=new HelixMcpEvidenceObservationStore({pool,now:()=>now});const actor=principal();
    const direct=await readAuthorizedSolarPackage(actor,packages,{packageId,rowLimit:2});
    const result=await produceSolarPackageEvidenceObservation(actor,packages,store,{packageId,rowLimit:2},()=>now);
    expect(result.mcp_evidence.payload).toEqual(direct);
    expect(result.mcp_evidence.support_refs).toContain(direct.archive!.snapshotId);
    expect(result.mcp_evidence.freshness.state).toBe('not_applicable');
    expect(result.mcp_evidence.authority.terminal_eligible).toBe(false);
    const restarted=new HelixMcpEvidenceObservationStore({pool,now:()=>now});
    expect(await restarted.get({owner,observationRef:result.mcp_evidence.observation_ref})).toEqual(result.mcp_evidence);
    await expect(restarted.get({owner:{...owner,tenantId:'other'},observationRef:result.mcp_evidence.observation_ref})).rejects.toMatchObject({code:'observation_owner_mismatch'});
    const ledger=new HelixMcpEvidenceReentryLedger();ledger.publish(result.mcp_evidence,now.toISOString());
    expect(()=>ledger.select({observationRef:result.mcp_evidence.observation_ref,forReasoning:true})).toThrow();
    ledger.reenter({observationRef:result.mcp_evidence.observation_ref,turnId:'package-test',reenteredAt:now.toISOString()});
    expect(ledger.select({observationRef:result.mcp_evidence.observation_ref,forReasoning:true}).selected_for_reasoning).toBe(true);
    requireSolarResearchRetrievalPolicy(actor,result.mcp_evidence,true);
    const nested={...result.mcp_evidence,capability_id:'helix.evidence.retrieve',payload:{retained:result.mcp_evidence}};
    for(const failure of ['scope','policy','surface']) {
      const revoked=principal();if(failure==='scope')revoked.scopes.clear();
      if(failure==='policy')revoked.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;
      expect(()=>requireSolarResearchRetrievalPolicy(revoked,nested,failure!=='surface')).toThrow();
    }
    expect(()=>requireSolarResearchRetrievalPolicy(actor,{...result.mcp_evidence,capability_id:'helix.solar_research.unknown'},true)).toThrow();
  }finally{await pool.end();}
},30000);
it('does not publish if persistence fails and rejects missing scope before reading',async()=>{
  vi.stubGlobal('crypto',webcrypto);const put=vi.fn().mockRejectedValue(new Error('storage failed'));
  await expect(produceSolarPackageEvidenceObservation(principal(),packages,{put},{packageId},()=>now)).rejects.toThrow('storage failed');
  expect(put).toHaveBeenCalledOnce();const actor=principal();actor.scopes.clear();const read=vi.fn();put.mockClear();
  await expect(produceSolarPackageEvidenceObservation(actor,{read},{put},{packageId},()=>now)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();expect(put).not.toHaveBeenCalled();
});
it.each(['scope','policy','owner'])('does not return persisted evidence after %s changes during storage I/O',async change=>{
  vi.stubGlobal('crypto',webcrypto);const actor=principal();
  const put=vi.fn(async()=>{
    if(change==='scope')actor.scopes.clear();
    if(change==='policy')actor.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;
    if(change==='owner')actor.tenantId='different';
  });
  await expect(produceSolarPackageEvidenceObservation(actor,packages,{put},{packageId},()=>now)).rejects.toThrow();
  expect(put).toHaveBeenCalledOnce();
});
