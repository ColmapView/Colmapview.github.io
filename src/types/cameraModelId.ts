// Camera model constants matching COLMAP — extracted here so that
// cameraModelRegistry.ts can import this without creating a cycle with colmap.ts.

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
  SIMPLE_DIVISION: 12,
  DIVISION: 13,
  SIMPLE_FISHEYE: 14,
  FISHEYE: 15,
  EUCM: 16,
  EQUIRECTANGULAR: 17,
} as const;

export type CameraModelId = (typeof CameraModelId)[keyof typeof CameraModelId];
