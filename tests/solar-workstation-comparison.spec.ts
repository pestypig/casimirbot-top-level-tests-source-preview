import { describe, expect, it } from 'vitest';
import { validateProfile, compareProfiles, decodeObservation } from '../public/solar-workstation-comparison.js';

const profile = (sourceKind = 'observed') => ({ schemaVersion: 'solar-radial-display/1',
  sourceKind, label: 'test', quantity: 'density', units: 'kg/m3', referenceRadiusM: 6.9598e8,
  sourceSha256: 'a'.repeat(64), points: [{ r: 0.1, value: 3 }, { r: 0.5, value: 1 }] });
describe('solar workstation comparison boundaries', () => {
  it('computes only aligned dimensional residuals', () => {
    expect(compareProfiles(profile(), profile('model'))).toEqual([{ r: 0.1, value: 0 }, { r: 0.5, value: 0 }]);
  });
  it.each(['quantity', 'units', 'referenceRadiusM', 'points'])('rejects incompatible %s', key => {
    const model = profile('model');
    const changes = { quantity: 'temperature', units: 'K', referenceRadiusM: 6.957e8,
      points: [{ r: 0.2, value: 3 }, { r: 0.5, value: 1 }] };
    expect(() => compareProfiles(profile(), { ...model, [key]: changes[key] })).toThrow();
  });
  it('rejects demo as observational evidence', () => {
    expect(() => compareProfiles(profile('demo'), profile('model'))).toThrow();
  });
  it('rejects identical but dimensionally incompatible unit labels', () => {
    expect(() => compareProfiles({...profile(), units:'K'}, {...profile('model'), units:'K'}))
      .toThrow('quantity/unit convention');
    expect(() => validateProfile({...profile(), units:'arbitrary normalized'}))
      .toThrow('quantity/unit convention');
  });
  it.each([
    ['density','kg/m3'], ['density','g/cm3'],
    ['sound_speed_squared','m2/s2'], ['sound_speed_squared','cm2/s2'],
    ['temperature','K'], ['hydrogen_fraction','dimensionless'], ['gamma1','1'],
  ])('accepts an explicit %s unit convention %s', (quantity,units) => {
    expect(validateProfile({...profile(),quantity,units}).units).toBe(units);
  });
  it('requires explicit conversion even for dimensionally equivalent units', () => {
    expect(() => compareProfiles(profile(), {...profile('model'),units:'g/cm3'}))
      .toThrow('explicit mapping required');
  });
  it('rejects missing hashes, NaN and nonmonotonic grids', () => {
    expect(() => validateProfile({ ...profile(), sourceSha256: '' })).toThrow();
    expect(() => validateProfile({ ...profile(), points: [{r: 0.2, value: NaN}, {r: 0.1, value: 2}] })).toThrow();
  });
  it('rejects malformed image buffers', () => {
    expect(() => decodeObservation({ grid_size: 192, map_b64: 'AA==', obstime: '2026-09-26T15:03:00Z' })).toThrow();
  });
  it('rejects finite input values whose plot range overflows', () => {
    expect(() => validateProfile({...profile(),points:[{r:0.1,value:-1e308},{r:0.5,value:1e308}]}))
      .toThrow('range overflow');
  });
  it('rejects dimensional subtraction overflow', () => {
    const observed = {...profile(),points:[{r:0.1,value:-1e308},{r:0.5,value:-1e308}]};
    const model = {...profile('model'),points:[{r:0.1,value:1e308},{r:0.5,value:1e308}]};
    expect(() => compareProfiles(observed,model)).toThrow('residual overflow');
  });
  it('rejects residual range overflow even when individual residuals are finite', () => {
    const observed = {...profile(),points:[{r:0.1,value:-8e307},{r:0.5,value:8e307}]};
    const model = {...profile('model'),points:[{r:0.1,value:8e307},{r:0.5,value:-8e307}]};
    expect(() => compareProfiles(observed,model)).toThrow('residual display range overflow');
  });
});
