import type { Camera } from '../../types/colmap';
import { CameraModelId } from '../../types/cameraModelId';
import { nerfCameraToColmap } from './cameraMath';
import { dimension, finite, importError, object, positive, MAX_CAMERA_FRAMES,
  type ImportedImageBinding, type NormalizedCameraDataset } from './types';

export interface ResolvedCameraFrame {
  path: string;
  name: string;
  size?: { width: number; height: number };
  /** A listed images_N replacement whose pixels must match this downscale. */
  downscaleFactor?: number;
  mask?: ImportedImageBinding['mask'];
}
export type ResolveCameraFrame = (reference: string, frame: Record<string,unknown>, index: number)
  => Promise<ResolvedCameraFrame | null>;

const distortionKeys = ['k1','k2','k3','k4','p1','p2'] as const;

function field(root: Record<string,unknown>, frame: Record<string,unknown>, key: string, index: number): unknown {
  if (root[key] !== undefined && frame[key] !== undefined && root[key] !== frame[key]) {
    return importError('CONFLICTING_INTRINSICS',`frames[${index}].${key} conflicts with the global value.`);
  }
  return frame[key] === undefined ? root[key] : frame[key];
}

function angleFocal(value: unknown, size: number, fieldName: string, degrees = false): number {
  const angle = finite(value,fieldName)*(degrees ? Math.PI/180 : 1);
  if (angle <= 0 || angle >= Math.PI) return importError('INVALID_CALIBRATION',`${fieldName} must describe an angle between 0 and 180 degrees.`);
  return positive(size/(2*Math.tan(angle/2)), `${fieldName} derived focal`);
}

export function nerfTransformsSchema(value: Record<string,unknown>): NormalizedCameraDataset['schema'] {
  const frames = Array.isArray(value.frames) ? value.frames : [];
  if (value.camera_model !== undefined || frames.some(frame => frame && typeof frame === 'object' && 'camera_model' in frame)) return 'nerfstudio';
  const legacyFields=['fl_x','fl_y','cx','cy','camera_angle_y','x_fov','y_fov','is_fisheye',...distortionKeys];
  if (legacyFields.some(key=>value[key] !== undefined) || frames.some(frame => frame && typeof frame === 'object'
    && [...legacyFields,'camera_angle_x','camera_angle_y','w','h'].some(key=>key in frame))) return 'instant-ngp';
  return 'nerf-blender';
}

function requireExplicitCalibration(root: Record<string,unknown>, frame: Record<string,unknown>, index: number): void {
  if (field(root,frame,'camera_model',index) === undefined) return;
  for (const key of ['fl_x','fl_y','cx','cy','w','h']) {
    if (field(root,frame,key,index) === undefined) importError('INVALID_CALIBRATION', `frames[${index}].${key} is required for an explicitly calibrated camera.`);
  }
}

function nerfFrameLens(root: Record<string,unknown>, frame: Record<string,unknown>, index: number): Pick<Camera,'modelId'|'params'> {
  const get = (key: string) => field(root,frame,key,index);
  const params: number[]=[];
  if (get('distortion_params') !== undefined) return importError('UNREPRESENTABLE_DISTORTION','Use named distortion coefficients; distortion_params array order is not supported.');
  const rootDistortion = distortionKeys.some(key => root[key] !== undefined);
  if (rootDistortion && distortionKeys.some(key => frame[key] !== undefined)) {
    for (const key of distortionKeys) if (frame[key] !== undefined && frame[key] !== (root[key] ?? 0)) {
      return importError('CONFLICTING_INTRINSICS',`frames[${index}] mixes global and per-frame distortion.`);
    }
  }
  const coefficients = Object.fromEntries(distortionKeys.map(key => {
    const value=rootDistortion ? root[key] : frame[key];
    return [key,finite(value===undefined ? 0 : value,key)];
  }));
  for (const key of ['k5','k6','k7','k8']) if (get(key) !== undefined && finite(get(key),key) !== 0) return importError('UNREPRESENTABLE_DISTORTION',`${key} is not supported by this schema.`);
  for (const key of ['skew','s','b1','b2']) if (get(key) !== undefined && get(key) !== 0) return importError('UNREPRESENTABLE_DISTORTION',`${key} is not supported.`);
  const declared = get('camera_model');
  const fisheye = get('is_fisheye');
  if (fisheye !== undefined && typeof fisheye !== 'boolean') return importError('INVALID_CALIBRATION','is_fisheye must be a boolean.');
  if (fisheye !== undefined && declared !== undefined && fisheye !== (declared === 'OPENCV_FISHEYE')) return importError('CONFLICTING_INTRINSICS','Camera model conflicts with is_fisheye.');
  const model = declared ?? (fisheye ? 'OPENCV_FISHEYE' : distortionKeys.some(key => coefficients[key] !== 0) ? 'OPENCV' : 'PINHOLE');
  let modelId: Camera['modelId'];
  if (model === 'PINHOLE' || model === 'SIMPLE_PINHOLE') {
    if (distortionKeys.some(key => coefficients[key] !== 0)) return importError('UNREPRESENTABLE_DISTORTION','Pinhole camera has nonzero distortion.');
    modelId = CameraModelId.PINHOLE;
  } else if (model === 'OPENCV_FISHEYE') {
    if (coefficients.p1 || coefficients.p2) return importError('UNREPRESENTABLE_DISTORTION','Tangential fisheye distortion is unsupported.');
    modelId = CameraModelId.OPENCV_FISHEYE;
    params.push(coefficients.k1,coefficients.k2,coefficients.k3,coefficients.k4);
  } else if (model === 'OPENCV') {
    if (coefficients.k4) return importError('UNREPRESENTABLE_DISTORTION','Perspective polynomial k4 cannot be represented by COLMAP FULL_OPENCV.');
    modelId = coefficients.k3 ? CameraModelId.FULL_OPENCV : CameraModelId.OPENCV;
    params.push(coefficients.k1,coefficients.k2,coefficients.p1,coefficients.p2);
    if (coefficients.k3) params.push(coefficients.k3,0,0,0);
  } else return importError('UNSUPPORTED_CAMERA_MODEL',`Unsupported camera model: ${String(model)}`);
  return { modelId,params };
}

