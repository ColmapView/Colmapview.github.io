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
}

// File structure for loaded data
export interface LoadedFiles {
  camerasFile?: File;
  imagesFile?: File;
  points3DFile?: File;
  databaseFile?: File;
  imageFiles: Map<string, File>;
  hasMasks: boolean;
}

// Color mode for point cloud visualization
export const COLOR_MODES = ['rgb', 'error', 'trackLength'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
