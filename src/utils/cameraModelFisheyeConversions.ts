import { CameraModelId } from '../types/colmap';
import {
  ASPECT_RATIO_THRESHOLD,
  type ConversionResult,
} from './cameraModelConversionTypes';
import { getCameraModelColmapName } from './cameraModelPolicy';

export function convertFisheyeCameraModel(
  from: CameraModelId,
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult | null {
  switch (from) {
    case CameraModelId.SIMPLE_RADIAL_FISHEYE:
      return convertFromSimpleRadialFisheye(to, params);
    case CameraModelId.RADIAL_FISHEYE:
      return convertFromRadialFisheye(to, params, threshold);
    case CameraModelId.OPENCV_FISHEYE:
      return convertFromOpencvFisheye(to, params, threshold);
    case CameraModelId.THIN_PRISM_FISHEYE:
      return convertFromThinPrismFisheye(to, params, threshold);
    default:
      return null;
  }
}

function convertFromSimpleRadialFisheye(
  to: CameraModelId,
  params: number[]
): ConversionResult {
  const [f, cx, cy, k] = params;

  switch (to) {
    case CameraModelId.RADIAL_FISHEYE:
      return { type: 'exact', params: [f, cx, cy, k, 0] };
    case CameraModelId.OPENCV_FISHEYE:
      return { type: 'exact', params: [f, f, cx, cy, k, 0, 0, 0] };
    case CameraModelId.THIN_PRISM_FISHEYE:
      return { type: 'exact', params: [f, f, cx, cy, k, 0, 0, 0, 0, 0, 0, 0] };
    default:
      return incompatible('SIMPLE_RADIAL_FISHEYE', to);
  }
}

function convertFromRadialFisheye(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  const [f, cx, cy, k1, k2] = params;

  switch (to) {
    case CameraModelId.SIMPLE_RADIAL_FISHEYE: {
      if (Math.abs(k2) > threshold) {
        return {
          type: 'approximate',
          params: [f, cx, cy, k1],
          maxError: Math.abs(k2),
          warning: `Dropping k2=${k2.toExponential(3)} exceeds threshold`,
        };
      }
      return { type: 'exact', params: [f, cx, cy, k1] };
    }
    case CameraModelId.OPENCV_FISHEYE:
      return { type: 'exact', params: [f, f, cx, cy, k1, k2, 0, 0] };
    case CameraModelId.THIN_PRISM_FISHEYE:
      return { type: 'exact', params: [f, f, cx, cy, k1, k2, 0, 0, 0, 0, 0, 0] };
    default:
      return incompatible('RADIAL_FISHEYE', to);
  }
}

function convertFromOpencvFisheye(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  const [fx, fy, cx, cy, k1, k2, k3, k4] = params;

  switch (to) {
    case CameraModelId.RADIAL_FISHEYE:
      return convertOpencvFisheyeToRadialLike({
        fx,
        fy,
        cx,
        cy,
        k1,
        k2,
        k3,
        k4,
        threshold,
        includeK2: true,
      });
    case CameraModelId.SIMPLE_RADIAL_FISHEYE:
      return convertOpencvFisheyeToRadialLike({
        fx,
        fy,
        cx,
        cy,
        k1,
        k2,
        k3,
        k4,
        threshold,
        includeK2: false,
      });
    case CameraModelId.THIN_PRISM_FISHEYE:
      return {
        type: 'exact',
        params: [fx, fy, cx, cy, k1, k2, 0, 0, k3, k4, 0, 0],
      };
    default:
      return incompatible('OPENCV_FISHEYE', to);
  }
}

function convertFromThinPrismFisheye(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  const [fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1] = params;

  switch (to) {
    case CameraModelId.OPENCV_FISHEYE: {
      const warnings: string[] = [];
      let maxError = 0;

      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        warnings.push(`Dropping tangential: p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(p1), Math.abs(p2));
      }
      if (Math.abs(sx1) > threshold || Math.abs(sy1) > threshold) {
        warnings.push(`Dropping thin prism: sx1=${sx1.toExponential(3)}, sy1=${sy1.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(sx1), Math.abs(sy1));
      }

      if (warnings.length > 0) {
        return {
          type: 'approximate',
          params: [fx, fy, cx, cy, k1, k2, k3, k4],
          maxError,
          warning: warnings.join('; '),
        };
      }
      return { type: 'exact', params: [fx, fy, cx, cy, k1, k2, k3, k4] };
    }
    case CameraModelId.RADIAL_FISHEYE:
      return convertThinPrismFisheyeToRadialLike({
        fx,
        fy,
        cx,
        cy,
        k1,
        k2,
        p1,
        p2,
        k3,
        k4,
        sx1,
        sy1,
        threshold,
        includeK2: true,
      });
    case CameraModelId.SIMPLE_RADIAL_FISHEYE:
      return convertThinPrismFisheyeToRadialLike({
        fx,
        fy,
        cx,
        cy,
        k1,
        k2,
        p1,
        p2,
        k3,
        k4,
        sx1,
        sy1,
        threshold,
        includeK2: false,
      });
    default:
      return incompatible('THIN_PRISM_FISHEYE', to);
  }
}

interface OpencvFisheyeToRadialLikeParams {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  threshold: number;
  includeK2: boolean;
}

function convertOpencvFisheyeToRadialLike({
  fx,
  fy,
  cx,
  cy,
  k1,
  k2,
  k3,
  k4,
  threshold,
  includeK2,
}: OpencvFisheyeToRadialLikeParams): ConversionResult {
  const warnings: string[] = [];
  let maxError = 0;

  if (!includeK2 && Math.abs(k2) > threshold) {
    warnings.push(`Dropping k2=${k2.toExponential(3)}`);
    maxError = Math.max(maxError, Math.abs(k2));
  }
  if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
    warnings.push(`Dropping k3=${k3.toExponential(3)}, k4=${k4.toExponential(3)}`);
    maxError = Math.max(maxError, Math.abs(k3), Math.abs(k4));
  }

  const { fOut, aspectWarning, aspectError } = getSingleFocalReduction(fx, fy, cx, cy);
  if (aspectWarning) {
    warnings.push(aspectWarning);
    maxError = Math.max(maxError, aspectError);
  }

  const outputParams = includeK2
    ? [fOut, cx, cy, k1, k2]
    : [fOut, cx, cy, k1];

  if (warnings.length > 0) {
    return {
      type: 'approximate',
      params: outputParams,
      maxError,
      warning: warnings.join('; '),
    };
  }
  return { type: 'exact', params: outputParams };
}

