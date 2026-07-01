import { describe, it, expect } from 'vitest';
import { resolveUndistortionMode } from './undistortionMode';
import { CameraModelId } from '../types/colmap';

describe('resolveUndistortionMode', () => {
  it('keeps fullFrame for perspective (non-fisheye) cameras', () => {
    expect(resolveUndistortionMode('fullFrame', CameraModelId.PINHOLE)).toBe('fullFrame');
    expect(resolveUndistortionMode('fullFrame', CameraModelId.OPENCV)).toBe('fullFrame');
    expect(resolveUndistortionMode('fullFrame', CameraModelId.FULL_OPENCV)).toBe('fullFrame');
    expect(resolveUndistortionMode('fullFrame', CameraModelId.FOV)).toBe('fullFrame');
  });

  it('downgrades fullFrame to cropped for every fisheye model (avoids >180deg fold-over)', () => {
    expect(resolveUndistortionMode('fullFrame', CameraModelId.SIMPLE_RADIAL_FISHEYE)).toBe('cropped');
    expect(resolveUndistortionMode('fullFrame', CameraModelId.RADIAL_FISHEYE)).toBe('cropped');
    expect(resolveUndistortionMode('fullFrame', CameraModelId.OPENCV_FISHEYE)).toBe('cropped');
    expect(resolveUndistortionMode('fullFrame', CameraModelId.THIN_PRISM_FISHEYE)).toBe('cropped');
  });

  it('leaves cropped unchanged for all models', () => {
    expect(resolveUndistortionMode('cropped', CameraModelId.OPENCV)).toBe('cropped');
    expect(resolveUndistortionMode('cropped', CameraModelId.OPENCV_FISHEYE)).toBe('cropped');
  });

  it('downgrades the new fisheye models from fullFrame to cropped', () => {
    expect(resolveUndistortionMode('fullFrame', CameraModelId.FISHEYE)).toBe('cropped');
    expect(resolveUndistortionMode('fullFrame', CameraModelId.SIMPLE_FISHEYE)).toBe('cropped');
    expect(resolveUndistortionMode('fullFrame', CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe('cropped');
  });

  it('leaves spherical (EQUIRECTANGULAR) and pinhole-equivalent (EUCM) new models in their requested mode', () => {
    expect(resolveUndistortionMode('fullFrame', CameraModelId.EQUIRECTANGULAR)).toBe('fullFrame');
    expect(resolveUndistortionMode('fullFrame', CameraModelId.EUCM)).toBe('fullFrame');
  });
});
