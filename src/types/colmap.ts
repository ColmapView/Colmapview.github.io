import type { RigData } from './rig';

// Type aliases for COLMAP IDs
// These add semantic meaning and make code more self-documenting
export type CameraId = number;
export type ImageId = number;
export type Point3DId = bigint;

// Special value indicating an unmatched 2D point (no corresponding 3D point)
export const UNMATCHED_POINT3D_ID = BigInt(-1);

// Camera model constants matching COLMAP
export const CameraModelId = {
  SIMPLE_PINHOLE: 0,
  PINHOLE: 1,
  SIMPLE_RADIAL: 2,
  RADIAL: 3,
  OPENCV: 4,
  OPENCV_FISHEYE: 5,
  FULL_OPENCV: 6,
  FOV: 7,
  SIMPLE_RADIAL_FISHEYE: 8,
  RADIAL_FISHEYE: 9,
  THIN_PRISM_FISHEYE: 10
} as const;

export type CameraModelId = (typeof CameraModelId)[keyof typeof CameraModelId];

export const CAMERA_MODEL_NUM_PARAMS: Record<CameraModelId, number> = {
  [CameraModelId.SIMPLE_PINHOLE]: 3,
  [CameraModelId.PINHOLE]: 4,
  [CameraModelId.SIMPLE_RADIAL]: 4,
  [CameraModelId.RADIAL]: 5,
  [CameraModelId.OPENCV]: 8,
  [CameraModelId.OPENCV_FISHEYE]: 8,
  [CameraModelId.FULL_OPENCV]: 12,
  [CameraModelId.FOV]: 5,
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 4,
  [CameraModelId.RADIAL_FISHEYE]: 5,
  [CameraModelId.THIN_PRISM_FISHEYE]: 12
};

export interface Camera {
  cameraId: CameraId;
  modelId: CameraModelId;
  width: number;
  height: number;
  params: number[];
}

export interface Point2D {
  xy: [number, number];
  /** ID of corresponding 3D point, or UNMATCHED_POINT3D_ID if not triangulated */
  point3DId: Point3DId;
}

export interface Image {
  imageId: ImageId;
  qvec: [number, number, number, number]; // qw, qx, qy, qz
  tvec: [number, number, number];          // tx, ty, tz
  cameraId: CameraId;
  name: string;
  points2D: Point2D[];
}

export interface TrackElement {
  imageId: ImageId;
  point2DIdx: number;
}

export interface Point3D {
  point3DId: Point3DId;
  xyz: [number, number, number];
  rgb: [number, number, number];
  error: number;
  track: TrackElement[];
}

// Pre-computed statistics for each image (computed once at load time)
export interface ImageStats {
  numPoints3D: number;
  avgError: number;
  covisibleCount: number;
}

// Pre-computed connected images index for fast modal lookups
// Maps imageId -> Map<connectedImageId, matchCount>
export type ConnectedImagesIndex = Map<ImageId, Map<ImageId, number>>;

// Pre-computed global statistics for the entire reconstruction (computed once at load time)
export interface GlobalStats {
  // Error statistics across all 3D points
  minError: number;
  maxError: number;
  avgError: number;
  // Track length statistics across all 3D points
  minTrackLength: number;
  maxTrackLength: number;
  avgTrackLength: number;
  // Total observation count (sum of all track lengths)
  totalObservations: number;
  // Total point count
  totalPoints: number;
}

export interface Reconstruction {
  cameras: Map<CameraId, Camera>;
  images: Map<ImageId, Image>;
  points3D: Map<Point3DId, Point3D>;
  imageStats: Map<ImageId, ImageStats>;
  connectedImagesIndex: ConnectedImagesIndex;
  globalStats: GlobalStats;
  rigData?: RigData;
}

// File structure for loaded data
export interface LoadedFiles {
  camerasFile?: File;
  imagesFile?: File;
  points3DFile?: File;
  databaseFile?: File;
  rigsFile?: File;
  framesFile?: File;
  imageFiles: Map<string, File>;
  hasMasks: boolean;
}

// Color mode for point cloud visualization
export const COLOR_MODES = ['rgb', 'error', 'trackLength'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

/**
 * Camera intrinsics extracted from COLMAP camera parameters.
 * All distortion parameters default to 0 if not present in the model.
 */
export interface CameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
  k6: number;
  p1: number;
  p2: number;
  omega: number;  // FOV model parameter
  sx1: number;    // Thin prism parameters
  sy1: number;
}

