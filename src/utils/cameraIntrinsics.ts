import type { Camera, CameraIntrinsics } from '../types/colmap';
import { CameraModelId } from '../types/colmap';

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
