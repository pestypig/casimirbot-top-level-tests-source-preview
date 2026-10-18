import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {HELIX_DEVELOPER_ACCOUNT_POLICY} from '../shared/helix-account-session';
import type {HelixAgentApiPrincipal} from '../server/services/helix-agent-api/types';
import {readAuthorizedSolarEvidence,SOLAR_RESEARCH_READ_SCOPE} from '../server/services/solar-research/authorized-evidence-reader';
import {verifySolarResearchEvidencePackage} from '../shared/solar-research-evidence-package';

const packagePath=process.env.SOLAR_PACKAGE_REPLAY_FIXTURE ?? '.tmp/solar-evidence-package-g7mHIT/portable-evidence.json';
const owner={tenantId:'test-replay-tenant',accountProfileId:'test-replay-profile'};
function actor():HelixAgentApiPrincipal {
  return {...owner,issuer:'test',subjectId:'test-replay',accountType:'developer',scopes:new Set([SOLAR_RESEARCH_READ_SCOPE]),tokenExpiresAt:null,
    accountContext:{session_id:null,profile_id:owner.accountProfileId,trusted_account_session:false,
      account_session:null,account_policy:HELIX_DEVELOPER_ACCOUNT_POLICY}};
}
describe.skipIf(!existsSync(packagePath))('exact browser/disk record through scoped MCP handler',()=>{
  it('reassembles bounded slices without changing any numerical field or identity',async()=>{
    const replay=await verifySolarResearchEvidencePackage(readFileSync(packagePath,'utf8'));
    const recordId=replay.manifest.comparison.recordId;
    const store={read:async()=>({owner,bundle:replay.comparison})};
    const first=await readAuthorizedSolarEvidence(actor(),store,{recordId,offset:0,limit:20});
    const second=await readAuthorizedSolarEvidence(actor(),store,{recordId,offset:first.nextOffset,limit:20});
    expect([...first.rows,...second.rows]).toEqual(replay.record.rows);
    expect(first.nextOffset).toBe(20);expect(second.nextOffset).toBeNull();
    for(const view of [first,second]) {
      expect(view.recordId).toBe(recordId);
      expect(view.operatorSha256).toBe(replay.record.operatorSha256);
      expect(view.observation).toEqual(replay.record.observation);
      expect(view.kernels).toEqual(replay.record.kernels);
      expect(view).toMatchObject({totalRows:37,fixtureOnly:false,modelDifference:null,
        acquisitionTime:null,terminal_eligible:false,admissionAllowed:false,sourceIdentityAuthenticated:false});
    }
  });
  it('rejects a changed retained bundle even if the requested record identity is unchanged',async()=>{
    const input=JSON.parse(readFileSync(packagePath,'utf8'));
    input.comparison.tableCsv+='altered';
    const store={read:async()=>({owner,bundle:input.comparison})};
    await expect(readAuthorizedSolarEvidence(actor(),store,{recordId:input.comparison.recordId})).rejects.toThrow('integrity');
  });
});
