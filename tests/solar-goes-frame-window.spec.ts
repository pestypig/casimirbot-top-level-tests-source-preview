import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createHash,webcrypto} from 'node:crypto';
import {createSolarGoesFrameWindow,readSolarGoesFrameWindow} from '../shared/solar-goes-frame-window';
import {createSolarEventImageSelection} from '../shared/solar-event-image-selection';
import {serializeObservationSnapshot,validateObservationReplay} from '../shared/solar-observation-replay';

beforeEach(()=>vi.stubGlobal('crypto',webcrypto));
afterEach(()=>vi.unstubAllGlobals());
const frames=[{obstime:'2026-09-30T12:00:00Z'},{obstime:'2026-09-30T12:10:00Z'}];
const sourceBins=[
  {start:'2026-09-30T11:55:00',end:'2026-09-30T12:00:00',mean_long:1e-7},
  {start:'2026-09-30T12:00:00',end:'2026-09-30T12:05:00',mean_long:8e-6},
  {start:'2026-09-30T12:05:00',end:'2026-09-30T12:10:00',mean_long:4e-6},
  {start:'2026-09-30T12:10:00',end:'2026-09-30T12:15:00',mean_long:-1},
];

it('selects bounded UTC GOES bins for one frame without attributing a flare',()=>{
  const window=createSolarGoesFrameWindow({frames,selectedFrameIndex:1,bins:sourceBins})!;
  expect(window).toMatchObject({relationship:'temporal_context_only',selectedFrameIndex:1,
    frameAcquiredAt:frames[1].obstime,sourceFilesAuthenticated:false,scientificAdmission:false});
  expect(window.bins).toHaveLength(3);
  expect(window.bins[0].startUtc).toBe('2026-09-30T11:55:00.000Z');
  expect(readSolarGoesFrameWindow(window,frames)).toEqual(window);
  expect(createSolarGoesFrameWindow({frames,selectedFrameIndex:0,bins:[]} )?.bins).toEqual([]);
});

it('rejects substituted frames, extra authority, inverted bins and out-of-window values',()=>{
  const window=createSolarGoesFrameWindow({frames,selectedFrameIndex:1,bins:sourceBins})!;
  expect(()=>readSolarGoesFrameWindow({...window,scientificAdmission:true},frames)).toThrow();
  expect(()=>readSolarGoesFrameWindow({...window,extra:'model fit'},frames)).toThrow();
  expect(()=>readSolarGoesFrameWindow(window,[frames[1],frames[0]])).toThrow();
  expect(()=>readSolarGoesFrameWindow({...window,bins:[{...window.bins[0],endUtc:window.bins[0].startUtc}]},frames)).toThrow();
  expect(()=>readSolarGoesFrameWindow({...window,bins:[{...window.bins[0],meanLongWm2:Infinity}]},frames)).toThrow();
});

it('round-trips the exact frame, event and graph window as one archive identity',async()=>{
  const pixels=Buffer.alloc(32*32*4);
  const selected_event_context=createSolarEventImageSelection({id:'ivo://hek/FL-example',event_type:'FL',
    start_time:'2026-09-30T12:00:00Z',end_time:'2026-09-30T12:20:00Z'},1,2);
  const selected_goes_window=createSolarGoesFrameWindow({frames,selectedFrameIndex:1,bins:sourceBins});
  const payload={instrument:'AIA',wavelength_A:193,meta:{observed_mode:'observed'},
    frames:frames.map(frame=>({grid_size:32,map_b64:pixels.toString('base64'),obstime:frame.obstime,
      coordinate_frame:'native_instrument_pixel_grid',fits_sha256:'a'.repeat(64),
      display_sha256:createHash('sha256').update(pixels).digest('hex')})),
    selected_event_context,selected_goes_window};
  const text=await serializeObservationSnapshot(payload);
  const replay=await validateObservationReplay(JSON.parse(text));
  expect(replay.selected_event_context).toEqual(selected_event_context);
  expect(replay.selected_goes_window).toEqual(selected_goes_window);
  expect(await serializeObservationSnapshot(replay)).toBe(text);
  const tampered=JSON.parse(text);tampered.selected_goes_window.bins[0].meanLongWm2=0.00001;
  await expect(validateObservationReplay(tampered)).rejects.toThrow('archive identity');
});
