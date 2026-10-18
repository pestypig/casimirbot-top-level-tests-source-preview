import {expect,it} from 'vitest';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {registerSolarModelPlugins,solarModelPluginDescriptorSchema} from '../shared/solar-model-plugin';
import {SOLAR_MODEL_PLUGINS,SOLAR_SPECIALIST_PANELS} from '../client/src/lib/workstation/solarSpecialistPanels';

it('registers each existing panel exactly once with honest standalone maturity',()=>{
  expect(SOLAR_MODEL_PLUGINS).toHaveLength(6);
  expect(SOLAR_SPECIALIST_PANELS.map(panel=>panel.id)).toEqual([
    'star-hydrostatic','solar-globe','deepmix-solar','deepmix-sweetspot','deepmix-globe','ferrofluid-analogue']);
  for(const plugin of SOLAR_MODEL_PLUGINS){
    expect(solarModelPluginDescriptorSchema.parse(plugin)).toEqual(plugin);
    expect(plugin.sceneBinding).toBe('none');
    expect(plugin.acceptedInputs).toEqual(['operator-controls/1']);
    expect(plugin.scientificAdmission).toBe(false);
    expect(plugin.independentModelValidation).toBe(false);
    expect(existsSync(resolve(process.cwd(),plugin.implementationRef))).toBe(true);
  }
});
it('rejects duplicate plugins and false scene linkage',()=>{
  const base=SOLAR_MODEL_PLUGINS[0];
  expect(()=>registerSolarModelPlugins([base,base])).toThrow('SOLAR_MODEL_PLUGIN_DUPLICATE_ID');
  expect(()=>solarModelPluginDescriptorSchema.parse({...base,
    acceptedInputs:['solar-sphere-scene/1'],sceneBinding:'none'})).toThrow();
  expect(()=>solarModelPluginDescriptorSchema.parse({...base,sceneBinding:'solar_exact'})).toThrow();
  expect(()=>solarModelPluginDescriptorSchema.parse({...base,scientificAdmission:true})).toThrow();
});
