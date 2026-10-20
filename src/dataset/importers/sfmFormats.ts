import { CameraModelId } from '../../types/cameraModelId';
import { bundlerCameraToColmap, rodrigues, worldToCameraFromCenter, worldToCameraPose } from './cameraMath';
import { dimension, finite, importError, object, positive, MAX_CAMERA_FRAMES,
  type NormalizedCameraDataset } from './types';
import type { ResolveCameraFrame } from './nerfTransforms';
import { emptyCameraDataset as empty, addCameraFrame as add, finishCameraDataset as finish } from './cameraDatasetBuilder';
import { addOpenMvgStructure, openMvgId } from './openMvgStructure';
import { addOpenSfmPoints } from './openSfmPoints';
import type { Image } from '../../types/colmap';

export function isOpenSfm(value: unknown): boolean {
  const root = Array.isArray(value) ? value[0] : value;
  return Boolean(root && typeof root === 'object' && 'shots' in root && 'cameras' in root);
}

export async function normalizeOpenSfm(value: unknown, resolve: ResolveCameraFrame, signal?: AbortSignal, component=0): Promise<NormalizedCameraDataset> {
  const root = object(Array.isArray(value) ? value[component] : value,'OpenSfM reconstruction');
  const shots = Object.entries(object(root.shots,'shots'));
  const cameras = object(root.cameras,'cameras');
  const result = empty('opensfm',shots.length);
  for (const [index,[name,raw]] of shots.entries()) {
    if (index > 0 && index % 256 === 0) await new Promise<void>(done => setTimeout(done,0));
    signal?.throwIfAborted();
    const shot = object(raw,`shots.${name}`);
    const camera = object(cameras[String(shot.camera)],`cameras.${String(shot.camera)}`);
    if (camera.projection_type !== 'perspective') return importError('UNSUPPORTED_CAMERA_MODEL',`OpenSfM projection ${String(camera.projection_type)} is not supported; use perspective cameras.`);
    const width=dimension(camera.width,'width'), height=dimension(camera.height,'height');
    const f=positive(positive(camera.focal,'focal')*Math.max(width,height),'pixel focal');
    const pose=worldToCameraPose(rodrigues(shot.rotation,`shots.${name}.rotation`),shot.translation,`shots.${name}`);
    const resolved=await resolve(name,{ w:width,h:height },index);
    add(result,index,resolved,pose,{ modelId:CameraModelId.RADIAL,width,height,
      params:[f,width/2,height/2,finite(camera.k1 === undefined ? 0 : camera.k1,'k1'),finite(camera.k2 === undefined ? 0 : camera.k2,'k2')] },name);
  }
  await addOpenSfmPoints(root.points,result,signal);
  return finish(result);
}

export function isOpenMvg(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'views' in value && 'intrinsics' in value && 'extrinsics' in value);
}

function mvgValue(value: unknown, field: string): Record<string,unknown> {
  const row=object(value,field);
  return row.ptr_wrapper ? object(object(row.ptr_wrapper,field+'.ptr_wrapper').data,field+'.data') : row;
}

function mvgRows(value: unknown, field: string): Array<Record<string,unknown>> {
  if (!Array.isArray(value)) return importError('INVALID_METADATA',`${field} must be an array.`);
  return value.map((row,index) => object(row,`${field}[${index}]`));
}

function mvgIndex(value: unknown, field: string, unwrap: boolean): Map<string,Record<string,unknown>> {
  const index=new Map<string,Record<string,unknown>>();
  for (const row of mvgRows(value,field)) {
    const key=String(openMvgId(row.key,field));
    if (index.has(key)) return importError('INVALID_METADATA',`Duplicate OpenMVG ${field} ID: ${key}.`);
    index.set(key,unwrap ? mvgValue(row.value,field+'.value') : object(row.value,field+'.value'));
  }
  return index;
}

