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
  THIN_PRISM_FISHEYE: 10,
  RAD_TAN_THIN_PRISM_FISHEYE: 11,
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
  [CameraModelId.THIN_PRISM_FISHEYE]: 12,
  [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: 16,
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
  /** 2D keypoints - may be empty if loaded in lite mode (use numPoints2D for count) */
  points2D: Point2D[];
  /** Number of 2D points (always available, even in lite mode) */
  numPoints2D?: number;
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

// Pre-computed reverse mapping from imageId to the 3D points it observes
// Used for point highlighting without requiring points2D to be loaded
export type ImageToPoint3DIdsMap = Map<ImageId, Set<Point3DId>>;

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
  /**
   * Optional: 3D points Map - only available when built on-demand for export/transform.
   * For rendering, use WASM arrays via wasmReconstruction instead.
   * Use buildPoints3DMap() from wasm/reconstruction.ts to generate this when needed.
   */
  points3D?: Map<Point3DId, Point3D>;
  imageStats: Map<ImageId, ImageStats>;
  connectedImagesIndex: ConnectedImagesIndex;
  globalStats: GlobalStats;
  /** Reverse mapping from imageId to observed 3D point IDs (for highlighting) */
  imageToPoint3DIds: ImageToPoint3DIdsMap;
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

// Re-export for backwards compatibility (moved to store/types.ts)
export { COLOR_MODES, type ColorMode } from '../store/types';

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

// Re-export for backwards compatibility (moved to utils/cameraIntrinsics.ts)
export { getCameraIntrinsics } from '../utils/cameraIntrinsics';
