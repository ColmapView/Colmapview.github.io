import { CameraModelId } from '../types/colmap';

export type ConversionCharacterization =
  | 'exact'
  | 'expansion'
  | 'lossy'
  | 'approximation';

export interface ConversionPreview {
  sourceParamNames: string[];
  sourceParams: number[];
  targetParamNames: string[];
  targetParams: number[];
  characterization: ConversionCharacterization;
  isLossy: boolean;
  isExpansion: boolean;
  description: string;
  warning?: string;
}

export interface ConversionCharacterizationInput {
  fromModel: CameraModelId;
  toModel: CameraModelId;
  sourceParams: number[];
  targetParams: number[];
  resultType: 'exact' | 'approximate';
  threshold: number;
  aspectRatioThreshold: number;
}

export interface ConversionCharacterizationResult {
  characterization: ConversionCharacterization;
  isLossy: boolean;
  isExpansion: boolean;
  description: string;
}

export function characterizeCameraModelConversion({
  fromModel,
  toModel,
  sourceParams,
  targetParams,
  resultType,
  threshold,
  aspectRatioThreshold,
}: ConversionCharacterizationInput): ConversionCharacterizationResult {
  const sourceCount = sourceParams.length;
  const targetCount = targetParams.length;

  if (fromModel === CameraModelId.FOV || toModel === CameraModelId.FOV) {
    return {
      characterization: 'approximation',
      isLossy: true,
      isExpansion: false,
      description: 'Taylor series approximation between FOV and polynomial models',
    };
  }

  if (toModel === CameraModelId.FULL_OPENCV) {
    return {
      characterization: 'approximation',
      isLossy: false,
      isExpansion: true,
      description: 'Rational polynomial formula differs from simpler models',
    };
  }

  if (targetCount > sourceCount) {
    const addedParams = targetCount - sourceCount;
    const addedZeros = targetParams.slice(-addedParams).every((p) => Math.abs(p) < threshold);

    if (resultType === 'exact' || addedZeros) {
      return {
        characterization: 'expansion',
        isLossy: false,
        isExpansion: true,
        description: `Adding ${addedParams} parameter${addedParams > 1 ? 's' : ''} (set to zero)`,
      };
    }
  }

  if (targetCount < sourceCount) {
    const droppedInfo = getDroppedParamsInfo({
      fromModel,
      toModel,
      sourceParams,
      threshold,
      aspectRatioThreshold,
    });

    if (droppedInfo.hasNonZero) {
      return {
        characterization: 'lossy',
        isLossy: true,
        isExpansion: false,
        description: droppedInfo.description,
      };
    }

    return {
      characterization: 'exact',
      isLossy: false,
      isExpansion: false,
      description: droppedInfo.description || 'Dropped parameters were already zero',
    };
  }

  if (resultType === 'approximate') {
    return {
      characterization: 'lossy',
      isLossy: true,
      isExpansion: false,
      description: 'Some parameter information is lost',
    };
  }

  return {
    characterization: 'exact',
    isLossy: false,
    isExpansion: false,
    description: 'Equivalent representation',
  };
}

interface DroppedParamsInput {
  fromModel: CameraModelId;
  toModel: CameraModelId;
  sourceParams: number[];
  threshold: number;
  aspectRatioThreshold: number;
}

