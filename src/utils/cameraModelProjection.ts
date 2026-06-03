import type { Camera } from '../types/colmap';
import { CameraModelId } from '../types/colmap';

export interface ValidationResult {
  maxError: number;
  avgError: number;
  sampleCount: number;
}

export function validateCameraModelProjectionConversion(
  srcCamera: Camera,
  dstCamera: Camera,
  sampleCount: number = 10
): ValidationResult {
  const { width, height } = srcCamera;
  const errors: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    for (let j = 0; j < sampleCount; j++) {
      const x = (width * (i + 0.5)) / sampleCount;
      const y = (height * (j + 0.5)) / sampleCount;

      const srcNorm = unprojectPoint(srcCamera, x, y);
      if (!srcNorm) continue;

      const dstPoint = projectPoint(dstCamera, srcNorm.x, srcNorm.y);
      if (!dstPoint) continue;

      const dx = dstPoint.x - x;
      const dy = dstPoint.y - y;
      errors.push(Math.sqrt(dx * dx + dy * dy));
    }
  }

  if (errors.length === 0) {
    return { maxError: Infinity, avgError: Infinity, sampleCount: 0 };
  }

  const maxError = Math.max(...errors);
  const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

  return { maxError, avgError, sampleCount: errors.length };
}

function applyRadialDistortion(
  x: number,
  y: number,
  k1: number,
  k2: number = 0,
  p1: number = 0,
  p2: number = 0
): { x: number; y: number } {
  const r2 = x * x + y * y;
  const r4 = r2 * r2;

  const radialFactor = 1 + k1 * r2 + k2 * r4;
  const dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
  const dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;

  return {
    x: x * radialFactor + dx,
    y: y * radialFactor + dy,
  };
}

function removeRadialDistortion(
  xd: number,
  yd: number,
  k1: number,
  k2: number = 0,
  p1: number = 0,
  p2: number = 0,
  maxIter: number = 20
): { x: number; y: number } {
  let x = xd;
  let y = yd;

  for (let iter = 0; iter < maxIter; iter++) {
    const r2 = x * x + y * y;
    const r4 = r2 * r2;

    const radialFactor = 1 + k1 * r2 + k2 * r4;
    const dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
    const dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;

    const fx = x * radialFactor + dx - xd;
    const fy = y * radialFactor + dy - yd;

    if (Math.abs(fx) < 1e-10 && Math.abs(fy) < 1e-10) {
      break;
    }

    const dr2Dx = 2 * x;
    const dr2Dy = 2 * y;
    const dradDx = k1 * dr2Dx + 2 * k2 * r2 * dr2Dx;
    const dradDy = k1 * dr2Dy + 2 * k2 * r2 * dr2Dy;

    const j00 = radialFactor + x * dradDx + 2 * p1 * y + 6 * p2 * x;
    const j01 = x * dradDy + 2 * p1 * x + 2 * p2 * y;
    const j10 = y * dradDx + 2 * p1 * x + 2 * p2 * y;
    const j11 = radialFactor + y * dradDy + 6 * p1 * y + 2 * p2 * x;

    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-15) {
      break;
    }

    x -= (j11 * fx - j01 * fy) / det;
    y -= (-j10 * fx + j00 * fy) / det;
  }

  return { x, y };
}

function applyFisheyeDistortion(
  x: number,
  y: number,
  k1: number,
  k2: number = 0,
  k3: number = 0,
  k4: number = 0
): { x: number; y: number } {
  const r = Math.sqrt(x * x + y * y);
  if (r < 1e-10) return { x, y };

  const theta = Math.atan(r);
  const theta2 = theta * theta;
  const theta4 = theta2 * theta2;
  const theta6 = theta4 * theta2;
  const theta8 = theta4 * theta4;

  const thetaD = theta * (1 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8);
  const scale = thetaD / r;

  return { x: x * scale, y: y * scale };
}

function removeFisheyeDistortion(
  xd: number,
  yd: number,
  k1: number,
  k2: number = 0,
  k3: number = 0,
  k4: number = 0,
  maxIter: number = 20
): { x: number; y: number } {
  const rd = Math.sqrt(xd * xd + yd * yd);
  if (rd < 1e-10) return { x: xd, y: yd };

  let theta = rd;

  for (let iter = 0; iter < maxIter; iter++) {
    const theta2 = theta * theta;
    const theta4 = theta2 * theta2;
    const theta6 = theta4 * theta2;
    const theta8 = theta4 * theta4;

    const f = theta * (1 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8) - rd;
    const df =
      1 +
      3 * k1 * theta2 +
      5 * k2 * theta4 +
      7 * k3 * theta6 +
      9 * k4 * theta8;

    if (Math.abs(df) < 1e-15) break;

    const delta = f / df;
    theta -= delta;

    if (Math.abs(delta) < 1e-10) break;
  }

  const r = Math.tan(theta);
  const scale = r / rd;

  return { x: xd * scale, y: yd * scale };
}

