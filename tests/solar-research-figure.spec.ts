import { describe, expect, it } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadLocalPrimaryObservation } from '../server/services/solar-research/primary-observation';
import { prepareSolarResearchExport } from '../shared/solar-research-export';
import { prepareSolarResearchFigure, verifySolarResearchFigure } from '../shared/solar-research-figure';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
function fixture() {
  const source=(id:string)=>({id,sha256:'a'.repeat(64),kind:'fixture',provenance:'declared_source_identity'});
  return {schemaVersion:'solar-primary-comparison-record/1',createdAt:'2026-09-26T20:00:00Z',
    operator:'g1-bison13-sound-speed-primary-operator/1',operatorSha256:'b'.repeat(64),
    observation:source('solution'),kernels:source('kernels'),modelDifference:null as null | ReturnType<typeof source>,fixtureOnly:true,
    quantity:'delta_c_squared_over_bp04_c_squared',units:'dimensionless',referenceRadiusM:695980000,
    coordinate:'r_over_historical_bp04_radius',fullKernelSupport:[0.006695899,1.001225],
    uncertainty:'quoted_solution_error_only_no_covariance_or_systematics',residualConvention:'observed_minus_primary_term',
    crossTermIncluded:false,referenceProfileBound:false,admissionAllowed:false,scienceRunAllowed:false,
    rows:[{authorRow:1,secondQuartileRadius:0.1,observed:0.02,quotedSolutionError:0.001,
      primaryPrediction:null as null | number,residual:null as null | number}]};
}
const make=async (input:unknown)=>prepareSolarResearchFigure(await prepareSolarResearchExport(input));
describe('reproducible solar research paper figure',()=>{
  it('retains exact comparison identity, hashes SVG and replays deterministically',async()=>{
    const figure=await make(fixture()); const manifest=JSON.parse(figure.figureManifestJson);
    expect(manifest.figureSha256).toBe(createHash('sha256').update(figure.figureSvg).digest('hex'));
    expect(manifest.recordId).toBe(figure.comparisonBundle.recordId);
    expect(await make(fixture())).toEqual(figure);
    expect((await verifySolarResearchFigure(figure)).figureIntegrityVerified).toBe(true);
    expect(manifest.sourceIdentityAuthenticated).toBe(false); expect(manifest.admissionAllowed).toBe(false);
    expect(manifest.scienceRunAllowed).toBe(false);
  });
  it('plots quoted errors without creating missing predictions, residuals or joint uncertainty',async()=>{
    const figure=await make(fixture()); const manifest=JSON.parse(figure.figureManifestJson);
    expect(figure.figureSvg).toContain('UI TEST FIXTURE');
    expect(figure.figureSvg).toContain('data-series="observation"');
    expect(figure.figureSvg).not.toContain('data-series="primary-prediction"');
    expect(figure.figureSvg).not.toContain('data-series="residual"');
    expect(figure.figureSvg).toContain('not a joint confidence band');
    expect(manifest.domains.observed[0]).toBeLessThan(0);
    expect(manifest.domains.observed[1]).toBeGreaterThan(0.021);
    expect(manifest.domains.residual).toBeUndefined();
    expect(manifest.predictionUncertainty).toBe('not_bound');
  });
  it('plots supplied primary predictions and arithmetical residuals, not a fit score',async()=>{
    const input=fixture(); input.modelDifference={...input.observation,id:'model'};
    input.rows[0].primaryPrediction=0.018;input.rows[0].residual=0.002;
    const figure=await make(input);const manifest=JSON.parse(figure.figureManifestJson);
    expect(figure.figureSvg).toContain('data-series="primary-prediction"');
    expect(figure.figureSvg).toContain('data-series="residual"');
    expect(figure.figureSvg).toContain('no combined uncertainty bound');
    expect(manifest.domains.residual[1]).toBeGreaterThan(0.002);
    expect(manifest.residualUncertainty).toBe('not_bound');
  });
  it.each(['figureSvg','figureManifestJson'])('rejects altered %s',async field=>{
    const figure=await make(fixture());
    await expect(verifySolarResearchFigure({...figure,[field]:figure[field as 'figureSvg' | 'figureManifestJson']+' '})).rejects.toThrow('integrity or recipe mismatch');
  });
  it('rejects altered comparison input and invalid residuals before drawing',async()=>{
    const figure=await make(fixture());
    await expect(verifySolarResearchFigure({...figure,comparisonBundle:{...figure.comparisonBundle,tableCsv:'wrong'}})).rejects.toThrow();
    const input=fixture();input.rows[0].residual=1;
    await expect(make(input)).rejects.toThrow();
  });
  it('rejects overflowing uncertainty bounds instead of producing NaN/Infinity marks',async()=>{
    const input=fixture();input.rows[0].observed=Number.MAX_VALUE;input.rows[0].quotedSolutionError=Number.MAX_VALUE;
    await expect(make(input)).rejects.toThrow('range overflow');
  });
  it('does not turn source labels into executable markup or external references',async()=>{
    const input=fixture();input.observation.id='<script>alert(1)</script>\u0000';
    const figure=await make(input);
    expect(figure.figureSvg).not.toContain('<script');expect(figure.figureSvg).not.toContain('\u0000');
    expect(figure.figureSvg).not.toMatch(/(?:href=|foreignObject|<image|<style)/);
    expect(figure.figureManifestJson).toContain('script');
  });
  const present=existsSync('artifacts/research/g1-basu-author-intake-20260924/cdif.txt') &&
    existsSync('artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF');
  it.skipIf(!present)('exports the real 37-row observations with no synthetic model overlay',async()=>{
    const record=await loadLocalPrimaryObservation(process.cwd(),'2026-09-26T20:00:00Z');
    const figure=await make(record);const manifest=JSON.parse(figure.figureManifestJson);
    expect(figure.figureSvg.match(/data-series="observation"/g)).toHaveLength(37);
    expect(figure.figureSvg).not.toContain('data-series="primary-prediction"');
    expect(manifest.fixtureOnly).toBe(false);expect(manifest.rows).toBe(37);
    expect((await verifySolarResearchFigure(figure)).recordId).toBe(figure.comparisonBundle.recordId);
  });
});