interface ThinPrismFisheyeToRadialLikeParams {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  p1: number;
  p2: number;
  k3: number;
  k4: number;
  sx1: number;
  sy1: number;
  threshold: number;
  includeK2: boolean;
}

function convertThinPrismFisheyeToRadialLike({
  fx,
  fy,
  cx,
  cy,
  k1,
  k2,
  p1,
  p2,
  k3,
  k4,
  sx1,
  sy1,
  threshold,
  includeK2,
}: ThinPrismFisheyeToRadialLikeParams): ConversionResult {
  const warnings: string[] = [];
  let maxError = 0;

  if (!includeK2 && Math.abs(k2) > threshold) {
    warnings.push(`Dropping k2=${k2.toExponential(3)}`);
    maxError = Math.max(maxError, Math.abs(k2));
  }
  if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
    warnings.push(`Dropping k3=${k3.toExponential(3)}, k4=${k4.toExponential(3)}`);
    maxError = Math.max(maxError, Math.abs(k3), Math.abs(k4));
  }
  if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
    warnings.push(`Dropping tangential: p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)}`);
    maxError = Math.max(maxError, Math.abs(p1), Math.abs(p2));
  }
  if (Math.abs(sx1) > threshold || Math.abs(sy1) > threshold) {
    warnings.push(`Dropping thin prism: sx1=${sx1.toExponential(3)}, sy1=${sy1.toExponential(3)}`);
    maxError = Math.max(maxError, Math.abs(sx1), Math.abs(sy1));
  }

  const { fOut, aspectWarning, aspectError } = getSingleFocalReduction(fx, fy, cx, cy);
  if (aspectWarning) {
    warnings.push(aspectWarning);
    maxError = Math.max(maxError, aspectError);
  }

  const outputParams = includeK2
    ? [fOut, cx, cy, k1, k2]
    : [fOut, cx, cy, k1];

  if (warnings.length > 0) {
    return {
      type: 'approximate',
      params: outputParams,
      maxError,
      warning: warnings.join('; '),
    };
  }
  return { type: 'exact', params: outputParams };
}

function getSingleFocalReduction(
  fx: number,
  fy: number,
  cx: number,
  cy: number
): { fOut: number; aspectWarning: string | null; aspectError: number } {
  const aspectDiff = Math.abs(fx - fy) / fx;
  const fOut = aspectDiff > ASPECT_RATIO_THRESHOLD ? (fx + fy) / 2 : fx;

  if (aspectDiff <= ASPECT_RATIO_THRESHOLD) {
    return { fOut, aspectWarning: null, aspectError: 0 };
  }

  return {
    fOut,
    aspectWarning: `Using mean f=${fOut.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)})`,
    aspectError: (Math.abs(fx - fOut) / fOut) * Math.max(cx, cy),
  };
}

function incompatible(fromName: string, to: CameraModelId): ConversionResult {
  return {
    type: 'incompatible',
    reason: `Cannot convert ${fromName} to ${getCameraModelColmapName(to)}`,
  };
}