function unprojectPoint(
  camera: Camera,
  px: number,
  py: number
): { x: number; y: number } | null {
  const { modelId, params } = camera;

  let fx: number, fy: number, cx: number, cy: number;

  switch (modelId) {
    case CameraModelId.SIMPLE_PINHOLE:
      [fx, cx, cy] = params;
      fy = fx;
      return { x: (px - cx) / fx, y: (py - cy) / fy };

    case CameraModelId.PINHOLE:
      [fx, fy, cx, cy] = params;
      return { x: (px - cx) / fx, y: (py - cy) / fy };

    case CameraModelId.SIMPLE_RADIAL: {
      const [f, cxp, cyp, k] = params;
      const xd = (px - cxp) / f;
      const yd = (py - cyp) / f;
      return removeRadialDistortion(xd, yd, k);
    }

    case CameraModelId.RADIAL: {
      const [f, cxp, cyp, k1, k2] = params;
      const xd = (px - cxp) / f;
      const yd = (py - cyp) / f;
      return removeRadialDistortion(xd, yd, k1, k2);
    }

    case CameraModelId.OPENCV: {
      const [fxp, fyp, cxp, cyp, k1, k2, p1, p2] = params;
      const xd = (px - cxp) / fxp;
      const yd = (py - cyp) / fyp;
      return removeRadialDistortion(xd, yd, k1, k2, p1, p2);
    }

    case CameraModelId.SIMPLE_RADIAL_FISHEYE: {
      const [f, cxp, cyp, k] = params;
      const xd = (px - cxp) / f;
      const yd = (py - cyp) / f;
      return removeFisheyeDistortion(xd, yd, k);
    }

    case CameraModelId.RADIAL_FISHEYE: {
      const [f, cxp, cyp, k1, k2] = params;
      const xd = (px - cxp) / f;
      const yd = (py - cyp) / f;
      return removeFisheyeDistortion(xd, yd, k1, k2);
    }

    case CameraModelId.OPENCV_FISHEYE: {
      const [fxp, fyp, cxp, cyp, k1, k2, k3, k4] = params;
      const xd = (px - cxp) / fxp;
      const yd = (py - cyp) / fyp;
      return removeFisheyeDistortion(xd, yd, k1, k2, k3, k4);
    }

    case CameraModelId.THIN_PRISM_FISHEYE: {
      const [fxp, fyp, cxp, cyp, k1, k2, _p1, _p2, k3, k4] = params;
      const xd = (px - cxp) / fxp;
      const yd = (py - cyp) / fyp;
      return removeFisheyeDistortion(xd, yd, k1, k2, k3, k4);
    }

    default:
      [fx, fy, cx, cy] = params;
      return { x: (px - cx) / fx, y: (py - cy) / fy };
  }
}

function projectPoint(
  camera: Camera,
  nx: number,
  ny: number
): { x: number; y: number } | null {
  const { modelId, params } = camera;

  switch (modelId) {
    case CameraModelId.SIMPLE_PINHOLE: {
      const [f, cx, cy] = params;
      return { x: nx * f + cx, y: ny * f + cy };
    }

    case CameraModelId.PINHOLE: {
      const [fx, fy, cx, cy] = params;
      return { x: nx * fx + cx, y: ny * fy + cy };
    }

    case CameraModelId.SIMPLE_RADIAL: {
      const [f, cx, cy, k] = params;
      const distorted = applyRadialDistortion(nx, ny, k);
      return { x: distorted.x * f + cx, y: distorted.y * f + cy };
    }

    case CameraModelId.RADIAL: {
      const [f, cx, cy, k1, k2] = params;
      const distorted = applyRadialDistortion(nx, ny, k1, k2);
      return { x: distorted.x * f + cx, y: distorted.y * f + cy };
    }

    case CameraModelId.OPENCV: {
      const [fx, fy, cx, cy, k1, k2, p1, p2] = params;
      const distorted = applyRadialDistortion(nx, ny, k1, k2, p1, p2);
      return { x: distorted.x * fx + cx, y: distorted.y * fy + cy };
    }

    case CameraModelId.SIMPLE_RADIAL_FISHEYE: {
      const [f, cx, cy, k] = params;
      const distorted = applyFisheyeDistortion(nx, ny, k);
      return { x: distorted.x * f + cx, y: distorted.y * f + cy };
    }

    case CameraModelId.RADIAL_FISHEYE: {
      const [f, cx, cy, k1, k2] = params;
      const distorted = applyFisheyeDistortion(nx, ny, k1, k2);
      return { x: distorted.x * f + cx, y: distorted.y * f + cy };
    }

    case CameraModelId.OPENCV_FISHEYE: {
      const [fx, fy, cx, cy, k1, k2, k3, k4] = params;
      const distorted = applyFisheyeDistortion(nx, ny, k1, k2, k3, k4);
      return { x: distorted.x * fx + cx, y: distorted.y * fy + cy };
    }

    case CameraModelId.THIN_PRISM_FISHEYE: {
      const [fx, fy, cx, cy, k1, k2, _p1, _p2, k3, k4] = params;
      const distorted = applyFisheyeDistortion(nx, ny, k1, k2, k3, k4);
      return { x: distorted.x * fx + cx, y: distorted.y * fy + cy };
    }

    default: {
      const [fx, fy, cx, cy] = params;
      return { x: nx * fx + cx, y: ny * fy + cy };
    }
  }
}
