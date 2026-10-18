import {describe,it,expect,vi} from 'vitest';
import {existsSync} from 'node:fs';
import {SolarResearchProfileRecordReader,solarProfileRecordKey} from '../server/services/solar-research/profile-record-reader';
import {HELIX_PROFILE_STORAGE_SNAPSHOT_SCHEMA,type HelixProfileStorageSnapshot} from '../shared/helix-profile-storage';
import {prepareSolarResearchExport} from '../shared/solar-research-export';
import {loadLocalPrimaryObservation} from '../server/services/solar-research/primary-observation';
import {writeProfileStorageSnapshot} from '../server/services/helix-account/profile-storage-store';
import {resetAccountSessionStore} from '../server/services/helix-account/account-session-store';
import {retainSolarProfileRecord} from '../server/services/solar-research/profile-record-retention';
import {readProfileStorageSnapshot} from '../server/services/helix-account/profile-storage-store';
const owner={tenantId:'solar-test',accountProfileId:'solar-profile'};
const snapshot=():HelixProfileStorageSnapshot=>({schema:HELIX_PROFILE_STORAGE_SNAPSHOT_SCHEMA,profile_id:owner.accountProfileId,
  storage_backend:'profile_server',entries:[],artifacts:[],total_entry_bytes:0,quota_bytes:5_000_000,updated_at:null,raw_profile_content_included:true});
const present=existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt')&&existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
describe('solar encrypted-profile reader adapter',()=>{
  it.skipIf(!present)('retains without replacing unrelated profile content and preserves quota failures',async()=>{
    await resetAccountSessionStore();
    try {
      const bundle=await prepareSolarResearchExport(await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z'));
      const updated_at='2026-09-26T20:00:00Z';
      await writeProfileStorageSnapshot({profile_id:owner.accountProfileId,snapshot:{
        entries:[{storage_key:'notes',storage_backend:'localStorage',value:'keep my notes',size_bytes:13,updated_at,artifact_ids:['note']}],
        artifacts:[{schema:'helix.workspace_memory_registry.v1',artifact_id:'note',artifact_type:'workstation_note',owner_scope:'profile',
          storage_backend:'localStorage',sync_status:'profile_candidate',profile_id:owner.accountProfileId,chat_session_id:null,
          title:'Notes',storage_key:'notes',updated_at}]
      }});
      const before=await readProfileStorageSnapshot(owner.accountProfileId);
      const refused=await retainSolarProfileRecord(owner,bundle,20);
      expect(refused.saved).toBe(false);expect(refused.receipt.error).toBe('profile_storage_quota_exceeded');
      expect((await readProfileStorageSnapshot(owner.accountProfileId)).storage_revision).toBe(before.storage_revision);
      const retained=await retainSolarProfileRecord(owner,bundle,5_000_000);
      expect(retained.saved).toBe(true);expect(retained.admissionAllowed).toBe(false);
      const after=await readProfileStorageSnapshot(owner.accountProfileId);
      expect(after.entries.find(entry=>entry.storage_key==='notes')?.value).toBe('keep my notes');
      expect((await new SolarResearchProfileRecordReader().read(owner,bundle.recordId))?.bundle).toEqual(bundle);
      await expect(retainSolarProfileRecord(owner,bundle,5_000_000)).rejects.toThrow('ALREADY_RETAINED');
    } finally {await resetAccountSessionStore();}
  });
  it.skipIf(!present)('reads real data through the actual profile snapshot service',async()=>{
    await resetAccountSessionStore();
    try {
      const bundle=await prepareSolarResearchExport(await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z'));
      const storage_key=solarProfileRecordKey(bundle.recordId);
      const value=JSON.stringify({owner,bundle});
      const updated_at='2026-09-26T20:00:00Z';
      const receipt=await writeProfileStorageSnapshot({profile_id:owner.accountProfileId,snapshot:{
        entries:[{storage_key,storage_backend:'localStorage',value,size_bytes:Buffer.byteLength(value),updated_at,artifact_ids:[bundle.recordId]}],
        artifacts:[{schema:'helix.workspace_memory_registry.v1',artifact_id:bundle.recordId,artifact_type:'linked_source',
          owner_scope:'profile',storage_backend:'localStorage',sync_status:'profile_candidate',profile_id:owner.accountProfileId,
          chat_session_id:null,title:'Solar research comparison',storage_key,updated_at}]
      }});
      expect(receipt.ok).toBe(true);
      expect(receipt.raw_profile_content_included).toBe(false);
      expect((await new SolarResearchProfileRecordReader().read(owner,bundle.recordId))?.bundle).toEqual(bundle);
    } finally {await resetAccountSessionStore();}
  });
  it('rejects path-like record IDs before storage access',async()=>{
    const read=vi.fn();await expect(new SolarResearchProfileRecordReader(read).read(owner,'../secret')).rejects.toThrow('ID_INVALID');
    expect(read).not.toHaveBeenCalled();
  });
  it('returns absence without acquiring data or writing',async()=>{
    const read=vi.fn().mockResolvedValue(snapshot());
    expect(await new SolarResearchProfileRecordReader(read).read(owner,`solar-primary:${'a'.repeat(64)}`)).toBeNull();
    expect(read).toHaveBeenCalledWith(owner.accountProfileId);
  });
  it.skipIf(!present)('preserves real identity and fails closed on tenant mismatch, duplicates and tampering',async()=>{
    const bundle=await prepareSolarResearchExport(await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z'));
    const saved=snapshot();
    const entry={storage_key:solarProfileRecordKey(bundle.recordId),storage_backend:'localStorage' as const,
      value:JSON.stringify({owner,bundle}),size_bytes:0,updated_at:'2026-09-26T20:00:00Z',artifact_ids:[bundle.recordId]};
    saved.entries=[entry];
    const reader=new SolarResearchProfileRecordReader(async()=>saved);
    expect((await reader.read(owner,bundle.recordId))?.bundle).toEqual(bundle);
    expect(await reader.list(owner)).toMatchObject({totalRecords:1,rejectedCount:0,records:[{recordId:bundle.recordId,rowCount:37,fixtureOnly:false}],scienceRunAllowed:false});
    await expect(reader.list(owner,0,21)).rejects.toThrow('PAGE_INVALID');
    expect(await reader.list({...owner,tenantId:'other'})).toMatchObject({totalRecords:0,rejectedCount:0,records:[]});
    await expect(reader.read({...owner,tenantId:'other'},bundle.recordId)).rejects.toThrow('OWNER_MISMATCH');
    saved.entries=[entry,entry];await expect(reader.read(owner,bundle.recordId)).rejects.toThrow('DUPLICATE_ENTRY');
    saved.entries=[{...entry,value:JSON.stringify({owner,bundle:{...bundle,tableCsv:'tampered'}})}];
    await expect(reader.read(owner,bundle.recordId)).rejects.toThrow('integrity or recipe mismatch');
    expect(await reader.list(owner)).toMatchObject({totalRecords:0,rejectedCount:1,records:[]});
  });
});
