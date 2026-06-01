import { BinaryReader } from './BinaryReader';
import type { Camera } from '../types/colmap';
import { CameraModelId, CAMERA_MODEL_NUM_PARAMS } from '../types/colmap';
import { parseCameraModelId } from '../utils/cameraModelPolicy';
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
    const numParams = CAMERA_MODEL_NUM_PARAMS[modelId] ?? 0;
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

/**
 * Parse cameras.txt text file
 *
 * Format:
 * # Camera list with one line of data per camera:
 * #   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]
 * # Number of cameras: N
 * 1 SIMPLE_PINHOLE 3072 2304 2559.81 1536 1152
 */
export function parseCamerasText(text: string): Map<number, Camera> {
  const cameras = new Map<number, Camera>();
  const lines = text.split('\n');

  const modelNameToId: Record<string, CameraModelId> = {
    'SIMPLE_PINHOLE': CameraModelId.SIMPLE_PINHOLE,
    'PINHOLE': CameraModelId.PINHOLE,
    'SIMPLE_RADIAL': CameraModelId.SIMPLE_RADIAL,
    'RADIAL': CameraModelId.RADIAL,
    'OPENCV': CameraModelId.OPENCV,
    'OPENCV_FISHEYE': CameraModelId.OPENCV_FISHEYE,
    'FULL_OPENCV': CameraModelId.FULL_OPENCV,
    'FOV': CameraModelId.FOV,
    'SIMPLE_RADIAL_FISHEYE': CameraModelId.SIMPLE_RADIAL_FISHEYE,
    'RADIAL_FISHEYE': CameraModelId.RADIAL_FISHEYE,
    'THIN_PRISM_FISHEYE': CameraModelId.THIN_PRISM_FISHEYE,
    'RAD_TAN_THIN_PRISM_FISHEYE': CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE,
  };

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    const cameraId = parseColmapIntegerToken(parts[0], { min: 0 });
    if (cameraId === null) continue;

    const modelName = parts[1];
    const modelId = modelNameToId[modelName];

    if (modelId === undefined) {
      appLogger.warn(`Unknown camera model: ${modelName}`);
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
