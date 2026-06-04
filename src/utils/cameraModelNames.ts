/**
 * Camera model name lookups — single source of truth.
 *
 * Two flavours:
 *  - CAMERA_MODEL_NAMES: human-readable  ("Simple Pinhole")
 *  - CAMERA_MODEL_COLMAP_NAMES: COLMAP format ("SIMPLE_PINHOLE")
 */

import { CameraModelId } from '../types/colmap';

/** Human-readable camera model names for UI display */
export const CAMERA_MODEL_NAMES: Record<number, string> = {
  [CameraModelId.SIMPLE_PINHOLE]: 'Simple Pinhole',
  [CameraModelId.PINHOLE]: 'Pinhole',
  [CameraModelId.SIMPLE_RADIAL]: 'Simple Radial',
  [CameraModelId.RADIAL]: 'Radial',
  [CameraModelId.OPENCV]: 'OpenCV',
  [CameraModelId.OPENCV_FISHEYE]: 'OpenCV Fisheye',
  [CameraModelId.FULL_OPENCV]: 'Full OpenCV',
  [CameraModelId.FOV]: 'FOV',
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 'Simple Radial Fisheye',
  [CameraModelId.RADIAL_FISHEYE]: 'Radial Fisheye',
  [CameraModelId.THIN_PRISM_FISHEYE]: 'Thin Prism Fisheye',
  [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: 'Rad-Tan Thin Prism',
};

/** COLMAP-format camera model names for file export (matches COLMAP source) */
export const CAMERA_MODEL_COLMAP_NAMES: Record<number, string> = {
  [CameraModelId.SIMPLE_PINHOLE]: 'SIMPLE_PINHOLE',
  [CameraModelId.PINHOLE]: 'PINHOLE',
  [CameraModelId.SIMPLE_RADIAL]: 'SIMPLE_RADIAL',
  [CameraModelId.RADIAL]: 'RADIAL',
  [CameraModelId.OPENCV]: 'OPENCV',
  [CameraModelId.OPENCV_FISHEYE]: 'OPENCV_FISHEYE',
  [CameraModelId.FULL_OPENCV]: 'FULL_OPENCV',
  [CameraModelId.FOV]: 'FOV',
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 'SIMPLE_RADIAL_FISHEYE',
  [CameraModelId.RADIAL_FISHEYE]: 'RADIAL_FISHEYE',
  [CameraModelId.THIN_PRISM_FISHEYE]: 'THIN_PRISM_FISHEYE',
  [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: 'RAD_TAN_THIN_PRISM_FISHEYE',
};

/** Get human-readable camera model name with fallback */
export function getCameraModelName(modelId: number): string {
  return CAMERA_MODEL_NAMES[modelId] ?? `Unknown (${modelId})`;
}
