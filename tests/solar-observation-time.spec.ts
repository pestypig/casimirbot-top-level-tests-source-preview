import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {createHash,webcrypto} from 'node:crypto';
import {solarObservationTimeMs} from '../shared/solar-observation-time';
import {solarObservationFreshness} from '../shared/solar-observation-freshness';
import {validateObservationReplay,serializeObservationSnapshot} from '../shared/solar-observation-replay';
const invalid=['2026-02-30T00:00:00Z','1900-02-29T00:00:00Z','2026-04-31T00:00:00Z',
  '2026-09-27T24:00:00Z','2026-09-27T00:00:60Z','2026-09-27T00:00:00+24:00',
  '2026-09-27T00:00:00','September 27, 2026 00:00:00Z'];
function payload(){const bytes=Buffer.alloc(32*32*4);return {instrument:'AIA',wavelength_A:193,
  meta:{observed_mode:'observed',fetched_at_utc:'2026-09-27T07:11:10.813092+00:00'},
  frames:[{grid_size:32,map_b64:bytes.toString('base64'),obstime:'2026-09-27T05:39:04.842Z',
    coordinate_frame:'native_instrument_pixel_grid',fits_sha256:'a'.repeat(64),
    display_sha256:createHash('sha256').update(bytes).digest('hex')}]};}
beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>vi.unstubAllGlobals());
describe('strict archive and freshness calendar declarations',()=>{
  it.each(invalid)('rejects invalid acquisition and retrieval %s',async time=>{
    expect(solarObservationTimeMs(time)).toBeNull();
    const input=payload();input.frames[0].obstime=time;
    await expect(validateObservationReplay(input)).rejects.toThrow();
    const fetch=payload();fetch.meta.fetched_at_utc=time;
    await expect(validateObservationReplay(fetch)).rejects.toThrow('retrieval time');
    const nowMs=Date.parse('2026-09-28T00:00:00Z');
    expect(solarObservationFreshness({nowMs,replay:false,acquiredAt:time}).state).toBe('time_unverified');
    expect(solarObservationFreshness({nowMs,replay:false,acquiredAt:payload().frames[0].obstime,fetchedAt:time}).state).toBe('time_unverified');
  });
  it('preserves microsecond declarations and exact archive identity on replay',async()=>{
    const input=payload(),text=await serializeObservationSnapshot(input);
    const replay=await validateObservationReplay(JSON.parse(text));
    expect(replay.meta.fetched_at_utc).toBe(input.meta.fetched_at_utc);
    expect(await serializeObservationSnapshot(replay)).toBe(text);
    expect(solarObservationTimeMs('2000-02-29T00:00:00.123456789Z')).toBe(Date.parse('2000-02-29T00:00:00.123Z'));
    expect(solarObservationTimeMs('2026-09-27T01:39:04.842-04:00')).toBe(solarObservationTimeMs(input.frames[0].obstime));
  });
});
