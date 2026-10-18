import {syntheticSolarPortablePackage} from './fixtures/solar-portable-package';
import {webcrypto} from 'node:crypto';
import {beforeAll,afterEach,describe,expect,it,vi} from 'vitest';
import {prepareSolarPackageStorage,verifySolarPackageStorage,SOLAR_PACKAGE_CHUNK_BYTES,SOLAR_PACKAGE_ENTRY_BYTES} from '../server/services/solar-research/package-storage-codec';
const owner={tenantId:'codec-test-tenant',accountProfileId:'codec-test-profile'};
let packageJson:string;
beforeAll(async()=>{vi.stubGlobal('crypto',webcrypto);packageJson=await syntheticSolarPortablePackage();});
afterEach(()=>vi.unstubAllGlobals());
describe('synthetic solar portable package storage codec',()=>{
  it('preserves exact fixture bytes, identities and negative claims',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    const prepared=await prepareSolarPackageStorage(owner,packageJson);
    const reopened=await verifySolarPackageStorage(owner,prepared.manifestJson,prepared.chunks);
    expect(reopened.packageJson).toBe(packageJson);
    expect(reopened.indexId).toBe(prepared.indexId);
    expect(reopened.verified).toMatchObject({scientificAdmission:false,originalFitsIncluded:false});
    expect(JSON.parse(prepared.manifestJson)).toMatchObject({owner,sourceIdentityAuthenticated:false,scientificAdmission:false});
  });
  it('rejects wrong owner before decoding, missing, duplicate, reordered and altered chunks',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    const large=packageJson+' '.repeat(SOLAR_PACKAGE_CHUNK_BYTES*2);
    const p=await prepareSolarPackageStorage(owner,large);
    expect(p.chunks.length).toBe(3);
    expect(p.chunks.every(c=>Buffer.byteLength(c.value)<=SOLAR_PACKAGE_ENTRY_BYTES)).toBe(true);
    expect((await verifySolarPackageStorage(owner,p.manifestJson,p.chunks)).packageJson).toBe(large);
    await expect(verifySolarPackageStorage({...owner,tenantId:'other'},p.manifestJson,[])).rejects.toThrow('OWNER_MISMATCH');
    await expect(verifySolarPackageStorage(owner,p.manifestJson,p.chunks.slice(1))).rejects.toThrow('CHUNKS_INVALID');
    await expect(verifySolarPackageStorage(owner,p.manifestJson,[p.chunks[1],p.chunks[0],p.chunks[2]])).rejects.toThrow('CHUNKS_INVALID');
    await expect(verifySolarPackageStorage(owner,p.manifestJson,[p.chunks[0],p.chunks[0],p.chunks[2]])).rejects.toThrow('CHUNKS_INVALID');
    const changed=p.chunks.map(c=>({...c}));changed[0].value='A'+changed[0].value.slice(1);
    await expect(verifySolarPackageStorage(owner,p.manifestJson,changed)).rejects.toThrow('INTEGRITY_FAILED');
  });
  it('rejects manifest promotion, identity changes and nested recipe tampering',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    const p=await prepareSolarPackageStorage(owner,packageJson);
    const manifest=JSON.parse(p.manifestJson);
    await expect(verifySolarPackageStorage(owner,JSON.stringify({...manifest,scientificAdmission:true}),p.chunks)).rejects.toThrow();
    await expect(verifySolarPackageStorage(owner,JSON.stringify({...manifest,indexId:'solar-evidence-index:'+'0'.repeat(64)}),p.chunks)).rejects.toThrow('INDEX_MISMATCH');
    await expect(verifySolarPackageStorage(owner,' '.repeat(16385),[])).rejects.toThrow('SIZE_LIMIT');
    const changed=JSON.parse(packageJson);changed.comparison.tableCsv+='tampered';
    await expect(prepareSolarPackageStorage(owner,JSON.stringify(changed))).rejects.toThrow();
    await expect(prepareSolarPackageStorage(owner,' '.repeat(9_000_001))).rejects.toThrow('9 MB');
  });
});
