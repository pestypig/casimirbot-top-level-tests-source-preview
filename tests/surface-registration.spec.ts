import {describe,expect,it} from 'vitest';
import {surfaceMapFromFerrofluidManifestFrame} from '../shared/ferrofluid-camera-registration';
import {solarSurfaceImageMapFromWcs} from '../shared/solar-surface-registration';
import sunpyHmiWcsFixture from './fixtures/sunpy-hmi-wcs-registration.json';
import sunpyAia171WcsFixture from './fixtures/sunpy-aia171-wcs-registration.json';
import {
  poseFromQuaternionTranslation,
  flattenSurfaceRegion,
  remapSurfaceRgba,
  sphereEquirectangularChart,
  surfaceImageMapFromCamera,
  surfaceImageMapFromProjector,
  type Mat4,
  type SurfaceChart,
} from '../shared/surface-registration';

const identity:Mat4=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
const centerChart:SurfaceChart={width:1,height:1,points:new Float64Array([0,0,-1]),normals:new Float64Array([0,0,-1])};
const camera={imageWidth:200,imageHeight:200,fx:100,fy:100,cx:100,cy:100};
const translated=(x:number,z=0):Mat4=>[[1,0,0,x],[0,1,0,0],[0,0,1,z],[0,0,0,1]];