export function nerfFrameCamera(root: Record<string,unknown>, frame: Record<string,unknown>, index: number,
  size?: { width: number; height: number }): Omit<Camera,'cameraId'> {
  const get = (key: string) => field(root,frame,key,index);
  requireExplicitCalibration(root,frame,index);
  const lens=nerfFrameLens(root,frame,index);
  const w = get('w'), h = get('h');
  const width = dimension(w === undefined ? size?.width : w,`frames[${index}].w`);
  const height = dimension(h === undefined ? size?.height : h,`frames[${index}].h`);
  const focal = (axis: 'x'|'y', pixels: number): number | undefined => {
    const explicit = get('fl_'+axis), radians = get('camera_angle_'+axis), degrees = get(axis+'_fov');
    const fromRadians = radians !== undefined ? angleFocal(radians,pixels,'camera_angle_'+axis) : undefined;
    const fromDegrees = degrees !== undefined ? angleFocal(degrees,pixels,axis+'_fov',true) : undefined;
    if (fromRadians !== undefined && fromDegrees !== undefined && Math.abs(fromRadians-fromDegrees)>1e-4*Math.max(fromRadians,fromDegrees)) {
      return importError('CONFLICTING_INTRINSICS',`Conflicting radians/degrees FOV on ${axis}.`);
    }
    const fromAngle = fromDegrees ?? fromRadians;
    const value = explicit !== undefined ? positive(explicit,'fl_'+axis) : fromAngle;
    if (explicit !== undefined && fromAngle !== undefined && Math.abs((value!-fromAngle)/value!) > 1e-4) {
      return importError('CONFLICTING_INTRINSICS',`frames[${index}] has conflicting focal length/FOV on ${axis}.`);
    }
    return value;
  };
  const fx = focal('x',width), fy = focal('y',height);
  const hasModel = get('camera_model') !== undefined;
  if ((fx === undefined || fy === undefined) && hasModel) return importError('INVALID_CALIBRATION',`frames[${index}] requires both focal lengths.`);
  if (fx === undefined && fy === undefined) return importError('INVALID_CALIBRATION',`frames[${index}] has no focal length or FOV.`);
  const params = [fx ?? fy!,fy ?? fx!,get('cx') === undefined ? width/2 : finite(get('cx'),'cx'),
    get('cy') === undefined ? height/2 : finite(get('cy'),'cy'),...lens.params];
  return { modelId:lens.modelId,width,height,params };
}

export function isNerfTransforms(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const root = value as Record<string,unknown>;
  return 'frames' in root && (root.camera_angle_x !== undefined || root.fl_x !== undefined || root.camera_model !== undefined
    || Array.isArray(root.frames) && root.frames.some(frame => frame && typeof frame === 'object' && 'transform_matrix' in frame));
}

