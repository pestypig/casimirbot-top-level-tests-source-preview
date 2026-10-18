import {createHash,webcrypto} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {syntheticSolarPortablePackage} from './fixtures/solar-portable-package';
import {verifySolarResearchEvidencePackage} from '../shared/solar-research-evidence-package';
import {recipeFromVerifiedSolarArchive,verifySolarDiskViewRecipe} from '../shared/solar-disk-view-recipe';
import {readSolarPackageEvidenceView} from '../shared/solar-package-evidence-view';

afterEach(()=>vi.unstubAllGlobals());

it('gives UI replay and bounded MCP projection the same content-addressed disk view',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const packageJson=await syntheticSolarPortablePackage(true,true);
  const packageId='solar-package:'+createHash('sha256').update(packageJson).digest('hex');
  const replay=await verifySolarResearchEvidencePackage(packageJson);
  const local=await recipeFromVerifiedSolarArchive(packageId,replay.archiveReplay!,0);
  const mcp=await readSolarPackageEvidenceView(packageJson,{packageId,rowLimit:1,frameLimit:1});
  expect(mcp.diskViewRecipe).toEqual(local);
  expect(local).toMatchObject({packageId,archiveId:replay.archiveReplay?.archive_identity?.snapshotId,
    fieldLines:'off',scientificAdmission:false,quantitativeJoinAllowed:false,
    eventMarker:{kind:'catalog_assertion',relationship:'contextual_co_occurrence_only'}});
  expect(await verifySolarDiskViewRecipe(local)).toEqual(local);
  expect(JSON.stringify(mcp)).not.toContain('map_b64');
});

it('rejects forged identities, modeled lines and unavailable frames',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const packageJson=await syntheticSolarPortablePackage(true);
  const packageId='solar-package:'+createHash('sha256').update(packageJson).digest('hex');
  const replay=await verifySolarResearchEvidencePackage(packageJson);
  const recipe=await recipeFromVerifiedSolarArchive(packageId,replay.archiveReplay!,0);
  await expect(verifySolarDiskViewRecipe({...recipe,frameIndex:1})).rejects.toThrow('MISMATCH');
  await expect(verifySolarDiskViewRecipe({...recipe,fieldLines:'pfss'})).rejects.toThrow();
  await expect(recipeFromVerifiedSolarArchive(packageId,replay.archiveReplay!,1)).rejects.toThrow('FRAME_UNAVAILABLE');
});
