import {describe,it,expect,beforeEach,vi,afterEach} from 'vitest';
import {createHash,webcrypto} from 'node:crypto';
import {readSolarDisplayNormalization} from '../shared/solar-display-normalization';
import {serializeObservationSnapshot,validateObservationReplay} from '../shared/solar-observation-replay';

const context=()=>({schemaVersion:'solar-display-normalization/1',processingRecipe:'sunpy_resample_percentile_99_5_clip_v1',
  scale:200,scaleSelection:'positive_pixel_percentile',percentile:99.5,inputUnitDeclared:'DN',fitsExptimeSecondsDeclared:2,
  exposureCorrectionApplied:false,radiometricCalibrationApplied:false,clippedToUnitInterval:true,
  originalPixelsRecoverable:false,sourceIdentityAuthenticated:false});
const frame=()=>{
  const bytes=Buffer.alloc(32*32*4);
  return {grid_size:32,map_b64:bytes.toString('base64'),obstime:'2026-09-26T17:00:00Z',
    coordinate_frame:'native_instrument_pixel_grid',fits_sha256:'a'.repeat(64),
    display_sha256:createHash('sha256').update(bytes).digest('hex'),display_processing:context().processingRecipe};
};
const payload=(normalization?:unknown)=>({instrument:'AIA',wavelength_A:193,meta:{observed_mode:'observed'},
  frames:[{...frame(),...(normalization===undefined?{}:{display_normalization:normalization})}]});
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>vi.unstubAllGlobals());
describe('display context is not physical calibration',()=>{
  it('keeps legacy input readable without fabricating normalization metadata',async()=>{
    expect(readSolarDisplayNormalization(undefined)).toBeUndefined();
    const replay=await validateObservationReplay(payload());
    expect(replay.frames[0]).not.toHaveProperty('display_normalization');
    const serialized=JSON.parse(await serializeObservationSnapshot(payload()));
    expect((await validateObservationReplay(serialized)).archive_identity?.snapshotId).toBe(serialized.archive_identity.snapshotId);
  });
  it('retains exact context in a stable archive identity',async()=>{
    const text=await serializeObservationSnapshot(payload(context()));
    const input=JSON.parse(text),replay=await validateObservationReplay(input);
    expect(replay.frames[0].display_normalization).toEqual(context());
    expect(await serializeObservationSnapshot(replay)).toBe(text);
    expect(input.archive_identity.containsSourceFits).toBe(false);
  });
  it('binds changed processing context to identity, without authenticating declarations',async()=>{
    const input=JSON.parse(await serializeObservationSnapshot(payload(context())));
    input.frames[0].display_normalization.scale=300;
    await expect(validateObservationReplay(input)).rejects.toThrow('archive identity');
    const updated=JSON.parse(await serializeObservationSnapshot(payload({...context(),scale:300})));
    expect(updated.archive_identity.snapshotId).not.toBe(input.archive_identity.snapshotId);
    expect(updated.archive_identity.sourceIdentityAuthenticated).toBe(false);
  });
  it.each([
    {scale:0},{scale:Infinity},{scaleSelection:'fallback_one',scale:2},{inputUnitDeclared:'x'.repeat(65)},
    {fitsExptimeSecondsDeclared:-1},{radiometricCalibrationApplied:true},{exposureCorrectionApplied:true},
    {originalPixelsRecoverable:true},{sourceIdentityAuthenticated:true},{unexpected:'authority'},
  ])('rejects invalid or promoted context %j',async change=>{
    await expect(validateObservationReplay(payload({...context(),...change}))).rejects.toThrow('normalization context');
  });
  it('rejects metadata on a different recipe and allows explicit unavailable units/exposure',()=>{
    expect(()=>readSolarDisplayNormalization(context(),'different')).toThrow('processing recipe');
    expect(readSolarDisplayNormalization({...context(),inputUnitDeclared:null,fitsExptimeSecondsDeclared:null},context().processingRecipe))
      .toMatchObject({inputUnitDeclared:null,fitsExptimeSecondsDeclared:null,radiometricCalibrationApplied:false});
  });
});
