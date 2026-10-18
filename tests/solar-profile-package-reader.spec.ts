import {syntheticSolarPortablePackage} from './fixtures/solar-portable-package';
import {webcrypto} from 'node:crypto';
import {beforeAll,afterEach,it,expect,vi} from 'vitest';
import {prepareSolarPackageStorage,SOLAR_PACKAGE_STORAGE_PREFIX} from '../server/services/solar-research/package-storage-codec';
import {SolarResearchProfilePackageReader} from '../server/services/solar-research/profile-package-reader';
const owner={tenantId:'reader-tenant',accountProfileId:'reader-profile'};
let packageJson:string;
beforeAll(async()=>{vi.stubGlobal('crypto',webcrypto);packageJson=await syntheticSolarPortablePackage();});
afterEach(()=>vi.unstubAllGlobals());
async function fixture() {
  vi.stubGlobal('crypto',webcrypto);
  const prepared=await prepareSolarPackageStorage(owner,packageJson);
  const base=`${SOLAR_PACKAGE_STORAGE_PREFIX}${prepared.packageId}:`;
  const entries=[{storage_key:base+'manifest',value:prepared.manifestJson},...prepared.chunks.map(c=>({storage_key:base+`chunk:${c.ordinal}`,value:c.value}))]
    .map(e=>({...e,storage_backend:'localStorage' as const,size_bytes:Buffer.byteLength(e.value),updated_at:'2026-09-26T00:00:00Z',artifact_ids:[prepared.packageId]}));
  const snapshot={schema:'helix.profile_storage_snapshot.v1' as const,profile_id:owner.accountProfileId,
    storage_backend:'profile_server' as const,entries,artifacts:[],total_entry_bytes:entries.reduce((n,e)=>n+e.size_bytes,0),
    quota_bytes:5242880,updated_at:null,raw_profile_content_included:true as const};
  return {prepared,snapshot};
}
it('reopens exact synthetic package and handles an absent identity without acquiring or writing',async()=>{
  const {prepared,snapshot}=await fixture();const read=vi.fn(async()=>snapshot);
  const reader=new SolarResearchProfilePackageReader(read);
  const reopened=await reader.read(owner,prepared.packageId);
  expect(reopened?.packageJson).toBe(packageJson);expect(reopened?.verified.scientificAdmission).toBe(false);
  expect(await reader.read(owner,'solar-package:'+'0'.repeat(64))).toBeNull();
  expect(read).toHaveBeenCalledWith(owner.accountProfileId);
  await expect(reader.read(owner,'../outside')).rejects.toThrow('ID_INVALID');
});
it('rejects cross-owner before malformed chunks and rejects wrong profile partition',async()=>{
  const {prepared,snapshot}=await fixture();snapshot.entries[1].value='not-base64';
  await expect(new SolarResearchProfilePackageReader(async()=>snapshot).read({...owner,tenantId:'other'},prepared.packageId))
    .rejects.toThrow('OWNER_MISMATCH');
  await expect(new SolarResearchProfilePackageReader(async()=>({...snapshot,profile_id:'other'})).read(owner,prepared.packageId))
    .rejects.toThrow('OWNER_MISMATCH');
});
it('rejects missing, duplicate, unknown and tampered stored entries',async()=>{
  const {prepared,snapshot}=await fixture();
  for(const entries of [snapshot.entries.slice(0,1),[...snapshot.entries,snapshot.entries[1]],
    [...snapshot.entries,{...snapshot.entries[1],storage_key:snapshot.entries[1].storage_key+':unknown'}],
    [snapshot.entries[0],{...snapshot.entries[1],value:'A'+snapshot.entries[1].value.slice(1)}]]) {
    await expect(new SolarResearchProfilePackageReader(async()=>({...snapshot,entries})).read(owner,prepared.packageId)).rejects.toThrow();
  }
});
it('lists a bounded fully verified owner page from one storage snapshot without publishing package bytes',async()=>{
  const {prepared,snapshot}=await fixture();const read=vi.fn(async()=>snapshot);
  const page=await new SolarResearchProfilePackageReader(read).list(owner,0,1);
  expect(read).toHaveBeenCalledOnce();expect(page).toMatchObject({totalPackages:1,nextOffset:null,scienceRunAllowed:false});
  expect(page.packages[0]).toMatchObject({packageId:prepared.packageId,indexId:prepared.indexId,comparisonRows:1,artifactIntegrityVerified:true});
  expect(JSON.stringify(page)).not.toContain('map_b64');expect(JSON.stringify(page)).not.toContain('packageJson');
  expect((await new SolarResearchProfilePackageReader(async()=>snapshot).list({...owner,tenantId:'other'})).packages).toEqual([]);
});
it('rejects invalid pages before reading and malformed selected content before listing it',async()=>{
  const {snapshot}=await fixture();const read=vi.fn(async()=>snapshot),reader=new SolarResearchProfilePackageReader(read);
  for(const args of [[-1,1],[0,21],[NaN,1],[100,1]])await expect(reader.list(owner,...args as [number,number])).rejects.toThrow('PAGE_INVALID');
  expect(read).not.toHaveBeenCalled();snapshot.entries[1].value='tampered';
  await expect(reader.list(owner)).rejects.toThrow();
});
it('rejects oversized catalog enumeration and duplicate owner manifest identities',async()=>{
  const {snapshot}=await fixture();const entry=snapshot.entries[0];
  await expect(new SolarResearchProfilePackageReader(async()=>({...snapshot,entries:Array(101).fill(entry)})).list(owner)).rejects.toThrow('CATALOG_LIMIT');
  await expect(new SolarResearchProfilePackageReader(async()=>({...snapshot,entries:[...snapshot.entries,entry]})).list(owner)).rejects.toThrow('CATALOG_INVALID');
});