export async function normalizeNerfTransforms(value: unknown, resolve: ResolveCameraFrame, signal?: AbortSignal): Promise<NormalizedCameraDataset> {
  const root = object(value,'transforms');
  if (!Array.isArray(root.frames) || !root.frames.length) return importError('INVALID_METADATA','transforms.frames must be a nonempty array. Dictionary frames require a separate schema.');
  if (root.frames.length > MAX_CAMERA_FRAMES) return importError('IMPORT_LIMIT_EXCEEDED','Camera metadata has too many frames.');
  const result: NormalizedCameraDataset = { cameras:new Map(),images:new Map(),bindings:new Map(),diagnostics:[],
    schema: nerfTransformsSchema(root),
    metadataFrameCount:root.frames.length };
  const seen = new Set<string>(), resizedFactors = new Set<number>();
  const saved = Object.fromEntries(['applied_transform','applied_scale','aabb_scale','scale','offset'].filter(key => root[key] !== undefined).map(key => [key,root[key]]));
  if (Object.keys(saved).length) result.savedWorldMetadata = saved;
  for (let index=0; index<root.frames.length; index++) {
    if (index > 0 && index%256 === 0) await new Promise<void>(done => setTimeout(done,0));
    signal?.throwIfAborted();
    const frame = object(root.frames[index],`frames[${index}]`);
    requireExplicitCalibration(root,frame,index);
    for (const key of ['transform_matrix_start','transform_matrix_end','rolling_shutter','ftheta_p0','orthographic','equirectangular','latlong']) {
      if (frame[key] !== undefined || root[key] !== undefined) return importError('UNSUPPORTED_CAMERA_MODEL',`${key} cannot be represented by this camera importer.`);
    }
    const pose = nerfCameraToColmap(frame.transform_matrix,`frames[${index}].transform_matrix`);
    if (typeof frame.file_path !== 'string') return importError('INVALID_IMAGE_PATH',`frames[${index}].file_path must be a string.`);
    for (const key of ['w','h']) if (field(root,frame,key,index) !== undefined) dimension(field(root,frame,key,index),key);
    for (const key of ['fl_x','fl_y']) if (field(root,frame,key,index) !== undefined) positive(field(root,frame,key,index),key);
    for (const key of ['cx','cy',...distortionKeys]) if (field(root,frame,key,index) !== undefined) finite(field(root,frame,key,index),key);
    for (const key of ['k5','k6','k7','k8']) if (field(root,frame,key,index) !== undefined && finite(field(root,frame,key,index),key)!==0) importError('UNREPRESENTABLE_DISTORTION',`${key} is not supported.`);
    for (const axis of ['x','y']) {
      const radians=field(root,frame,'camera_angle_'+axis,index),degrees=field(root,frame,axis+'_fov',index);
      if(radians!==undefined) angleFocal(radians,1,'camera_angle_'+axis);
      if(degrees!==undefined) angleFocal(degrees,1,axis+'_fov',true);
    }
    const model=field(root,frame,'camera_model',index);
    if(model!==undefined && !['PINHOLE','SIMPLE_PINHOLE','OPENCV','OPENCV_FISHEYE'].includes(String(model))) importError('UNSUPPORTED_CAMERA_MODEL',`Unsupported camera model: ${String(model)}`);
    if (frame.time !== undefined) finite(frame.time,`frames[${index}].time`);
    // Validate declared calibration even for a definitively absent RGB reference.
    if (field(root,frame,'w',index) !== undefined && field(root,frame,'h',index) !== undefined) nerfFrameCamera(root,frame,index);
    else nerfFrameLens(root,frame,index);
    const resolved = await resolve(frame.file_path,frame,index);
    if (!resolved) {
      result.diagnostics.push({ code:'MISSING_RGB',severity:'warning',frameIndex:index,path:frame.file_path,message:`Missing RGB: ${frame.file_path}` });
      continue;
    }
    const key = resolved.name.toLowerCase();
    if (seen.has(key)) return importError('AMBIGUOUS_IMAGE_PATH',`Duplicate/case-colliding image name: ${resolved.name}`);
    seen.add(key);
    const camera = nerfFrameCamera(root,frame,index,resolved.size);
    if (resolved.downscaleFactor !== undefined) {
      const factor = resolved.downscaleFactor, size = resolved.size;
      if (result.schema !== 'nerfstudio' || !Number.isInteger(factor) || factor < 2 || factor > 64
        || !Number.isInteger(Math.log2(factor)) || !size
        || size.width < Math.floor(camera.width / factor) || size.width > Math.ceil(camera.width / factor)
        || size.height < Math.floor(camera.height / factor) || size.height > Math.ceil(camera.height / factor)) {
        return importError('IMAGE_DIMENSION_MISMATCH', `The images_${factor} photograph does not match the declared resize: ${resolved.path}.`);
      }
      camera.width = size.width;
      camera.height = size.height;
      camera.params = camera.params.map((value, offset) => offset < 4 ? value / factor : value);
      if (!resizedFactors.has(factor)) {
        resizedFactors.add(factor);
        result.diagnostics.push({ code: 'RESIZED_RGB', severity: 'info', frameIndex: index, path: resolved.path,
          message: `Using images_${factor}; focal lengths and principal points are scaled by 1/${factor}. Poses and distortion coefficients are retained.` });
      }
    }
    const id=index+1;
    result.cameras.set(id,{ cameraId:id,...camera });
    result.images.set(id,{ imageId:id,cameraId:id,name:resolved.name,...pose,points2D:[] });
    result.bindings.set(resolved.name,{ sourceImagePath:resolved.path,width:camera.width,height:camera.height,
      frameIndex:index,mask:resolved.mask,...(frame.time !== undefined ? { time:finite(frame.time,`frames[${index}].time`) } : {}) });
  }
  if (!result.images.size) return importError('MISSING_RGB','No supported RGB photographs were found for the selected scene. Check image paths and formats.');
  return result;
}
