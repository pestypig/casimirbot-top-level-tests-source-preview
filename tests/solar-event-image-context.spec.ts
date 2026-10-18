import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { buildSolarEventImageContext } from '../shared/solar-event-image-context';
import {createSolarEventImageSelection,readSolarEventImageSelection} from '../shared/solar-event-image-selection';
import {serializeObservationSnapshot,validateObservationReplay} from '../shared/solar-observation-replay';

beforeEach(()=>vi.stubGlobal('crypto',webcrypto));
afterEach(()=>vi.unstubAllGlobals());

describe('selected solar event and image context', () => {
  it('reports an exact time offset without promoting context to a correlation', () => {
    const context = buildSolarEventImageContext({ id: 'ivo://hek/FL-1', event_type: 'FL',
      start_time: '2025-09-12T01:14:00Z', end_time: '2025-09-12T01:40:00Z', frm_name: 'SSW Latest Events' },
    { obstime: '2025-09-12T01:16:30+00:00' }, { instrument: 'AIA', wavelength_A: 171,
      meta: { fetched_at_utc: '2025-09-13T00:00:00Z' }, archive_identity: { snapshotId: 'solar-observation:abc' } });
    expect(context).toMatchObject({ relationship: 'contextual_co_occurrence_only',
      imageOffsetFromEventStartSeconds: 150, imageWithinReportedEvent: true, missing: [] });
  });

  it('preserves missingness for invalid or absent times, event identity, and snapshot', () => {
    const context = buildSolarEventImageContext({ event_type: 'FL', start_time: '2025-02-30T01:00:00Z' },
      { obstime: 'not a time' }, null);
    expect(context.imageOffsetFromEventStartSeconds).toBeNull();
    expect(context.imageWithinReportedEvent).toBeNull();
    expect(context.missing).toContain('stable event source ID');
    expect(context.missing).toContain('valid selected image acquisition time');
    expect(context.missing).toContain('declared image snapshot identity');
  });

  it('does not call an image within a reversed event interval', () => {
    const context = buildSolarEventImageContext({ id: 'event', start: '2025-09-12T02:00:00Z',
      end: '2025-09-12T01:00:00Z' }, { obstime: '2025-09-12T01:30:00Z' }, null);
    expect(context.imageWithinReportedEvent).toBeNull();
  });

  it('round-trips a selected event and frame in the archive identity without admitting event inputs', async () => {
    const bytes=Buffer.alloc(32*32*4);
    const selection=createSolarEventImageSelection({id:'ivo://hek/FL-1',event_type:'FL',
      start_time:'2025-09-12T01:14:00Z',end_time:'2025-09-12T01:40:00Z',frm_name:'SSW Latest Events'},0,1);
    expect(selection).not.toBeNull();
    const payload={instrument:'AIA',wavelength_A:171,meta:{observed_mode:'observed'},
      frames:[{grid_size:32,map_b64:bytes.toString('base64'),obstime:'2025-09-12T01:16:30Z',
        coordinate_frame:'native_instrument_pixel_grid',fits_sha256:'a'.repeat(64),
        display_sha256:createHash('sha256').update(bytes).digest('hex')}],
      events:[{id:'untrusted-extra-event'}],selected_event_context:selection};
    const text=await serializeObservationSnapshot(payload);
    const replay=await validateObservationReplay(JSON.parse(text));
    expect(replay.events).toEqual([]);
    expect(replay.selected_event_context).toEqual(selection);
    expect(await serializeObservationSnapshot(replay)).toBe(text);
    const tampered=JSON.parse(text);tampered.selected_event_context.eventId='other';
    await expect(validateObservationReplay(tampered)).rejects.toThrow('archive identity');
  });

  it('rejects authority promotion and unexpected fields in the selected context', () => {
    const selected=createSolarEventImageSelection({id:'event-1',start_time:'2025-09-12T01:14:00Z'},0,1)!;
    expect(()=>readSolarEventImageSelection({...selected,scientificAdmission:true},1)).toThrow();
    expect(()=>readSolarEventImageSelection({...selected,extra:'execute'},1)).toThrow();
    expect(()=>readSolarEventImageSelection({...selected,selectedFrameIndex:1},1)).toThrow();
  });
});
