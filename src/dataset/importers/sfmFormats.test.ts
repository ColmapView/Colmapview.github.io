import { describe, expect, it } from 'vitest';
import { normalizeOpenSfm, normalizeOpenMvg, normalizeBundler, bundlerImageList } from './sfmFormats';
import type { ResolveCameraFrame } from './nerfTransforms';
import { CameraModelId } from '../../types/cameraModelId';
const resolve: ResolveCameraFrame = async path => ({ path, name: path, size: { width: 640, height: 480 } });
const perspective = { projection_type: 'perspective', width: 640, height: 480, focal: .75, k1: .1, k2: -.02 };
const openMvgStructure = () => ({
  views:[{key:7,value:{filename:'a.jpg',id_pose:42,id_intrinsic:9}},
    {key:2,value:{filename:'b.jpg',id_pose:3,id_intrinsic:9}},
    {key:8,value:{filename:'unregistered.jpg',id_pose:99,id_intrinsic:9}}],
  intrinsics:[{key:9,value:{polymorphic_name:'pinhole',ptr_wrapper:{data:{width:640,height:480,focal_length:500,principal_point:[320,240]}}}}],
  extrinsics:[{key:42,value:{rotation:[[1,0,0],[0,1,0],[0,0,1]],center:[0,0,0]}},
    {key:3,value:{rotation:[[1,0,0],[0,1,0],[0,0,1]],center:[1,0,0]}}],
  structure:[{key:18355,value:{X:[0,0,2],observations:[
    {key:7,value:{id_feat:1_000_000_000,x:[323,244]}},{key:2,value:{id_feat:55,x:[70,240]}}]}},
  {key:0,value:{X:[1,0,2],observations:[
    {key:7,value:{id_feat:0,x:[570,240]}},{key:2,value:{id_feat:11,x:[320,240]}},{key:8,value:{id_feat:0,x:[320,240]}}]}}],
});

