import type { CameraModelId } from '../types/cameraModelId';
import { CAMERA_MODEL_DESCRIPTORS } from './cameraModelRegistry';

export const CAMERA_MODEL_NUM_PARAMS: Record<CameraModelId, number> = Object.fromEntries(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.id, d.paramNames.length])
) as Record<CameraModelId, number>;