function getDroppedParamsInfo({
  fromModel,
  toModel,
  sourceParams,
  threshold,
  aspectRatioThreshold,
}: DroppedParamsInput): { hasNonZero: boolean; description: string } {
  const dropped: string[] = [];
  let hasNonZero = false;

  if (fromModel === CameraModelId.PINHOLE && toModel === CameraModelId.SIMPLE_PINHOLE) {
    const [fx, fy] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;
    if (aspectDiff > aspectRatioThreshold) {
      hasNonZero = true;
      dropped.push(`fy (aspect ratio diff: ${(aspectDiff * 100).toFixed(2)}%)`);
    } else {
      dropped.push('fy (aspect ratio preserved)');
    }
  }

  if (fromModel === CameraModelId.RADIAL && toModel === CameraModelId.SIMPLE_RADIAL) {
    const k2 = sourceParams[4];
    if (Math.abs(k2) > threshold) {
      hasNonZero = true;
      dropped.push(`k2=${k2.toExponential(3)}`);
    } else {
      dropped.push('k2 (was zero)');
    }
  }

  if (fromModel === CameraModelId.OPENCV && toModel === CameraModelId.RADIAL) {
    const [fx, fy, , , , , p1, p2] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;

    if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
      hasNonZero = true;
      dropped.push(`tangential (p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)})`);
    }
    if (aspectDiff > aspectRatioThreshold) {
      hasNonZero = true;
      dropped.push(`fy (aspect ratio diff: ${(aspectDiff * 100).toFixed(2)}%)`);
    }
  }

  if (fromModel === CameraModelId.OPENCV && toModel === CameraModelId.SIMPLE_RADIAL) {
    const [fx, fy, , , , k2, p1, p2] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;

    if (Math.abs(k2) > threshold) {
      hasNonZero = true;
      dropped.push(`k2=${k2.toExponential(3)}`);
    }
    if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
      hasNonZero = true;
      dropped.push(`tangential (p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)})`);
    }
    if (aspectDiff > aspectRatioThreshold) {
      hasNonZero = true;
      dropped.push(`fy (aspect ratio diff: ${(aspectDiff * 100).toFixed(2)}%)`);
    }
  }

  if (fromModel === CameraModelId.RADIAL_FISHEYE && toModel === CameraModelId.SIMPLE_RADIAL_FISHEYE) {
    const k2 = sourceParams[4];
    if (Math.abs(k2) > threshold) {
      hasNonZero = true;
      dropped.push(`k2=${k2.toExponential(3)}`);
    } else {
      dropped.push('k2 (was zero)');
    }
  }

  if (fromModel === CameraModelId.OPENCV_FISHEYE) {
    const [fx, fy, , , , , k3, k4] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;

    if (toModel === CameraModelId.RADIAL_FISHEYE || toModel === CameraModelId.SIMPLE_RADIAL_FISHEYE) {
      if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
        hasNonZero = true;
        dropped.push(`k3=${k3.toExponential(3)}, k4=${k4.toExponential(3)}`);
      }
      if (aspectDiff > aspectRatioThreshold) {
        hasNonZero = true;
        dropped.push(`fy (aspect ratio diff: ${(aspectDiff * 100).toFixed(2)}%)`);
      }
    }
  }

  if (fromModel === CameraModelId.THIN_PRISM_FISHEYE) {
    const [fx, fy, , , , , p1, p2, k3, k4, sx1, sy1] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;

    if (toModel === CameraModelId.OPENCV_FISHEYE) {
      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        hasNonZero = true;
        dropped.push(`tangential (p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)})`);
      }
      if (Math.abs(sx1) > threshold || Math.abs(sy1) > threshold) {
        hasNonZero = true;
        dropped.push(`thin prism (sx1=${sx1.toExponential(3)}, sy1=${sy1.toExponential(3)})`);
      }
    } else if (toModel === CameraModelId.RADIAL_FISHEYE || toModel === CameraModelId.SIMPLE_RADIAL_FISHEYE) {
      if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
        hasNonZero = true;
        dropped.push('k3, k4');
      }
      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        hasNonZero = true;
        dropped.push('tangential');
      }
      if (Math.abs(sx1) > threshold || Math.abs(sy1) > threshold) {
        hasNonZero = true;
        dropped.push('thin prism');
      }
      if (aspectDiff > aspectRatioThreshold) {
        hasNonZero = true;
        dropped.push('fy');
      }
    }
  }

  const description = dropped.length > 0
    ? `Dropping: ${dropped.join(', ')}`
    : 'Parameter reduction';

  return { hasNonZero, description };
}
