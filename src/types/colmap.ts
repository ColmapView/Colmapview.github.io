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
  cameraId: number;
  modelId: CameraModelId;
  width: number;
  height: number;
  params: number[];
}

export interface Point2D {
  xy: [number, number];
  point3DId: bigint;
}

export interface Image {
  imageId: number;
  qvec: [number, number, number, number]; // qw, qx, qy, qz
  tvec: [number, number, number];          // tx, ty, tz
  cameraId: number;
  name: string;
  points2D: Point2D[];
}

export interface TrackElement {
  imageId: number;
  point2DIdx: number;
}

export interface Point3D {
  point3DId: bigint;
  xyz: [number, number, number];
  rgb: [number, number, number];
  error: number;
  track: TrackElement[];
}

export interface Reconstruction {
  cameras: Map<number, Camera>;
  images: Map<number, Image>;
  points3D: Map<bigint, Point3D>;
}

// File structure for loaded data
export interface LoadedFiles {
  camerasFile?: File;
  imagesFile?: File;
  points3DFile?: File;
  databaseFile?: File;
  imageFiles: Map<string, File>;
}

// Color mode for point cloud visualization
export type ColorMode = 'rgb' | 'error' | 'trackLength';
