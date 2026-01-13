import { BinaryReader } from './BinaryReader';
import type { Camera } from '../types/colmap';
import { CameraModelId, CAMERA_MODEL_NUM_PARAMS } from '../types/colmap';

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
    const modelId = reader.readInt32() as CameraModelId;
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
  };

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    const cameraId = parseInt(parts[0]);
    const modelName = parts[1];
    const modelId = modelNameToId[modelName];

    if (modelId === undefined) {
      console.warn(`Unknown camera model: ${modelName}`);
      continue;
    }

    const width = parseInt(parts[2]);
    const height = parseInt(parts[3]);

    const params: number[] = [];
    for (let i = 4; i < parts.length; i++) {
      params.push(parseFloat(parts[i]));
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
