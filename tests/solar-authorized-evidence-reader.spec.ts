import { describe,expect,it,vi } from 'vitest';
import { HELIX_DEVELOPER_ACCOUNT_POLICY,HELIX_USER_ACCOUNT_POLICY } from '../shared/helix-account-session';
import type { HelixAgentApiPrincipal } from '../server/services/helix-agent-api/types';
import { readAuthorizedSolarEvidence,SOLAR_RESEARCH_READ_SCOPE } from '../server/services/solar-research/authorized-evidence-reader';
import { existsSync } from 'node:fs';
import { loadLocalPrimaryObservation } from '../server/services/solar-research/primary-observation';
import { prepareSolarResearchExport } from '../shared/solar-research-export';
const query={recordId:`solar-primary:${'a'.repeat(64)}`};
function principal():HelixAgentApiPrincipal {
  return {tenantId:'tenant-a',issuer:'test',subjectId:'subject-a',accountProfileId:'profile-a',
    accountType:'developer',scopes:new Set([SOLAR_RESEARCH_READ_SCOPE]),tokenExpiresAt:null,
    accountContext:{session_id:null,profile_id:'profile-a',trusted_account_session:false,
      account_session:null,account_policy:HELIX_DEVELOPER_ACCOUNT_POLICY}};
}
describe('solar research scoped owner boundary',()=>{
  it('requires the exact scope before storage access',async()=>{
    const actor=principal();actor.scopes=new Set();const store={read:vi.fn()};
    await expect(readAuthorizedSolarEvidence(actor,store,query)).rejects.toThrow();expect(store.read).not.toHaveBeenCalled();
  });
  it('rejects public or attenuated account policy before storage access',async()=>{
    const actor=principal();actor.accountContext.account_policy=HELIX_USER_ACCOUNT_POLICY;
    const store={read:vi.fn()};await expect(readAuthorizedSolarEvidence(actor,store,query)).rejects.toThrow('POLICY_BLOCKED');
    expect(store.read).not.toHaveBeenCalled();
  });
  it('rejects forged body authority and unbounded queries',async()=>{
    const store={read:vi.fn()};
    await expect(readAuthorizedSolarEvidence(principal(),store,{...query,tenantId:'other'})).rejects.toThrow();
    await expect(readAuthorizedSolarEvidence(principal(),store,{...query,limit:21})).rejects.toThrow();
    expect(store.read).not.toHaveBeenCalled();
  });
  it('checks retained ownership before decoding a record',async()=>{
    const store={read:vi.fn().mockResolvedValue({owner:{tenantId:'other',accountProfileId:'profile-a'},bundle:null})};
    // Do not disclose whether a different profile owns this record.
    await expect(readAuthorizedSolarEvidence(principal(),store,query)).rejects.toThrow(
      'The requested solar comparison is not available in the authenticated profile.');
    expect(store.read).toHaveBeenCalledWith({tenantId:'tenant-a',accountProfileId:'profile-a'},query.recordId);
  });
  it.skipIf(!existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt') ||
      !existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF'))
    ('reads source-bound evidence through scoped admission without promoting claims',async()=>{
      const actor=principal();
      const bundle=await prepareSolarResearchExport(await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z'));
      const store={read:vi.fn().mockResolvedValue({owner:{tenantId:actor.tenantId,accountProfileId:actor.accountProfileId},bundle})};
      const view=await readAuthorizedSolarEvidence(actor,store,{recordId:bundle.recordId,limit:10});
      expect(view.rows).toHaveLength(10);expect(view.totalRows).toBe(37);
      expect(view.recordId).toBe(bundle.recordId);expect(view.assistant_answer).toBe(false);
      expect(view.admissionAllowed).toBe(false);expect(view.sourceIdentityAuthenticated).toBe(false);
    });
});
