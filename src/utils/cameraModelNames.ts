/**
 * Camera model name lookups — derived from the registry (single source of truth).
 *
 * Two flavours:
 *  - CAMERA_MODEL_NAMES: human-readable  ("Simple Pinhole")
 *  - CAMERA_MODEL_COLMAP_NAMES: COLMAP format ("SIMPLE_PINHOLE")
 */

import { CAMERA_MODEL_DESCRIPTORS } from './cameraModelRegistry';

/** Human-readable camera model names for UI display */
export const CAMERA_MODEL_NAMES: Record<number, string> = Object.fromEntries(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.id, d.displayName])
);

/** COLMAP-format camera model names for file export (matches COLMAP source) */
export const CAMERA_MODEL_COLMAP_NAMES: Record<number, string> = Object.fromEntries(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.id, d.colmapName])
);

/** Get human-readable camera model name with fallback */
export function getCameraModelName(modelId: number): string {
  return CAMERA_MODEL_NAMES[modelId] ?? `Unknown (${modelId})`;
}
