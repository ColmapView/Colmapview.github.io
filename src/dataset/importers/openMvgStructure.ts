import { Quaternion, Vector3 } from 'three';
import type { Image, Point3D, Point3DId } from '../../types/colmap';
import { getCameraIntrinsics } from '../../utils/cameraIntrinsics';
import { distortNormalized } from '../../utils/cameraUndistortion';
import { importError, object, type NormalizedCameraDataset } from './types';

export function openMvgId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return importError('INVALID_METADATA', `OpenMVG ${field} IDs must be nonnegative integers.`);
  }
  return value;
}

function coordinates(value: unknown, length: number, field: string): number[] {
  if (!Array.isArray(value) || value.length !== length || value.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    return importError('INVALID_METADATA', `OpenMVG ${field} must have ${length} finite coordinates.`);
  }
  return value;
}

/** OpenMVG observations refer to view IDs, independently of pose IDs and feature IDs. */
export async function addOpenMvgStructure(value: unknown, result: NormalizedCameraDataset,
  views: ReadonlyMap<number, Image | undefined>, signal?: AbortSignal): Promise<void> {
  if (value === undefined) return;
  if (!Array.isArray(value)) return importError('INVALID_METADATA', 'OpenMVG structure must be an array.');
  const points=new Map<Point3DId,Point3D>();
  const features=new Map<number,Set<number>>();
  const projections=new Map([...views].flatMap(([id,image]) => {
    if (!image) return [];
    const camera=result.cameras.get(image.cameraId)!;
    return [[id,{ image, camera, intrinsics:getCameraIntrinsics(camera),
      rotation:new Quaternion(image.qvec[1],image.qvec[2],image.qvec[3],image.qvec[0]),
      translation:new Vector3(...image.tvec) }] as const];
  }));
  const cameraPoint=new Vector3();
  let steps=0,omitted=0,unknownErrors=0;
  for (const raw of value) {
    signal?.throwIfAborted();
    const row=object(raw,'structure'), landmark=object(row.value,'structure.value');
    const point3DId=BigInt(openMvgId(row.key,'landmark'));
    if (points.has(point3DId)) return importError('INVALID_METADATA', `Duplicate OpenMVG landmark ID: ${point3DId}.`);
    const xyz=coordinates(landmark.X,3,'landmark.X') as [number,number,number];
    if (!Array.isArray(landmark.observations)) return importError('INVALID_METADATA','OpenMVG landmark observations must be an array.');
    const point: Point3D={point3DId,xyz,rgb:[192,192,192],error:0,track:[]};
    const seenViews=new Set<number>();
    let errorCount=0;
    for (const rawObservation of landmark.observations) {
      if (++steps % 1024 === 0) {
        await new Promise<void>(done => setTimeout(done,0));
        signal?.throwIfAborted();
      }
      const observation=object(rawObservation,'observation'), data=object(observation.value,'observation.value');
      const viewId=openMvgId(observation.key,'observation view'), featureId=openMvgId(data.id_feat,'feature');
      if (!views.has(viewId)) return importError('INVALID_METADATA',`OpenMVG observation refers to unknown view ${viewId}.`);
      if (seenViews.has(viewId)) return importError('INVALID_METADATA',`Duplicate OpenMVG observation for landmark ${point3DId}, view ${viewId}.`);
      seenViews.add(viewId);
      let seenFeatures=features.get(viewId);
      if (!seenFeatures) { seenFeatures=new Set(); features.set(viewId,seenFeatures); }
      if (seenFeatures.has(featureId)) return importError('INVALID_METADATA',`OpenMVG feature ${featureId} in view ${viewId} belongs to multiple landmarks.`);
      seenFeatures.add(featureId);
      const xy=coordinates(data.x,2,'observation.x') as [number,number];
      const projection=projections.get(viewId);
      // Retain all source geometry, but never create tracks to skipped views.
      if (!projection) { omitted++; continue; }
      const {image,camera,intrinsics,rotation,translation}=projection;
      // Compact the observed features; source id_feat can be sparse or very large.
      point.track.push({imageId:image.imageId,point2DIdx:image.points2D.length});
      image.points2D.push({xy,point3DId});
      cameraPoint.set(...xyz).applyQuaternion(rotation).add(translation);
      if (cameraPoint.z <= 0) continue;
      const distorted=distortNormalized({x:cameraPoint.x/cameraPoint.z,y:cameraPoint.y/cameraPoint.z},intrinsics,camera.modelId);
      const error=Math.hypot(distorted.x*intrinsics.fx+intrinsics.cx-xy[0],distorted.y*intrinsics.fy+intrinsics.cy-xy[1]);
      if (Number.isFinite(error)) point.error+=(error-point.error)/++errorCount;
    }
    if (!errorCount) unknownErrors++;
    points.set(point3DId,point);
    if (++steps % 1024 === 0) await new Promise<void>(done => setTimeout(done,0));
  }
  signal?.throwIfAborted();
  result.points3D=points;
  if (points.size) result.diagnostics.push({code:'UNCOLORED_STRUCTURE',severity:'info',
    message:'OpenMVG structure has no point colors; neutral gray is used. Reprojection errors are computed from retained observations.'});
  if (omitted) result.diagnostics.push({code:'OMITTED_POINT_OBSERVATIONS',severity:'info',
    message:`Omitted ${omitted} point observations in views without an imported camera/photo binding; source 3D points are retained.`});
  if (unknownErrors) result.diagnostics.push({code:'UNAVAILABLE_POINT_ERROR',severity:'info',
    message:`${unknownErrors} points have no projectable retained observations; their unavailable reprojection errors use zero.`});
}
