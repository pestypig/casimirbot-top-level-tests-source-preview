import {afterEach,describe,expect,it,vi} from 'vitest';
import {HELIX_DEVELOPER_ACCOUNT_POLICY,HELIX_USER_ACCOUNT_POLICY} from '../shared/helix-account-session';
import type {HelixAgentApiPrincipal} from '../server/services/helix-agent-api/types';
import {readSolarResearchEvidenceSlice} from '../shared/solar-research-evidence-view';
import {readAuthorizedSolarEvidence,SOLAR_RESEARCH_READ_SCOPE} from '../server/services/solar-research/authorized-evidence-reader';

vi.mock('../shared/solar-research-evidence-view',()=>({readSolarResearchEvidenceSlice:vi.fn()}));
const query={recordId:`solar-primary:${'a'.repeat(64)}`};
const view={assistant_answer:false,terminal_eligible:false,recordId:query.recordId};
function principal():HelixAgentApiPrincipal {
  return {tenantId:'tenant-a',issuer:'test',subjectId:'subject-a',accountProfileId:'profile-a',
    accountType:'developer',scopes:new Set([SOLAR_RESEARCH_READ_SCOPE]),tokenExpiresAt:null,
    accountContext:{session_id:null,profile_id:'profile-a',trusted_account_session:false,
      account_session:null,account_policy:HELIX_DEVELOPER_ACCOUNT_POLICY}};
}
const changes=[
  ['scope', (actor:HelixAgentApiPrincipal)=>actor.scopes.clear(), 'required'],
  ['policy', (actor:HelixAgentApiPrincipal)=>{actor.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;}, 'POLICY_BLOCKED'],
  ['tenant', (actor:HelixAgentApiPrincipal)=>{actor.tenantId='tenant-b';}, 'OWNER_MISMATCH'],
  ['profile', (actor:HelixAgentApiPrincipal)=>{actor.accountProfileId='profile-b';}, 'OWNER_MISMATCH'],
] as const;
afterEach(()=>vi.resetAllMocks());
describe('Solar record authority continuity across asynchronous reads',()=>{
  it.each(changes)('rejects a %s change during storage before decoding',async(_name,change,error)=>{
    const actor=principal();
    const store={read:vi.fn(async(owner)=>{change(actor);return {owner,bundle:{synthetic:true}};})};
    await expect(readAuthorizedSolarEvidence(actor,store,query)).rejects.toThrow(error);
    expect(readSolarResearchEvidenceSlice).not.toHaveBeenCalled();
    expect(store.read).toHaveBeenCalledWith({tenantId:'tenant-a',accountProfileId:'profile-a'},query.recordId);
  });
  it.each(changes)('rejects a %s change during normalization before returning evidence',async(_name,change,error)=>{
    const actor=principal();
    const store={read:vi.fn(async(owner)=>({owner,bundle:{synthetic:true}}))};
    vi.mocked(readSolarResearchEvidenceSlice).mockImplementation(async()=>{change(actor);return view as any;});
    await expect(readAuthorizedSolarEvidence(actor,store,query)).rejects.toThrow(error);
    expect(readSolarResearchEvidenceSlice).toHaveBeenCalledOnce();
  });
  it('returns normalized evidence when the admitted owner and authority remain unchanged',async()=>{
    const actor=principal();const bundle={synthetic:true};
    const store={read:vi.fn(async(owner)=>({owner,bundle}))};
    vi.mocked(readSolarResearchEvidenceSlice).mockResolvedValue(view as any);
    await expect(readAuthorizedSolarEvidence(actor,store,query)).resolves.toBe(view);
    expect(readSolarResearchEvidenceSlice).toHaveBeenCalledWith(bundle,{...query,offset:0,limit:10});
  });
});