export async function normalizeOpenMvg(value: unknown, resolve: ResolveCameraFrame, signal?: AbortSignal): Promise<NormalizedCameraDataset> {
  const root=object(value,'sfm_data');
  const views=mvgRows(root.views,'views');
  const poses=mvgIndex(root.extrinsics,'extrinsics',true);
  const intrinsics=mvgIndex(root.intrinsics,'intrinsics',false);
  const result=empty('openmvg',views.length);
  const imagesByView=new Map<number,Image|undefined>();
  for (const [index,row] of views.entries()) {
    if (index > 0 && index % 256 === 0) await new Promise<void>(done => setTimeout(done,0));
    signal?.throwIfAborted();
    const viewId=openMvgId(row.key,'view');
    if (imagesByView.has(viewId)) return importError('INVALID_METADATA',`Duplicate OpenMVG view ID: ${viewId}.`);
    imagesByView.set(viewId,undefined);
    const view=mvgValue(row.value,'view');
    const intrinsic=intrinsics.get(String(view.id_intrinsic)), pose=poses.get(String(view.id_pose));
    if (!intrinsic || !pose) {
      result.diagnostics.push({ code:'UNREGISTERED_VIEW',severity:'info',frameIndex:index,message:`Unregistered view: ${String(view.filename)}` });
      continue;
    }
    const camera=mvgValue(intrinsic,'intrinsic');
    const kind=String(intrinsic.polymorphic_name);
    if (!['pinhole','pinhole_radial_k1','pinhole_radial_k3'].includes(kind)) return importError('UNSUPPORTED_CAMERA_MODEL',`Unsupported OpenMVG intrinsic: ${kind}`);
    const width=dimension(camera.width,'width'),height=dimension(camera.height,'height');
    const f=positive(camera.focal_length,'focal_length');
    if (!Array.isArray(camera.principal_point) || camera.principal_point.length !== 2) return importError('INVALID_CALIBRATION','principal_point must have two numbers.');
    const [cx,cy]=camera.principal_point.map(v => finite(v,'principal_point'));
    const raw=kind==='pinhole_radial_k3' ? camera.disto_k3 : kind==='pinhole_radial_k1' ? camera.disto_k1 : [0,0,0];
    if (!Array.isArray(raw) || raw.length !== (kind==='pinhole_radial_k1' ? 1 : 3)) return importError('INVALID_CALIBRATION','Invalid OpenMVG radial coefficients.');
    const radial=raw.map(v => finite(v,'radial'));
    const params=[f,f,cx,cy,radial[0],radial[1] ?? 0,0,0,radial[2] ?? 0,0,0,0];
    if (typeof view.filename !== 'string') return importError('INVALID_IMAGE_PATH','OpenMVG view has no filename.');
    const path = typeof view.local_path === 'string' && view.local_path ? `${view.local_path}/${view.filename}` : view.filename;
    const resolved=await resolve(path,{ w:width,h:height },index);
    add(result,index,resolved,worldToCameraFromCenter(pose.rotation,pose.center,'pose'),
      { modelId:CameraModelId.FULL_OPENCV,width,height,params },path);
    imagesByView.set(viewId,result.images.get(index+1));
  }
  await addOpenMvgStructure(root.structure,result,imagesByView,signal);
  return finish(result);
}

export function bundlerImageList(text: string): string[] {
  return text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const quoted=/^\s*"([^"]+)"/.exec(line);
    return quoted?.[1] ?? line.trim().split(/\s+/)[0];
  });
}

export async function normalizeBundler(text: string, names: readonly string[], resolve: ResolveCameraFrame, signal?: AbortSignal): Promise<NormalizedCameraDataset> {
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if (!/^#\s*Bundle file v0\.3/.test(lines[0])) return importError('INVALID_METADATA','Expected Bundler bundle.out version 0.3.');
  const count=Number(lines[1]?.trim().split(/\s+/)[0]);
  if (!Number.isSafeInteger(count) || count <= 0 || count > MAX_CAMERA_FRAMES) return importError('INVALID_METADATA','Invalid Bundler camera count.');
  if (names.length !== count) return importError('INVALID_IMAGE_ORDER',`Bundler needs an ordered image list with exactly ${count} entries; found ${names.length}.`);
  const result=empty('bundler',count);
  const numbers=(line: string | undefined, size: number, field: string) => {
    const parts=line?.trim().split(/\s+/).map(Number);
    if (!parts || parts.length !== size || parts.some(v => !Number.isFinite(v))) return importError('INVALID_METADATA',`Invalid ${field}.`);
    return parts;
  };
  for (let index=0; index<count; index++) {
    if (index > 0 && index % 256 === 0) await new Promise<void>(done => setTimeout(done,0));
    signal?.throwIfAborted();
    const at=2+index*5;
    const [f,k1,k2]=numbers(lines[at],3,`camera ${index} intrinsics`);
    const r=[0,1,2].map(i => numbers(lines[at+1+i],3,`camera ${index} rotation`));
    const t=numbers(lines[at+4],3,`camera ${index} translation`);
    if (f === 0) {
      result.diagnostics.push({ code:'UNREGISTERED_VIEW',severity:'info',frameIndex:index,message:`Unregistered Bundler camera ${index}` });
      continue;
    }
    positive(f,'focal');
    const pose=bundlerCameraToColmap(r,t,`camera ${index}`);
    const resolved=await resolve(names[index],{},index);
    if (!resolved) {
      result.diagnostics.push({ code:'MISSING_RGB',severity:'warning',frameIndex:index,path:names[index],message:`Missing RGB: ${names[index]}` });
      continue;
    }
    if (!resolved.size) return importError('INVALID_CALIBRATION',`Cannot read dimensions for ${names[index]}.`);
    const {width,height}=resolved.size;
    add(result,index,resolved,pose,{ modelId:CameraModelId.RADIAL,width,height,params:[f,width/2,height/2,k1,k2] },names[index]);
  }
  return finish(result);
}
