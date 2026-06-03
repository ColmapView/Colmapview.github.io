import { describe, expect, it } from 'vitest';
import {
  CAMERA_DISPLAY_MODE_OPTIONS,
  CAMERA_SCALE_FACTOR_OPTIONS,
  getCameraDisplayHint,
  getFrustumColorModeOptions,
  getSupportedCameraDisplayMode,
} from './cameraDisplayPanelViewModel';

describe('camera display panel view-model helpers', () => {
  it('defines stable camera display mode labels', () => {
    expect(CAMERA_DISPLAY_MODE_OPTIONS).toEqual([
      { value: 'frustum', label: 'Frustum' },
      { value: 'arrow', label: 'Arrow' },
      { value: 'imageplane', label: 'Image Plane' },
    ]);
  });

  it('adds rig-frame color only when rig data is available', () => {
    expect(getFrustumColorModeOptions(false)).toEqual([
      { value: 'single', label: 'Single' },
      { value: 'byCamera', label: 'By Cam' },
    ]);
    expect(getFrustumColorModeOptions(true)).toEqual([
      { value: 'single', label: 'Single' },
      { value: 'byCamera', label: 'By Cam' },
      { value: 'byRigFrame', label: 'By Frame' },
    ]);
  });

  it('returns fresh frustum color options for each call', () => {
    const options = getFrustumColorModeOptions(true);

    options.pop();

    expect(getFrustumColorModeOptions(true).map((option) => option.value)).toEqual([
      'single',
      'byCamera',
      'byRigFrame',
    ]);
  });

  it('defines stable camera scale factor labels', () => {
    expect(CAMERA_SCALE_FACTOR_OPTIONS).toEqual([
      { value: '0.1', label: '0.1×' },
      { value: '1', label: '1×' },
      { value: '10', label: '10×' },
    ]);
  });

  it('returns camera display hints by mode', () => {
    expect(getCameraDisplayHint('frustum')).toEqual({
      title: 'Frustum:',
      lines: ['Full camera frustum', 'pyramid wireframes.'],
    });
    expect(getCameraDisplayHint('arrow')).toEqual({
      title: 'Arrow:',
      lines: ['Simple arrow showing', 'camera look direction.'],
    });
    expect(getCameraDisplayHint('imageplane')).toEqual({
      title: 'Image Plane:',
      lines: ['Shows image textures', 'on camera planes.'],
    });
  });

  it('falls back to frustum for stale camera display modes', () => {
    expect(getSupportedCameraDisplayMode('off')).toBeNull();
    expect(getSupportedCameraDisplayMode('imagePlane')).toBeNull();
    expect(getCameraDisplayHint('imagePlane')).toEqual({
      title: 'Frustum:',
      lines: ['Full camera frustum', 'pyramid wireframes.'],
    });
  });
});
