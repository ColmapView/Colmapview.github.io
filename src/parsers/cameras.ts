import { BinaryReader } from './BinaryReader';
import type { Camera } from '../types/colmap';
import { parseCameraModelId } from '../utils/cameraModelPolicy';
import { getCameraModelNumParams, colmapNameToModelId } from '../utils/cameraModelRegistry';
import { appLogger } from '../utils/logger';
import {
  parseColmapIntegerToken,
  parseColmapNumberTokens,
} from './colmapTextTokens';

/**
 * Parse cameras.bin binary file
 *
 * Format:
 * - uint64: num_cameras
 * - Per camera:
 *   - uint32: camera_id
 *   - int32: model_id (camera model enum)
 *   - uint64: width
 *   - uint64: height
 *   - double[]: params (variable count based on model)
 */
export function parseCamerasBinary(buffer: ArrayBuffer): Map<number, Camera> {
  const reader = new BinaryReader(buffer);
  const cameras = new Map<number, Camera>();

  const numCameras = reader.readUint64AsNumber();

  for (let i = 0; i < numCameras; i++) {
    const cameraId = reader.readUint32();
    const modelId = parseCameraModelId(reader.readInt32(), `binary camera ${cameraId}`);
    const width = reader.readUint64AsNumber();
    const height = reader.readUint64AsNumber();

    // Get number of parameters for this camera model
    const numParams = getCameraModelNumParams(modelId);
    const params: number[] = [];
    for (let j = 0; j < numParams; j++) {
      params.push(reader.readFloat64());
    }

    cameras.set(cameraId, {
      cameraId,
      modelId,
      width,
      height,
      params,
    });
  }

  return cameras;
}

/** A camera record skipped by {@link parseCamerasText} because its model is unknown. */
export interface SkippedCameraRecord {
  /** 1-based line number within the source text where the camera was declared. */
  line: number;
  /** The unrecognized COLMAP model name, verbatim from the file. */
  modelName: string;
}

export interface ParseCamerasTextOptions {
  /**
   * Called once per camera skipped due to an unknown model. The camera is still
   * omitted from the returned map (partial loads stay useful); callers can use
   * these records to surface an aggregate notification to the user.
   */
  onSkip?: (record: SkippedCameraRecord) => void;
}

/**
 * Parse cameras.txt text file
 *
 * Format:
 * # Camera list with one line of data per camera:
 * #   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]
 * # Number of cameras: N
 * 1 SIMPLE_PINHOLE 3072 2304 2559.81 1536 1152
 *
 * Cameras with an unknown model name are skipped (so partial reconstructions
 * still load); each skip is logged and reported through `options.onSkip`.
 */
export function parseCamerasText(
  text: string,
  options?: ParseCamerasTextOptions
): Map<number, Camera> {
  const cameras = new Map<number, Camera>();
  const lines = text.split('\n');

  for (const [lineIndex, line] of lines.entries()) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    const cameraId = parseColmapIntegerToken(parts[0], { min: 0 });
    if (cameraId === null) continue;

    const modelName = parts[1];
    const modelId = colmapNameToModelId(modelName);

    if (modelId === undefined) {
      appLogger.warn(`Unknown camera model: ${modelName}`);
      options?.onSkip?.({ line: lineIndex + 1, modelName });
      continue;
    }

    const width = parseColmapIntegerToken(parts[2], { min: 0 });
    const height = parseColmapIntegerToken(parts[3], { min: 0 });
    const params = parseColmapNumberTokens(parts.slice(4));

    if (width === null || height === null || params === null) continue;

    cameras.set(cameraId, {
      cameraId,
      modelId,
      width,
      height,
      params,
    });
  }

  return cameras;
}
