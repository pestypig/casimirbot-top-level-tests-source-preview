import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { mkdtemp,rm,symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SolarResearchFileStore } from '../server/services/solar-research/record-store';
import { loadLocalPrimaryObservation } from '../server/services/solar-research/primary-observation';
import { prepareSolarResearchExport } from '../shared/solar-research-export';
import { readAuthorizedSolarEvidence,SOLAR_RESEARCH_READ_SCOPE } from '../server/services/solar-research/authorized-evidence-reader';
import { HELIX_DEVELOPER_ACCOUNT_POLICY } from '../shared/helix-account-session';
import type { HelixAgentApiPrincipal } from '../server/services/helix-agent-api/types';
let root:string;
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'solar-record-store-'));});
afterEach(async()=>{
  if(path.dirname(root)!==path.resolve(os.tmpdir()) || !path.basename(root).startsWith('solar-record-store-'))throw new Error('Unsafe cleanup');
  await rm(root,{recursive:true,force:true});
});
const present=existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt')&&existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
describe('profile-owned research records',()=>{
  it('rejects broad roots and path-like identities',async()=>{
    expect(()=>new SolarResearchFileStore('relative')).toThrow();
    expect(()=>new SolarResearchFileStore(os.homedir())).toThrow();
    await expect(new SolarResearchFileStore(root).read({tenantId:'a',accountProfileId:'b'},'../outside')).rejects.toThrow();
  });
  it.skipIf(!present)('retains an integrity-checked record without overwrites or cross-owner access',async()=>{
    const bundle=await prepareSolarResearchExport(await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z'));
    const owner={tenantId:'a',accountProfileId:'b'};const store=new SolarResearchFileStore(root);
    expect((await store.put(owner,bundle)).saved).toBe(true);
    expect((await store.read(owner,bundle.recordId))?.bundle).toEqual(bundle);
    const actor:HelixAgentApiPrincipal={tenantId:owner.tenantId,accountProfileId:owner.accountProfileId,
      issuer:'test',subjectId:'test-subject',accountType:'developer',scopes:new Set([SOLAR_RESEARCH_READ_SCOPE]),
      tokenExpiresAt:null,accountContext:{session_id:null,profile_id:owner.accountProfileId,
        trusted_account_session:false,account_session:null,account_policy:HELIX_DEVELOPER_ACCOUNT_POLICY}};
    const view=await readAuthorizedSolarEvidence(actor,store,{recordId:bundle.recordId,limit:20});
    expect(view.recordId).toBe(bundle.recordId);expect(view.rows).toHaveLength(20);
    expect(view.totalRows).toBe(37);expect(view.terminal_eligible).toBe(false);
    await expect(store.put(owner,bundle)).rejects.toThrow();
    expect(await store.read({tenantId:'other',accountProfileId:'b'},bundle.recordId)).toBeNull();
  });
  it('rejects a linked storage directory before reading',async()=>{
    await symlink(os.tmpdir(),path.join(root,'solar-research-records'),'junction');
    await expect(new SolarResearchFileStore(root).read({tenantId:'a',accountProfileId:'b'},`solar-primary:${'a'.repeat(64)}`))
      .rejects.toThrow('LINK_REJECTED');
  });
  it.skipIf(!present)('does not persist caller mutations during asynchronous verification',async()=>{
    const bundle=await prepareSolarResearchExport(await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z'));
    const original={...bundle};const owner={tenantId:'a',accountProfileId:'b'};
    const store=new SolarResearchFileStore(root);
    const writing=store.put(owner,bundle);
    owner.tenantId='other';bundle.tableCsv+='tampered';
    // A mutation during verification may reject the write; it must never save the altered bundle.
    try {
      await writing;
      expect((await store.read({tenantId:'a',accountProfileId:'b'},original.recordId))?.bundle).toEqual(original);
    } catch(error) {
      expect(String(error)).toContain('integrity or recipe mismatch');
    }
    expect(await store.read(owner,original.recordId)).toBeNull();
  });
});