describe('shared surface registration geometry',()=>{
  it('keeps observer and target poses independent',()=>{
    const target=translated(0,5);
    const cameraPose=surfaceImageMapFromCamera(centerChart,camera,identity,target);
    const movedCamera=surfaceImageMapFromCamera(centerChart,camera,translated(0.5),target);
    const movedTarget=surfaceImageMapFromCamera(centerChart,camera,identity,translated(0.5,5));
    const bothMoved=surfaceImageMapFromCamera(centerChart,camera,translated(0.5),translated(0.5,5));
    expect(cameraPose.valid[0]).toBe(1);
    expect(cameraPose.sourceX[0]).toBeCloseTo(100,5);
    expect(movedCamera.sourceX[0]).toBeCloseTo(87.5,5);
    expect(movedTarget.sourceX[0]).toBeCloseTo(112.5,5);
    expect(bothMoved.sourceX[0]).toBeCloseTo(100,5);
  });

  it('builds a sphere chart and accepts caller-specific WCS projection and visibility',()=>{
    const chart=sphereEquirectangularChart(1,4,2);
    expect(chart.points).toHaveLength(24);
    const map=surfaceImageMapFromProjector(chart,100,80,_points=>({
      pixelX:Array.from({length:8},(_,index)=>index+10),
      pixelY:Array.from({length:8},()=>20),
      visible:Array.from({length:8},(_,index)=>index===3),
    }));
    expect([...map.valid].filter(Boolean)).toHaveLength(1);
    expect(map.valid[3]).toBe(1);
    expect(map.valid[2]).toBe(0);
  });

  it('resamples a chart point bilinearly and honors source masks',()=>{
    const chart:SurfaceChart={width:1,height:1,points:new Float64Array([0,0,0]),normals:new Float64Array([0,0,1])};
    const map=surfaceImageMapFromProjector(chart,2,2,()=>({pixelX:[0.5],pixelY:[0.5],visible:[1]}));
    const source={width:2,height:2,data:new Uint8ClampedArray([
      0,0,0,255, 100,100,100,255,
      200,200,200,255, 255,255,255,255,
    ])};
    const sampled=remapSurfaceRgba(source,map);
    expect(sampled.valid[0]).toBe(1);
    expect(sampled.image.data[0]).toBe(139);
    const masked=remapSurfaceRgba(source,map,new Uint8Array([1,1,1,0]));
    expect(masked.valid[0]).toBe(0);
    expect(masked.image.data[3]).toBe(0);
  });

  it('flattens a selected chart patch while keeping its validity mask',()=>{
    const chartImage={width:4,height:2,data:new Uint8ClampedArray([
      0,0,0,255, 100,100,100,255, 200,200,200,255, 255,255,255,255,
      0,0,0,255, 100,100,100,255, 200,200,200,255, 255,255,255,255,
    ])};
    const flattened=flattenSurfaceRegion(chartImage,new Uint8Array(8).fill(1),2,{x0:0,y0:0,x1:4,y1:2});
    expect(flattened.image.width).toBe(4);
    expect(flattened.image.height).toBe(2);
    expect(flattened.image.data[0]).toBe(25);
    expect(flattened.valid[2]).toBe(1);
    expect(flattened.valid[3]).toBe(0);
  });

  it('projects Carrington surface points through a per-frame solar TAN WCS and masks the far side',()=>{
    const chart=sphereEquirectangularChart(1,4,2,[Math.PI/4,Math.PI/4+2*Math.PI]);
    const map=solarSurfaceImageMapFromWcs(chart,101,101,{
      CTYPE1:'HPLN-TAN',CTYPE2:'HPLT-TAN',CUNIT1:'deg',CUNIT2:'deg',
      CRVAL1:0,CRVAL2:0,CRPIX1:51,CRPIX2:51,CD1_1:-0.01,CD1_2:0,CD2_1:0,CD2_2:0.01,
    },{observerCarringtonLongitudeDeg:90,observerCarringtonLatitudeDeg:0,
      observerDistanceMeters:215,solarRadiusMeters:1});
    expect(map.valid[0]).toBe(1);
    expect(map.sourceX[0]).toBeCloseTo(50,4);
    expect(map.sourceY[0]).toBeGreaterThan(50);
    expect(map.valid[2]).toBe(0);
    expect(()=>solarSurfaceImageMapFromWcs(chart,101,101,{CTYPE1:'HPLN-TAN',CTYPE2:'HPLT-TAN'},
      {observerCarringtonLongitudeDeg:90,observerCarringtonLatitudeDeg:0,observerDistanceMeters:1,solarRadiusMeters:1}))
      .toThrow(/CRVAL1/);
  });

  it('matches SunPy projection on its real HMI WCS sample',()=>{
    const {wcs_header,registration_geometry,chart:spec,expected}=sunpyHmiWcsFixture;
    const radians=spec.longitudeRangeDeg.map(value=>value*Math.PI/180) as [number,number];
    const chart=sphereEquirectangularChart(1,spec.width,spec.height,radians);
    const actual=solarSurfaceImageMapFromWcs(chart,192,192,wcs_header,registration_geometry);
    expect([...actual.valid]).toEqual(expected.visible);
    for(let index=0;index<expected.visible.length;index++)if(expected.visible[index]){
      expect(actual.sourceX[index]).toBeCloseTo(expected.pixelX[index],2);
      expect(actual.sourceY[index]).toBeCloseTo(expected.pixelY[index],2);
    }
  });

  it('matches SunPy projection on a real AIA 171 angstrom frame',()=>{
    const {wcs_header,registration_geometry,chart:spec,expected}=sunpyAia171WcsFixture;
    const longitudeRange=spec.longitudeRangeDeg.map(value=>value*Math.PI/180) as [number,number];
    const chart=sphereEquirectangularChart(1,spec.width,spec.height,longitudeRange);
    const actual=solarSurfaceImageMapFromWcs(chart,192,192,wcs_header,registration_geometry);
    expect([...actual.valid]).toEqual(expected.visible);
    for(let index=0;index<expected.visible.length;index++)if(expected.visible[index]){
      expect(actual.sourceX[index]).toBeCloseTo(expected.pixelX[index],2);
      expect(actual.sourceY[index]).toBeCloseTo(expected.pixelY[index],2);
    }
  });

  it('normalizes quaternion poses and rejects a singular quaternion',()=>{
    const pose=poseFromQuaternionTranslation([1,2,3],[0,0,0,2]);
    expect(pose).toEqual([[1,0,0,1],[0,1,0,2],[0,0,1,3],[0,0,0,1]]);
    expect(()=>poseFromQuaternionTranslation([0,0,0],[0,0,0,0])).toThrow(/nonzero/);
  });

  it('adapts a frame-indexed camera-registration manifest without collapsing target motion',()=>{
    const manifest={schema:'codex.shared-surface-registration.v1',
      source:{analysis_dimensions_px:[200,200]},
      camera_reconstruction:{camera_model:'SIMPLE_RADIAL',camera_model_parameters:{f:100,cx:100,cy:100,k:0}},
      frames:[{image:'frame_0010.jpg',time_s:3,source_sample_timeline_frame_1_based:10,
        camera_to_world:{translation_sfm_units:[0,0,0],quaternion_xyzw:[0,0,0,1]},
        target_pose:{world_from_target_sfm:[[1,0,0,0],[0,1,0,0],[0,0,1,5],[0,0,0,1]],motion_status:'measured'}}]};
    const result=surfaceMapFromFerrofluidManifestFrame(manifest,'frame_0010.jpg',centerChart);
    expect(result).toMatchObject({image:'frame_0010.jpg',timeS:3,sourceSampleTimelineFrame1Based:10,targetMotionStatus:'measured'});
    expect(result.map.valid[0]).toBe(1);
    expect(()=>surfaceMapFromFerrofluidManifestFrame(manifest,'frame_0011.jpg',centerChart)).toThrow(/absent/);
  });
});
