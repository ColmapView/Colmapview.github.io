import { CameraModelId } from '../../types/cameraModelId';
import { worldToCameraFromCenter, validateRotation } from './cameraMath';
import { emptyCameraDataset, addCameraFrame, finishCameraDataset } from './cameraDatasetBuilder';
import type { ResolveCameraFrame } from './nerfTransforms';
import { dimension, finite, importError, object, positive } from './types';

export function isGaussianCameraJson(value: unknown): boolean {
  const first = Array.isArray(value) ? value[0] : undefined;
  return Boolean(first && typeof first === 'object' && 'img_name' in first && 'position' in first && 'rotation' in first);
}

/** Standard 3DGS JSON stores an OpenCV camera-to-world rotation and camera centre. */
export async function normalizeGaussianCameraJson(value: unknown, resolve: ResolveCameraFrame, signal?: AbortSignal) {
  if (!Array.isArray(value)) return importError('INVALID_METADATA', '3DGS cameras.json must be an array.');
  const result = emptyCameraDataset('gaussian-splatting', value.length);
  const ids = new Set<number>();
  for (let index = 0; index < value.length; index++) {
    if (index > 0 && index % 256 === 0) await new Promise<void>(done => setTimeout(done, 0));
    signal?.throwIfAborted();
    const frame = object(value[index], `cameras[${index}]`);
    if (frame.id !== undefined) {
      if (typeof frame.id !== 'number' || !Number.isSafeInteger(frame.id) || frame.id < 0 || ids.has(frame.id)) {
        return importError('INVALID_METADATA', '3DGS camera IDs must be unique nonnegative integers.');
      }
      ids.add(frame.id);
    }
    if (typeof frame.img_name !== 'string' || !frame.img_name.trim()) return importError('INVALID_IMAGE_PATH', '3DGS img_name must be a nonempty string.');
    if (frame.camera_model !== undefined && !['PINHOLE', 'SIMPLE_PINHOLE'].includes(String(frame.camera_model))) {
      return importError('UNSUPPORTED_CAMERA_MODEL', '3DGS camera JSON supports pinhole calibration only.');
    }
    for (const key of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'p1', 'p2', 'skew', 's', 'b1', 'b2']) {
      if (frame[key] !== undefined && finite(frame[key], key) !== 0) return importError('UNREPRESENTABLE_DISTORTION', `3DGS ${key} cannot be discarded.`);
    }
    if (frame.is_fisheye !== undefined && typeof frame.is_fisheye !== 'boolean') return importError('INVALID_CALIBRATION', 'is_fisheye must be a boolean.');
    if (frame.distortion_params !== undefined || frame.is_fisheye === true) return importError('UNSUPPORTED_CAMERA_MODEL', 'Distorted 3DGS camera JSON requires a separately supported schema.');
    const width = dimension(frame.width, 'width'), height = dimension(frame.height, 'height');
    const r = validateRotation(frame.rotation, `cameras[${index}].rotation`);
    const pose = worldToCameraFromCenter(r[0].map((_, column) => r.map(row => row[column])), frame.position);
    const camera = { modelId: CameraModelId.PINHOLE, width, height,
      params: [positive(frame.fx, 'fx'), positive(frame.fy, 'fy'), frame.cx === undefined ? width / 2 : finite(frame.cx, 'cx'),
        frame.cy === undefined ? height / 2 : finite(frame.cy, 'cy')] };
    const resolved = await resolve(frame.img_name, { ...frame, w: width, h: height }, index);
    addCameraFrame(result, index, resolved, pose, camera, frame.img_name);
  }
  return finishCameraDataset(result);
}
