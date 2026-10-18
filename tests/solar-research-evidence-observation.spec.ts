import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { HELIX_DEVELOPER_ACCOUNT_POLICY, HELIX_USER_ACCOUNT_POLICY } from '../shared/helix-account-session';
import type { HelixAgentApiPrincipal } from '../server/services/helix-agent-api/types';
import { migration026 } from '../server/db/migrations/026_helix_accounts';
import { migration074 } from '../server/db/migrations/074_mcp_evidence_observations';
import { HelixMcpEvidenceObservationStore } from '../server/services/mcp-evidence/observation-store';
import { HelixMcpEvidenceReentryLedger } from '../server/services/mcp-evidence/reentry-lifecycle';
import { helixMcpEvidenceSha256 } from '../server/services/mcp-evidence/observation';
import { HELIX_MCP_EVIDENCE_AUTHORITY } from '../shared/contracts/helix-mcp-evidence-capability.v1';
import { produceSolarResearchEvidenceObservation, SOLAR_RESEARCH_EVIDENCE_DESCRIPTOR } from '../server/services/solar-research/evidence-observation';
import { readAuthorizedSolarEvidence, SOLAR_RESEARCH_READ_SCOPE } from '../server/services/solar-research/authorized-evidence-reader';
import { loadLocalPrimaryObservation } from '../server/services/solar-research/primary-observation';
import { prepareSolarResearchExport } from '../shared/solar-research-export';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const NOW=new Date('2026-09-26T21:00:00Z');
const owner={tenantId:'tenant-a',accountProfileId:'profile-a'};
const pools:Pool[]=[];afterEach(async()=>{await Promise.all(pools.splice(0).map(pool=>pool.end()));});
function principal():HelixAgentApiPrincipal {
  return {...owner,issuer:'test',subjectId:'subject-a',accountType:'developer',scopes:new Set([SOLAR_RESEARCH_READ_SCOPE]),tokenExpiresAt:null,
    accountContext:{session_id:null,profile_id:'profile-a',trusted_account_session:false,account_session:null,account_policy:HELIX_DEVELOPER_ACCOUNT_POLICY}};
}
async function database() {
  const pg=newDb({autoCreateForeignKeyIndices:true}).adapters.createPg();const pool=new pg.Pool() as unknown as Pool;pools.push(pool);
  const client=await pool.connect();try {
    await migration026.run(client,{enablePgvector:false});await migration074.run(client,{enablePgvector:false});
  } finally {client.release();}
  await pool.query("INSERT INTO helix_accounts(profile_id,display_name,account_type,provider) VALUES ('profile-a','A','developer','local');");
  return {pool,observations:new HelixMcpEvidenceObservationStore({pool,now:()=>NOW})};
}
async function fixture() {
  const source=(id:string)=>({id,sha256:'a'.repeat(64),kind:'fixture',provenance:'declared_source_identity'});
  return prepareSolarResearchExport({schemaVersion:'solar-primary-comparison-record/1',createdAt:NOW.toISOString(),
    operator:'g1-bison13-sound-speed-primary-operator/1',operatorSha256:'b'.repeat(64),observation:source('solution'),kernels:source('kernels'),
    modelDifference:null,fixtureOnly:true,quantity:'delta_c_squared_over_bp04_c_squared',units:'dimensionless',referenceRadiusM:695980000,
    coordinate:'r_over_historical_bp04_radius',fullKernelSupport:[0.006695899,1.001225],
    uncertainty:'quoted_solution_error_only_no_covariance_or_systematics',residualConvention:'observed_minus_primary_term',
    crossTermIncluded:false,referenceProfileBound:false,admissionAllowed:false,scienceRunAllowed:false,
    rows:[{authorRow:1,secondQuartileRadius:0.1,observed:0.02,quotedSolutionError:0.001,primaryPrediction:null,residual:null}]});
}
const recordsFor=(bundle:unknown)=>({read:vi.fn().mockResolvedValue({owner,bundle})});
describe('solar read normalization into shared durable MCP evidence',()=>{
  it('preserves direct-handler payload, content identity and historical uncertainty limits',async()=>{
    const bundle=await fixture();const records=recordsFor(bundle);const {pool,observations}=await database();const actor=principal();
    const query={recordId:bundle.recordId};const direct=await readAuthorizedSolarEvidence(actor,records,query);
    const result=await produceSolarResearchEvidenceObservation(actor,records,observations,query,()=>NOW);
    const {mcp_evidence,...payload}=result;expect(payload).toEqual(direct);expect(mcp_evidence.payload).toEqual(direct);
    expect(mcp_evidence.authority).toEqual(HELIX_MCP_EVIDENCE_AUTHORITY);
    expect(mcp_evidence.support_refs).toContain(bundle.recordId);
    expect(mcp_evidence.freshness).toEqual({state:'not_applicable',age_ms:null,expires_at:null});
    expect(mcp_evidence.payload.acquisitionTime).toBeNull();expect(mcp_evidence.payload.sourceIdentityAuthenticated).toBe(false);
    expect(mcp_evidence.provenance.payload_sha256).toBe(helixMcpEvidenceSha256(mcp_evidence.payload));
    const restarted=new HelixMcpEvidenceObservationStore({pool,now:()=>NOW});
    expect(await restarted.get({owner,observationRef:mcp_evidence.observation_ref})).toEqual(mcp_evidence);
    const ledger=new HelixMcpEvidenceReentryLedger();ledger.publish(mcp_evidence,NOW.toISOString());
    expect(()=>ledger.select({observationRef:mcp_evidence.observation_ref,forReasoning:true})).toThrow();
    ledger.reenter({observationRef:mcp_evidence.observation_ref,turnId:'test-turn',reenteredAt:NOW.toISOString()});
    expect(ledger.select({observationRef:mcp_evidence.observation_ref,forReasoning:true})).toMatchObject({selected_for_reasoning:true});
    expect(mcp_evidence.authority.terminal_eligible).toBe(false);
  });
  it('assigns distinct read occurrences while keeping stable archive identity and normalized request fingerprint',async()=>{
    const bundle=await fixture();const records=recordsFor(bundle);const {observations}=await database();const actor=principal();
    const a=await produceSolarResearchEvidenceObservation(actor,records,observations,{recordId:bundle.recordId},()=>NOW);
    const b=await produceSolarResearchEvidenceObservation(actor,records,observations,{recordId:bundle.recordId,offset:0,limit:10},()=>NOW);
    expect(a.recordId).toBe(b.recordId);expect(a.mcp_evidence.observation_ref).not.toBe(b.mcp_evidence.observation_ref);
    expect(a.mcp_evidence.request_fingerprint).toBe(b.mcp_evidence.request_fingerprint);
    expect(a.mcp_evidence.request_fingerprint).toBe(helixMcpEvidenceSha256({recordId:bundle.recordId,offset:0,limit:10}));
    await expect(observations.get({owner:{...owner,tenantId:'other'},observationRef:a.mcp_evidence.observation_ref})).rejects.toMatchObject({code:'observation_owner_mismatch'});
  });
  it('fails closed if durable persistence fails',async()=>{
    const bundle=await fixture();const observations={put:vi.fn().mockRejectedValue(new Error('database unavailable'))};
    await expect(produceSolarResearchEvidenceObservation(principal(),recordsFor(bundle),observations,{recordId:bundle.recordId},()=>NOW)).rejects.toThrow('database unavailable');
    expect(observations.put).toHaveBeenCalledOnce();
  });
  it.each(['missing_scope','public_policy','oversized_slice','forged_owner'])('rejects %s before reading or publishing',async failure=>{
    const bundle=await fixture();const actor=principal();const records=recordsFor(bundle);const observations={put:vi.fn()};
    let query:unknown={recordId:bundle.recordId};
    if(failure==='missing_scope') actor.scopes=new Set();
    if(failure==='public_policy') actor.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;
    if(failure==='oversized_slice') query={recordId:bundle.recordId,limit:21};
    if(failure==='forged_owner') query={recordId:bundle.recordId,tenantId:'other'};
    await expect(produceSolarResearchEvidenceObservation(actor,records,observations,query,()=>NOW)).rejects.toThrow();
    expect(records.read).not.toHaveBeenCalled();expect(observations.put).not.toHaveBeenCalled();
  });
  it('does not move ownership if a trusted principal object changes during an asynchronous read',async()=>{
    const bundle=await fixture();const actor=principal();const observations={put:vi.fn()};
    const records={read:async()=>{actor.tenantId='other';return {owner,bundle};}};
    await expect(produceSolarResearchEvidenceObservation(actor,records,observations,{recordId:bundle.recordId},()=>NOW)).rejects.toThrow('OWNER_MISMATCH');
    expect(observations.put).not.toHaveBeenCalled();
  });
  it.each(['scope','policy'])('rechecks changed %s before persistence',async changed=>{
    const bundle=await fixture();const actor=principal();const observations={put:vi.fn()};
    const records={read:async()=>{
      if(changed==='scope') actor.scopes=new Set();
      else actor.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;
      return {owner,bundle};
    }};
    await expect(produceSolarResearchEvidenceObservation(actor,records,observations,{recordId:bundle.recordId},()=>NOW)).rejects.toThrow();
    expect(observations.put).not.toHaveBeenCalled();
  });
  it.each(['scope','policy','tenant','profile'])('does not return durable evidence after %s changes during persistence',async changed=>{
    const bundle=await fixture();const actor=principal();
    const observations={put:vi.fn(async()=>{
      if(changed==='scope')actor.scopes.clear();
      if(changed==='policy')actor.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;
      if(changed==='tenant')actor.tenantId='other';
      if(changed==='profile')actor.accountProfileId='other';
    })};
    await expect(produceSolarResearchEvidenceObservation(actor,recordsFor(bundle),observations,
      {recordId:bundle.recordId},()=>NOW)).rejects.toThrow(changed==='tenant'||changed==='profile'?'PRINCIPAL_CHANGED':
        changed==='policy'?'POLICY_BLOCKED':'required');
    expect(observations.put).toHaveBeenCalledOnce();
    expect(observations.put).toHaveBeenCalledWith(expect.objectContaining({owner}));
  });
  const present=existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt') && existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
  it.skipIf(!present)('retains real author-data rows with the original content ID and a separately timed read occurrence',async()=>{
    const bundle=await prepareSolarResearchExport(await loadLocalPrimaryObservation(process.cwd(),'2026-09-25T20:00:00Z'));
    const {observations}=await database();const result=await produceSolarResearchEvidenceObservation(principal(),recordsFor(bundle),observations,
      {recordId:bundle.recordId,offset:30,limit:20},()=>NOW);
    expect(result.rows).toHaveLength(7);expect(result.totalRows).toBe(37);expect(result.fixtureOnly).toBe(false);
    expect(result.mcp_evidence.observed_at).toBe(NOW.toISOString());expect(result.recordCreatedAt).toBe('2026-09-25T20:00:00Z');
    expect(result.mcp_evidence.request_fingerprint).toBe(helixMcpEvidenceSha256({recordId:bundle.recordId,offset:30,limit:20}));
    expect(await observations.get({owner,observationRef:result.mcp_evidence.observation_ref})).toEqual(result.mcp_evidence);
  });
  it('keeps the proposed descriptor read-only and explicitly unprivileged',()=>{
    expect(SOLAR_RESEARCH_EVIDENCE_DESCRIPTOR.effect_class).toBe('read_only');
    expect(SOLAR_RESEARCH_EVIDENCE_DESCRIPTOR.admission_profiles[0].account_scope).toBe('developer');
    expect(SOLAR_RESEARCH_EVIDENCE_DESCRIPTOR.reentry_required).toBe(true);
  });
});
