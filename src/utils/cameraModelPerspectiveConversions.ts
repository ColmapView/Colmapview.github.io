import { CameraModelId } from '../types/colmap';
import {
  ASPECT_RATIO_THRESHOLD,
  type ConversionResult,
} from './cameraModelConversionTypes';
import { getCameraModelColmapName } from './cameraModelPolicy';

export function convertPerspectiveCameraModel(
  from: CameraModelId,
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult | null {
  switch (from) {
    case CameraModelId.SIMPLE_PINHOLE:
      return convertFromSimplePinhole(to, params);
    case CameraModelId.PINHOLE:
      return convertFromPinhole(to, params);
    case CameraModelId.SIMPLE_RADIAL:
      return convertFromSimpleRadial(to, params);
    case CameraModelId.RADIAL:
      return convertFromRadial(to, params, threshold);
    case CameraModelId.OPENCV:
      return convertFromOpencv(to, params, threshold);
    case CameraModelId.FOV:
      return convertFromFov(to, params);
    default:
      return null;
  }
}

function convertFromSimplePinhole(
  to: CameraModelId,
  params: number[]
): ConversionResult {
  const [f, cx, cy] = params;

  switch (to) {
    case CameraModelId.PINHOLE:
      return { type: 'exact', params: [f, f, cx, cy] };
    case CameraModelId.SIMPLE_RADIAL:
      return { type: 'exact', params: [f, cx, cy, 0] };
    case CameraModelId.RADIAL:
      return { type: 'exact', params: [f, cx, cy, 0, 0] };
    case CameraModelId.OPENCV:
      return { type: 'exact', params: [f, f, cx, cy, 0, 0, 0, 0] };
    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [f, f, cx, cy, 0, 0, 0, 0, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; behavior differs from simpler models',
      };
    default:
      return incompatible('SIMPLE_PINHOLE', to);
  }
}

function convertFromPinhole(
  to: CameraModelId,
  params: number[]
): ConversionResult {
  const [fx, fy, cx, cy] = params;

  switch (to) {
    case CameraModelId.SIMPLE_PINHOLE:
      return convertPinholeToSingleFocal(fx, fy, cx, cy, [cx, cy]);
    case CameraModelId.SIMPLE_RADIAL:
      return convertPinholeToSingleFocal(fx, fy, cx, cy, [cx, cy, 0]);
    case CameraModelId.RADIAL:
      return convertPinholeToSingleFocal(fx, fy, cx, cy, [cx, cy, 0, 0]);
    case CameraModelId.OPENCV:
      return { type: 'exact', params: [fx, fy, cx, cy, 0, 0, 0, 0] };
    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [fx, fy, cx, cy, 0, 0, 0, 0, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; behavior differs from simpler models',
      };
    default:
      return incompatible('PINHOLE', to);
  }
}

function convertFromSimpleRadial(
  to: CameraModelId,
  params: number[]
): ConversionResult {
  const [f, cx, cy, k] = params;

  switch (to) {
    case CameraModelId.RADIAL:
      return { type: 'exact', params: [f, cx, cy, k, 0] };
    case CameraModelId.OPENCV:
      return { type: 'exact', params: [f, f, cx, cy, k, 0, 0, 0] };
    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [f, f, cx, cy, k, 0, 0, 0, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; behavior differs from OPENCV',
      };
    case CameraModelId.FOV: {
      if (k <= 0) {
        return {
          type: 'incompatible',
          reason: 'FOV model requires positive distortion (k > 0)',
        };
      }
      const omega = Math.sqrt(3 * k);
      return {
        type: 'approximate',
        params: [f, f, cx, cy, omega],
        maxError: omega > 0.1 ? 0.1 : 0.01,
        warning: `Taylor approximation; omega=${omega.toFixed(4)} radians`,
      };
    }
    default:
      return incompatible('SIMPLE_RADIAL', to);
  }
}

function convertFromRadial(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  const [f, cx, cy, k1, k2] = params;

  switch (to) {
    case CameraModelId.SIMPLE_RADIAL: {
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
    case CameraModelId.OPENCV:
      return { type: 'exact', params: [f, f, cx, cy, k1, k2, 0, 0] };
    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [f, f, cx, cy, k1, k2, 0, 0, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; behavior differs from OPENCV',
      };
    case CameraModelId.FOV: {
      if (Math.abs(k2) > threshold) {
        return {
          type: 'incompatible',
          reason: 'FOV model cannot represent k2 distortion',
        };
      }
      if (k1 <= 0) {
        return {
          type: 'incompatible',
          reason: 'FOV model requires positive distortion (k1 > 0)',
        };
      }
      const omega = Math.sqrt(3 * k1);
      return {
        type: 'approximate',
        params: [f, f, cx, cy, omega],
        maxError: omega > 0.1 ? 0.1 : 0.01,
        warning: `Taylor approximation; omega=${omega.toFixed(4)} radians`,
      };
    }
    default:
      return incompatible('RADIAL', to);
  }
}

function convertFromOpencv(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  const [fx, fy, cx, cy, k1, k2, p1, p2] = params;

  switch (to) {
    case CameraModelId.RADIAL:
      return convertOpencvToRadialLike({
        fx,
        fy,
        cx,
        cy,
        k1,
        k2,
        p1,
        p2,
        threshold,
        includeK2: true,
      });
    case CameraModelId.SIMPLE_RADIAL:
      return convertOpencvToRadialLike({
        fx,
        fy,
        cx,
        cy,
        k1,
        k2,
        p1,
        p2,
        threshold,
        includeK2: false,
      });
    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [fx, fy, cx, cy, k1, k2, p1, p2, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; not mathematically equivalent to OPENCV',
      };
    default:
      return incompatible('OPENCV', to);
  }
}

function convertFromFov(
  to: CameraModelId,
  params: number[]
): ConversionResult {
  const [fx, _fy, cx, cy, omega] = params;

  switch (to) {
    case CameraModelId.SIMPLE_RADIAL:
      return convertFovToRadialLike(fx, cx, cy, omega, false);
    case CameraModelId.RADIAL:
      return convertFovToRadialLike(fx, cx, cy, omega, true);
    default:
      return incompatible('FOV', to);
  }
}

function convertPinholeToSingleFocal(
  fx: number,
  fy: number,
  cx: number,
  cy: number,
  tailParams: number[]
): ConversionResult {
  const aspectDiff = Math.abs(fx - fy) / fx;
  if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
    const fMean = (fx + fy) / 2;
    return {
      type: 'approximate',
      params: [fMean, ...tailParams],
      maxError: (Math.abs(fx - fMean) / fMean) * Math.max(cx, cy),
      warning: `Using mean f=${fMean.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)}, diff ${(aspectDiff * 100).toFixed(2)}%)`,
    };
  }
  return { type: 'exact', params: [fx, ...tailParams] };
}

interface OpencvToRadialLikeParams {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  p1: number;
  p2: number;
  threshold: number;
  includeK2: boolean;
}

function convertOpencvToRadialLike({
  fx,
  fy,
  cx,
  cy,
  k1,
  k2,
  p1,
  p2,
  threshold,
  includeK2,
}: OpencvToRadialLikeParams): ConversionResult {
  const warnings: string[] = [];
  let maxError = 0;

  if (!includeK2 && Math.abs(k2) > threshold) {
    warnings.push(`Dropping k2=${k2.toExponential(3)}`);
    maxError = Math.max(maxError, Math.abs(k2));
  }

  if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
    const tangentialError = Math.max(Math.abs(p1), Math.abs(p2));
    warnings.push(`Dropping tangential: p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)}`);
    maxError = Math.max(maxError, tangentialError);
  }

  const aspectDiff = Math.abs(fx - fy) / fx;
  const fOut = aspectDiff > ASPECT_RATIO_THRESHOLD ? (fx + fy) / 2 : fx;
  if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
    warnings.push(`Using mean f=${fOut.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)})`);
    maxError = Math.max(maxError, (Math.abs(fx - fOut) / fOut) * Math.max(cx, cy));
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

function convertFovToRadialLike(
  fx: number,
  cx: number,
  cy: number,
  omega: number,
  includeK2: boolean
): ConversionResult {
  const k1 = (omega * omega) / 3;
  const quality = omega < 0.1 ? 'good' : omega < 0.5 ? 'rough' : 'poor';
  const params = includeK2 ? [fx, cx, cy, k1, 0] : [fx, cx, cy, k1];

  return {
    type: 'approximate',
    params,
    maxError: quality === 'good' ? 0.01 : quality === 'rough' ? 0.1 : 0.5,
    warning: `Taylor approximation (${quality}); omega=${omega.toFixed(4)} radians (${(omega * 180 / Math.PI).toFixed(1)}°)`,
  };
}

function incompatible(fromName: string, to: CameraModelId): ConversionResult {
  return {
    type: 'incompatible',
    reason: `Cannot convert ${fromName} to ${getCameraModelColmapName(to)}`,
  };
}