/**
 * Extract camera intrinsics from COLMAP camera parameters.
 * Handles all 11 camera models with their different parameter layouts.
 */
export function getCameraIntrinsics(camera: Camera): CameraIntrinsics {
  const params = camera.params;
  const modelId = camera.modelId;

  // Default all distortion parameters to 0
  const intrinsics: CameraIntrinsics = {
    fx: 1, fy: 1, cx: 0, cy: 0,
    k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0,
    p1: 0, p2: 0, omega: 0, sx1: 0, sy1: 0,
  };

  switch (modelId) {
    case CameraModelId.SIMPLE_PINHOLE:
      // f, cx, cy
      intrinsics.fx = intrinsics.fy = params[0];
      intrinsics.cx = params[1];
      intrinsics.cy = params[2];
      break;

    case CameraModelId.PINHOLE:
      // fx, fy, cx, cy
      intrinsics.fx = params[0];
      intrinsics.fy = params[1];
      intrinsics.cx = params[2];
      intrinsics.cy = params[3];
      break;

    case CameraModelId.SIMPLE_RADIAL:
      // f, cx, cy, k
      intrinsics.fx = intrinsics.fy = params[0];
      intrinsics.cx = params[1];
      intrinsics.cy = params[2];
      intrinsics.k1 = params[3];
      break;

    case CameraModelId.RADIAL:
      // f, cx, cy, k1, k2
      intrinsics.fx = intrinsics.fy = params[0];
      intrinsics.cx = params[1];
      intrinsics.cy = params[2];
      intrinsics.k1 = params[3];
      intrinsics.k2 = params[4];
      break;

    case CameraModelId.OPENCV:
      // fx, fy, cx, cy, k1, k2, p1, p2
      intrinsics.fx = params[0];
      intrinsics.fy = params[1];
      intrinsics.cx = params[2];
      intrinsics.cy = params[3];
      intrinsics.k1 = params[4];
      intrinsics.k2 = params[5];
      intrinsics.p1 = params[6];
      intrinsics.p2 = params[7];
      break;

    case CameraModelId.OPENCV_FISHEYE:
      // fx, fy, cx, cy, k1, k2, k3, k4
      intrinsics.fx = params[0];
      intrinsics.fy = params[1];
      intrinsics.cx = params[2];
      intrinsics.cy = params[3];
      intrinsics.k1 = params[4];
      intrinsics.k2 = params[5];
      intrinsics.k3 = params[6];
      intrinsics.k4 = params[7];
      break;

    case CameraModelId.FULL_OPENCV:
      // fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, k5, k6
      intrinsics.fx = params[0];
      intrinsics.fy = params[1];
      intrinsics.cx = params[2];
      intrinsics.cy = params[3];
      intrinsics.k1 = params[4];
      intrinsics.k2 = params[5];
      intrinsics.p1 = params[6];
      intrinsics.p2 = params[7];
      intrinsics.k3 = params[8];
      intrinsics.k4 = params[9];
      intrinsics.k5 = params[10];
      intrinsics.k6 = params[11];
      break;

    case CameraModelId.FOV:
      // fx, fy, cx, cy, omega
      intrinsics.fx = params[0];
      intrinsics.fy = params[1];
      intrinsics.cx = params[2];
      intrinsics.cy = params[3];
      intrinsics.omega = params[4];
      break;

    case CameraModelId.SIMPLE_RADIAL_FISHEYE:
      // f, cx, cy, k
      intrinsics.fx = intrinsics.fy = params[0];
      intrinsics.cx = params[1];
      intrinsics.cy = params[2];
      intrinsics.k1 = params[3];
      break;

    case CameraModelId.RADIAL_FISHEYE:
      // f, cx, cy, k1, k2
      intrinsics.fx = intrinsics.fy = params[0];
      intrinsics.cx = params[1];
      intrinsics.cy = params[2];
      intrinsics.k1 = params[3];
      intrinsics.k2 = params[4];
      break;

    case CameraModelId.THIN_PRISM_FISHEYE:
      // fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1
      intrinsics.fx = params[0];
      intrinsics.fy = params[1];
      intrinsics.cx = params[2];
      intrinsics.cy = params[3];
      intrinsics.k1 = params[4];
      intrinsics.k2 = params[5];
      intrinsics.p1 = params[6];
      intrinsics.p2 = params[7];
      intrinsics.k3 = params[8];
      intrinsics.k4 = params[9];
      intrinsics.sx1 = params[10];
      intrinsics.sy1 = params[11];
      break;
  }

  return intrinsics;
}
