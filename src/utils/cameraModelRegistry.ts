import { CameraModelId } from '../types/cameraModelId';

export type CameraModelFamily = 'pinhole' | 'fisheye' | 'spherical';

export interface CameraModelDescriptor {
  id: CameraModelId;
  /** Exact token used in COLMAP cameras.txt / source enum, e.g. "OPENCV". */
  colmapName: string;
  /** Human-readable label for the UI, e.g. "OpenCV". */
  displayName: string;
  /** Ordered parameter names; length === number of params for the model. */
  paramNames: readonly string[];
  family: CameraModelFamily;
}

export const CAMERA_MODEL_DESCRIPTORS: Record<CameraModelId, CameraModelDescriptor> = {
  [CameraModelId.SIMPLE_PINHOLE]: { id: CameraModelId.SIMPLE_PINHOLE, colmapName: 'SIMPLE_PINHOLE', displayName: 'Simple Pinhole', paramNames: ['f', 'cx', 'cy'], family: 'pinhole' },
  [CameraModelId.PINHOLE]: { id: CameraModelId.PINHOLE, colmapName: 'PINHOLE', displayName: 'Pinhole', paramNames: ['fx', 'fy', 'cx', 'cy'], family: 'pinhole' },
  [CameraModelId.SIMPLE_RADIAL]: { id: CameraModelId.SIMPLE_RADIAL, colmapName: 'SIMPLE_RADIAL', displayName: 'Simple Radial', paramNames: ['f', 'cx', 'cy', 'k'], family: 'pinhole' },
  [CameraModelId.RADIAL]: { id: CameraModelId.RADIAL, colmapName: 'RADIAL', displayName: 'Radial', paramNames: ['f', 'cx', 'cy', 'k1', 'k2'], family: 'pinhole' },
  [CameraModelId.OPENCV]: { id: CameraModelId.OPENCV, colmapName: 'OPENCV', displayName: 'OpenCV', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2'], family: 'pinhole' },
  [CameraModelId.OPENCV_FISHEYE]: { id: CameraModelId.OPENCV_FISHEYE, colmapName: 'OPENCV_FISHEYE', displayName: 'OpenCV Fisheye', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'k3', 'k4'], family: 'fisheye' },
  [CameraModelId.FULL_OPENCV]: { id: CameraModelId.FULL_OPENCV, colmapName: 'FULL_OPENCV', displayName: 'Full OpenCV', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2', 'k3', 'k4', 'k5', 'k6'], family: 'pinhole' },
  [CameraModelId.FOV]: { id: CameraModelId.FOV, colmapName: 'FOV', displayName: 'FOV', paramNames: ['fx', 'fy', 'cx', 'cy', 'ω'], family: 'pinhole' },
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: { id: CameraModelId.SIMPLE_RADIAL_FISHEYE, colmapName: 'SIMPLE_RADIAL_FISHEYE', displayName: 'Simple Radial Fisheye', paramNames: ['f', 'cx', 'cy', 'k'], family: 'fisheye' },
  [CameraModelId.RADIAL_FISHEYE]: { id: CameraModelId.RADIAL_FISHEYE, colmapName: 'RADIAL_FISHEYE', displayName: 'Radial Fisheye', paramNames: ['f', 'cx', 'cy', 'k1', 'k2'], family: 'fisheye' },
  [CameraModelId.THIN_PRISM_FISHEYE]: { id: CameraModelId.THIN_PRISM_FISHEYE, colmapName: 'THIN_PRISM_FISHEYE', displayName: 'Thin Prism Fisheye', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2', 'k3', 'k4', 'sx1', 'sy1'], family: 'fisheye' },
  [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: { id: CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE, colmapName: 'RAD_TAN_THIN_PRISM_FISHEYE', displayName: 'Rad-Tan Thin Prism', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'p1', 'p2', 'sx1', 'sy1', 'sx2', 'sy2'], family: 'fisheye' },
};

export function getCameraModelDescriptor(id: CameraModelId): CameraModelDescriptor {
  return CAMERA_MODEL_DESCRIPTORS[id];
}

export function getCameraModelNumParams(id: CameraModelId): number {
  return CAMERA_MODEL_DESCRIPTORS[id].paramNames.length;
}

export function getCameraModelParamNames(id: CameraModelId): readonly string[] {
  return CAMERA_MODEL_DESCRIPTORS[id].paramNames;
}

export function getCameraModelFamily(id: CameraModelId): CameraModelFamily {
  return CAMERA_MODEL_DESCRIPTORS[id].family;
}

export function getCameraModelColmapName(id: CameraModelId): string {
  return CAMERA_MODEL_DESCRIPTORS[id].colmapName;
}

export function getCameraModelDisplayName(id: CameraModelId): string {
  return CAMERA_MODEL_DESCRIPTORS[id].displayName;
}

const COLMAP_NAME_TO_ID: ReadonlyMap<string, CameraModelId> = new Map(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.colmapName, d.id])
);

export function colmapNameToModelId(name: string): CameraModelId | undefined {
  return COLMAP_NAME_TO_ID.get(name);
}

export function isSphericalCameraModel(id: CameraModelId): boolean {
  return getCameraModelFamily(id) === 'spherical';
}

export function cameraModelHasPinholeIntrinsics(id: CameraModelId): boolean {
  return getCameraModelFamily(id) !== 'spherical';
}