describe('SfM camera adapters', () => {
  it('preserves OpenMVG landmarks and compacts feature IDs into reciprocal COLMAP tracks using view IDs',async()=>{
    const result=await normalizeOpenMvg(openMvgStructure(),resolve);
    expect([...result.points3D!.keys()]).toEqual([18355n,0n]);
    expect(result.points3D!.get(18355n)).toEqual({point3DId:18355n,xyz:[0,0,2],rgb:[192,192,192],error:2.5,
      track:[{imageId:1,point2DIdx:0},{imageId:2,point2DIdx:0}]});
    expect(result.points3D!.get(0n)?.track).toEqual([{imageId:1,point2DIdx:1},{imageId:2,point2DIdx:1}]);
    expect(result.images.get(1)?.points2D).toEqual([{xy:[323,244],point3DId:18355n},{xy:[570,240],point3DId:0n}]);
    expect(result.images.get(2)?.points2D).toEqual([{xy:[70,240],point3DId:18355n},{xy:[320,240],point3DId:0n}]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'OMITTED_POINT_OBSERVATIONS'}));
  });
  it('keeps source geometry and stable image IDs when a photograph is missing',async()=>{
    const input=openMvgStructure();
    input.structure.push({key:27,value:{X:[0,1,2],observations:[{key:7,value:{id_feat:22,x:[320,490]}}]}});
    const result=await normalizeOpenMvg(input,async(...args)=>args[0]==='a.jpg' ? null : resolve(...args));
    expect([...result.images.keys()]).toEqual([2]);
    expect(result.points3D!.size).toBe(3);
    expect(result.points3D!.get(18355n)?.track).toEqual([{imageId:2,point2DIdx:0}]);
    expect(result.points3D!.get(27n)).toMatchObject({xyz:[0,1,2],track:[],error:0});
    expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'UNAVAILABLE_POINT_ERROR'}));
  });
  it.each([0,-2])('retains geometry at camera depth %s without inventing a projectable reprojection error',async depth=>{
    const input=openMvgStructure();input.structure[0].value.X=[0,0,depth];
    const result=await normalizeOpenMvg(input,resolve);
    expect(result.points3D!.get(18355n)).toMatchObject({xyz:[0,0,depth],error:0});
    expect(result.points3D!.get(18355n)?.track).toHaveLength(2);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({code:'UNAVAILABLE_POINT_ERROR'}));
  });
  it.each([
    ['duplicate view IDs',(data:ReturnType<typeof openMvgStructure>)=>data.views.push(data.views[0])],
    ['duplicate landmark IDs',(data:ReturnType<typeof openMvgStructure>)=>data.structure.push(data.structure[0])],
    ['negative landmark ID',(data:ReturnType<typeof openMvgStructure>)=>{data.structure[0].key=-1;}],
    ['nonfinite geometry',(data:ReturnType<typeof openMvgStructure>)=>{data.structure[0].value.X[0]=Infinity;}],
    ['invalid observation coordinates',(data:ReturnType<typeof openMvgStructure>)=>{data.structure[0].value.observations[0].value.x=[1];}],
    ['unknown view',(data:ReturnType<typeof openMvgStructure>)=>{data.structure[0].value.observations[0].key=999;}],
    ['duplicate observation view',(data:ReturnType<typeof openMvgStructure>)=>data.structure[0].value.observations.push(data.structure[0].value.observations[0])],
    ['fractional feature ID',(data:ReturnType<typeof openMvgStructure>)=>{data.structure[0].value.observations[0].value.id_feat=.5;}],
    ['feature assigned twice',(data:ReturnType<typeof openMvgStructure>)=>{data.structure[1].value.observations[0].value.id_feat=1_000_000_000;}],
  ] as const)('rejects OpenMVG %s instead of silently corrupting tracks',async(_name,mutate)=>{
    const input=openMvgStructure();mutate(input);
    await expect(normalizeOpenMvg(input,resolve)).rejects.toThrow(/OpenMVG/);
  });
  it('observes cancellation while importing OpenMVG structure',async()=>{
    const input=openMvgStructure(),controller=new AbortController();
    input.structure=Array.from({length:2000},(_,index)=>({key:index,value:{X:[0,0,2],observations:[{key:7,value:{id_feat:index,x:[320,240]}}]}}));
    setTimeout(()=>controller.abort(),0);
    await expect(normalizeOpenMvg(input,resolve,controller.signal)).rejects.toMatchObject({name:'AbortError'});
  });
  it.each(['intrinsics','extrinsics'] as const)('rejects duplicate OpenMVG %s IDs instead of replacing a source record',async field=>{
    const input={
      views:[{key:0,value:{filename:'a.jpg',id_pose:42,id_intrinsic:9}}],
      intrinsics:[{key:9,value:{polymorphic_name:'pinhole',ptr_wrapper:{data:{width:640,height:480,focal_length:500,principal_point:[320,240]}}}}],
      extrinsics:[{key:42,value:{rotation:[[1,0,0],[0,1,0],[0,0,1]],center:[1,2,3]}}],
    };
    if (field==='intrinsics') input.intrinsics.push(input.intrinsics[0]);
    else input.extrinsics.push(input.extrinsics[0]);
    await expect(normalizeOpenMvg(input,resolve)).rejects.toThrow(/Duplicate OpenMVG/);
  });
  it('uses OpenSfM normalized focal, Rodrigues world-to-camera rotation and translation', async () => {
    const result = await normalizeOpenSfm([{ cameras: { c: perspective }, shots: { 'z.jpg': { camera: 'c', rotation: [0,0,Math.PI/2], translation: [1,2,3] } } }], resolve);
    expect(result.cameras.get(1)?.params).toEqual([480,320,240,.1,-.02]);
    expect(result.images.get(1)?.tvec).toEqual([1,2,3]);
    expect(result.images.get(1)?.qvec[0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(result.images.get(1)?.qvec[3]).toBeCloseTo(Math.SQRT1_2, 12);
  });
  it('selects an OpenSfM component without merging coordinate systems', async () => {
    const component = (name: string) => ({ cameras: { c: perspective }, shots: { [name]: { camera: 'c', rotation: [0,0,0], translation: [0,0,0] } } });
    const result = await normalizeOpenSfm([component('a.jpg'),component('b.jpg')], resolve, undefined, 1);
    expect([...result.images.values()].map(image => image.name)).toEqual(['b.jpg']);
    await expect(normalizeOpenSfm({ cameras: {c:{...perspective,projection_type:'spherical'}}, shots: {'a.jpg':{camera:'c'}} },resolve)).rejects.toThrow(/projection/);
  });
  it('joins OpenMVG IDs and maps polynomial k3 to a zero-denominator FULL_OPENCV camera', async () => {
    const result = await normalizeOpenMvg({
      views: [{key:7,value:{ptr_wrapper:{data:{filename:'a.jpg',local_path:'nested',id_pose:42,id_intrinsic:9}}}}, {key:8,value:{filename:'unregistered.jpg',id_pose:99,id_intrinsic:9}}],
      intrinsics: [{key:9,value:{polymorphic_name:'pinhole_radial_k3',ptr_wrapper:{data:{width:640,height:480,focal_length:500,principal_point:[0,250],disto_k3:[.1,.02,.003]}}}}],
      extrinsics: [{key:42,value:{rotation:[[0,-1,0],[1,0,0],[0,0,1]],center:[1,2,3]}}],
    },resolve);
    expect(result.cameras.get(1)).toMatchObject({modelId:CameraModelId.FULL_OPENCV,params:[500,500,0,250,.1,.02,0,0,.003,0,0,0]});
    expect(result.images.get(1)).toMatchObject({name:'nested/a.jpg',points2D:[]});
    result.images.get(1)!.tvec.forEach((value,index)=>expect(value).toBeCloseTo([2,-1,-3][index],12));
    expect(result.diagnostics[0].code).toBe('UNREGISTERED_VIEW');
  });
  it('requires Bundler original ordering and flips world-to-camera R and t on the left', async () => {
    const text = '# Bundle file v0.3\n2 0\n500 .1 -.02\n1 0 0\n0 1 0\n0 0 1\n1 2 3\n500 0 0\n1 0 0\n0 1 0\n0 0 1\n0 0 0\n';
    const names = bundlerImageList('"z first.jpg" 0 500\na.jpg 0 500\n');
    const result = await normalizeBundler(text,names,resolve);
    expect(result.images.get(1)).toMatchObject({name:'z first.jpg',tvec:[1,-2,-3]});
    expect(result.images.get(1)?.qvec).toEqual([0,1,0,0]);
    await expect(normalizeBundler(text,['a.jpg'],resolve)).rejects.toThrow(/exactly 2/);
  });
});
