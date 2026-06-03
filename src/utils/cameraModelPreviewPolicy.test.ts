import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../types/colmap';
import { characterizeCameraModelConversion } from './cameraModelPreviewPolicy';

const THRESHOLD = 1e-6;
const ASPECT_RATIO_THRESHOLD = 0.01;

function characterize(
  input: Omit<
    Parameters<typeof characterizeCameraModelConversion>[0],
    'threshold' | 'aspectRatioThreshold'
  >
): ReturnType<typeof characterizeCameraModelConversion> {
  return characterizeCameraModelConversion({
    threshold: THRESHOLD,
    aspectRatioThreshold: ASPECT_RATIO_THRESHOLD,
    ...input,
  });
}

describe('characterizeCameraModelConversion', () => {
  it('labels zero-filled parameter additions as expansions', () => {
    const result = characterize({
      fromModel: CameraModelId.SIMPLE_PINHOLE,
      toModel: CameraModelId.OPENCV,
      sourceParams: [500, 320, 240],
      targetParams: [500, 500, 320, 240, 0, 0, 0, 0],
      resultType: 'exact',
    });

    expect(result).toEqual({
      characterization: 'expansion',
      isLossy: false,
      isExpansion: true,
      description: 'Adding 5 parameters (set to zero)',
    });
  });

  it('labels FOV and FULL_OPENCV conversions as formula approximations', () => {
    expect(characterize({
      fromModel: CameraModelId.FOV,
      toModel: CameraModelId.SIMPLE_RADIAL,
      sourceParams: [500, 500, 320, 240, 0.5],
      targetParams: [500, 320, 240, 0.04],
      resultType: 'approximate',
    })).toMatchObject({
      characterization: 'approximation',
      isLossy: true,
      isExpansion: false,
    });

    expect(characterize({
      fromModel: CameraModelId.OPENCV,
      toModel: CameraModelId.FULL_OPENCV,
      sourceParams: [500, 500, 320, 240, 0.1, 0.05, 0, 0],
      targetParams: [500, 500, 320, 240, 0.1, 0.05, 0, 0, 0, 0, 0, 0],
      resultType: 'approximate',
    })).toMatchObject({
      characterization: 'approximation',
      isLossy: false,
      isExpansion: true,
    });
  });

  it('distinguishes exact and lossy radial reductions by dropped distortion', () => {
    expect(characterize({
      fromModel: CameraModelId.RADIAL,
      toModel: CameraModelId.SIMPLE_RADIAL,
      sourceParams: [500, 320, 240, 0.1, 0],
      targetParams: [500, 320, 240, 0.1],
      resultType: 'exact',
    })).toMatchObject({
      characterization: 'exact',
      isLossy: false,
      description: 'Dropping: k2 (was zero)',
    });

    expect(characterize({
      fromModel: CameraModelId.RADIAL,
      toModel: CameraModelId.SIMPLE_RADIAL,
      sourceParams: [500, 320, 240, 0.1, 0.05],
      targetParams: [500, 320, 240, 0.1],
      resultType: 'approximate',
    })).toMatchObject({
      characterization: 'lossy',
      isLossy: true,
      description: 'Dropping: k2=5.000e-2',
    });
  });

  it('includes tangential and aspect-ratio losses for OPENCV reductions', () => {
    const result = characterize({
      fromModel: CameraModelId.OPENCV,
      toModel: CameraModelId.RADIAL,
      sourceParams: [500, 550, 320, 240, 0.1, 0.05, 0.01, 0.02],
      targetParams: [525, 320, 240, 0.1, 0.05],
      resultType: 'approximate',
    });

    expect(result.characterization).toBe('lossy');
    expect(result.description).toContain('tangential');
    expect(result.description).toContain('fy (aspect ratio diff: 10.00%)');
  });

  it('reports thin-prism fisheye losses at the requested target detail', () => {
    const result = characterize({
      fromModel: CameraModelId.THIN_PRISM_FISHEYE,
      toModel: CameraModelId.RADIAL_FISHEYE,
      sourceParams: [500, 550, 320, 240, 0.1, 0.05, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06],
      targetParams: [525, 320, 240, 0.1, 0.05],
      resultType: 'approximate',
    });

    expect(result).toMatchObject({
      characterization: 'lossy',
      isLossy: true,
      description: 'Dropping: k3, k4, tangential, thin prism, fy',
    });
  });
});
