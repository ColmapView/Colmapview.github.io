import type { Camera } from '../../types/colmap';
import type { ColmapPose } from './cameraMath';
import type { ResolvedCameraFrame } from './nerfTransforms';
import { importError, MAX_CAMERA_FRAMES, type CameraDatasetSchema, type NormalizedCameraDataset } from './types';

export function emptyCameraDataset(schema: CameraDatasetSchema, count: number): NormalizedCameraDataset {
  if (!count || count > MAX_CAMERA_FRAMES) return importError('IMPORT_LIMIT_EXCEEDED', 'Selected reconstruction has no views or too many views.');
  return { schema, metadataFrameCount: count, cameras: new Map(), images: new Map(), bindings: new Map(), diagnostics: [] };
}

const bindingNames = new WeakMap<NormalizedCameraDataset, Set<string>>();

export function addCameraFrame(result: NormalizedCameraDataset, index: number, resolved: ResolvedCameraFrame | null,
  pose: ColmapPose, camera: Omit<Camera, 'cameraId'>, sourcePath: string): void {
  if (!resolved) {
    result.diagnostics.push({ code: 'MISSING_RGB', severity: 'warning', frameIndex: index, path: sourcePath, message: `Missing RGB: ${sourcePath}` });
    return;
  }
  let seen = bindingNames.get(result);
  if (!seen) { seen = new Set(); bindingNames.set(result, seen); }
  if (seen.has(resolved.name.toLowerCase())) return importError('AMBIGUOUS_IMAGE_PATH', `Duplicate/case-colliding image name: ${resolved.name}`);
  seen.add(resolved.name.toLowerCase());
  const id = index + 1;
  result.cameras.set(id, { cameraId: id, ...camera });
  result.images.set(id, { imageId: id, cameraId: id, name: resolved.name, ...pose, points2D: [] });
  result.bindings.set(resolved.name, { sourceImagePath: resolved.path, width: camera.width, height: camera.height,
    frameIndex: index, mask: resolved.mask });
}

export function finishCameraDataset(result: NormalizedCameraDataset): NormalizedCameraDataset {
  if (!result.images.size) return importError('MISSING_RGB', 'The selected reconstruction has no registered views with photographs.');
  return result;
}
