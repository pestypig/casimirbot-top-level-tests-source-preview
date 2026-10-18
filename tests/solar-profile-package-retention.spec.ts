import {syntheticSolarPortablePackage} from './fixtures/solar-portable-package';
import {webcrypto} from 'node:crypto';
import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const store=vi.hoisted(()=>({readProfileStorageSnapshot:vi.fn(),writeProfileStorageSnapshot:vi.fn()}));
vi.mock('../server/services/helix-account/profile-storage-store',()=>store);
import {retainSolarProfilePackage} from '../server/services/solar-research/profile-package-retention';
import {preserveRetainedSolarRecords} from '../shared/solar-profile-storage-preservation';
import {verifySolarPackageStorage} from '../server/services/solar-research/package-storage-codec';
let text:string;
beforeAll(async()=>{vi.stubGlobal('crypto',webcrypto);text=await syntheticSolarPortablePackage();});
const owner={tenantId:'package-test',accountProfileId:'package-profile'};
const unrelated={storage_key:'other',storage_backend:'localStorage' as const,value:'keep',size_bytes:4,updated_at:'2026-09-26T00:00:00Z',artifact_ids:['other']};
const snapshot=()=>({schema:'helix.profile_storage_snapshot.v1' as const,profile_id:owner.accountProfileId,storage_backend:'profile_server' as const,
  entries:[unrelated],artifacts:[{schema:'helix.workspace_memory_registry.v1' as const,artifact_id:'other',artifact_type:'linked_source' as const,
    owner_scope:'profile' as const,storage_backend:'localStorage' as const,sync_status:'profile_synced' as const,profile_id:owner.accountProfileId,
    chat_session_id:null,title:'Other workspace data',storage_key:'other',updated_at:unrelated.updated_at}],
  total_entry_bytes:4,quota_bytes:5242880,updated_at:null,storage_revision:'original',raw_profile_content_included:true as const});
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);vi.clearAllMocks();store.readProfileStorageSnapshot.mockResolvedValue(snapshot());store.writeProfileStorageSnapshot.mockResolvedValue({ok:true});});
afterEach(()=>vi.unstubAllGlobals());
describe('atomic package retention boundary',()=>{
  it('writes complete package in one conditional operation without replacing unrelated data',async()=>{
    const result=await retainSolarProfilePackage(owner,text,5242880);
    expect(result.saved).toBe(true);expect(store.writeProfileStorageSnapshot).toHaveBeenCalledTimes(1);
    const write=store.writeProfileStorageSnapshot.mock.calls[0][0];
    expect(write.expected_storage_revision).toBe('original');expect(write.snapshot.entries[0]).toEqual(unrelated);
    const entries=write.snapshot.entries.slice(1);
    const reopened=await verifySolarPackageStorage(owner,entries[0].value,entries.slice(1).map((e:any,i:number)=>({ordinal:i,value:e.value})));
    expect(reopened.packageJson).toBe(text);
    expect(write.snapshot.artifacts).toHaveLength(entries.length+1);
  });
  it('rejects quota, owner and duplicate failures before writing',async()=>{
    await expect(retainSolarProfilePackage(owner,text,100)).rejects.toThrow('QUOTA_EXCEEDED');
    store.readProfileStorageSnapshot.mockResolvedValue({...snapshot(),profile_id:'other'});
    await expect(retainSolarProfilePackage(owner,text,5242880)).rejects.toThrow('OWNER_MISMATCH');
    expect(store.writeProfileStorageSnapshot).not.toHaveBeenCalled();
    store.readProfileStorageSnapshot.mockResolvedValue(snapshot());
    await retainSolarProfilePackage(owner,text,5242880);
    const saved=store.writeProfileStorageSnapshot.mock.calls[0][0].snapshot;
    store.readProfileStorageSnapshot.mockResolvedValue({...snapshot(),...saved});store.writeProfileStorageSnapshot.mockClear();
    await expect(retainSolarProfilePackage(owner,text,5242880)).rejects.toThrow('ALREADY_RETAINED');
    expect(store.writeProfileStorageSnapshot).not.toHaveBeenCalled();
  });
  it('returns revision conflict without retry or successful-save claim',async()=>{
    store.writeProfileStorageSnapshot.mockResolvedValue({ok:false,error:'profile_storage_revision_conflict'});
    expect(await retainSolarProfilePackage(owner,text,5242880)).toMatchObject({saved:false,receipt:{error:'profile_storage_revision_conflict'}});
    expect(store.writeProfileStorageSnapshot).toHaveBeenCalledTimes(1);
  });
  it('refuses existing orphaned or oversized data rather than letting normalization drop it',async()=>{
    store.readProfileStorageSnapshot.mockResolvedValue({...snapshot(),artifacts:[]});
    await expect(retainSolarProfilePackage(owner,text,5242880)).rejects.toThrow('EXISTING_STORAGE_INVALID');
    store.readProfileStorageSnapshot.mockResolvedValue({...snapshot(),entries:[{...unrelated,value:'x'.repeat(2097153)}]});
    await expect(retainSolarProfilePackage(owner,text,5242880)).rejects.toThrow('STORAGE_SIZE_LIMIT');
    expect(store.writeProfileStorageSnapshot).not.toHaveBeenCalled();
  });
  it('preserves server packages and refuses forged browser package entries',()=>{
    const protectedEntry={...unrelated,storage_key:'solar-research-package:real:manifest'};
    const protectedArtifact={storage_key:protectedEntry.storage_key};
    const current={...snapshot(),entries:[protectedEntry],artifacts:[protectedArtifact as any]};
    const output=preserveRetainedSolarRecords(current,{entries:[unrelated,{...protectedEntry,value:'forged'},
      {...protectedEntry,storage_key:'solar-research-package:forged:manifest'}],artifacts:[]});
    expect(output.entries).toEqual([unrelated,protectedEntry]);expect(output.artifacts).toEqual([protectedArtifact]);
  });
});
