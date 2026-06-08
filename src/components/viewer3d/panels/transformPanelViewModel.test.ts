import { describe, expect, it } from 'vitest';
import type { Sim3dEuler } from '../../../types/sim3d';
import {
  degreesToRadians,
  formatTransformDegreesValue,
  formatTransformScaleValue,
  formatTransformTranslationValue,
  getNextTransformPickingMode,
  getPointCloudStateForPickingMode,
  getTransformPanelState,
  getTransformPickingButtonState,
  radiansToDegrees,
} from './transformPanelViewModel';

const identityTransform: Sim3dEuler = {
  scale: 1,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  translationX: 0,
  translationY: 0,
  translationZ: 0,
};

describe('transform panel view-model helpers', () => {
  it('converts between radians and degrees for slider display', () => {
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180);
    expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90);
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
    expect(degreesToRadians(-90)).toBeCloseTo(-Math.PI / 2);
  });

  it('formats transform slider values', () => {
    expect(formatTransformScaleValue(1)).toBe('1.00');
    expect(formatTransformScaleValue(1.234)).toBe('1.23');
    expect(formatTransformDegreesValue(32.6)).toBe('33°');
    expect(formatTransformTranslationValue(-2.34)).toBe('-2.3');
  });

  it('disables transform actions when the transform is unchanged', () => {
    expect(getTransformPanelState({
      transform: identityTransform,
      showGizmo: false,
      hasPoints: false,
      hasDroppedFiles: false,
    })).toEqual({
      hasChanges: false,
      canApplyTransform: false,
      canResetTransform: false,
      canReloadDroppedFiles: false,
      canRunFloorDetection: false,
      tooltip: 'Transform (T): Off',
    });
  });

  it('enables transform actions when the transform is changed', () => {
    expect(getTransformPanelState({
      transform: { ...identityTransform, translationX: 0.5 },
      showGizmo: true,
      hasPoints: true,
      hasDroppedFiles: true,
    })).toEqual({
      hasChanges: true,
      canApplyTransform: true,
      canResetTransform: true,
      canReloadDroppedFiles: true,
      canRunFloorDetection: true,
      tooltip: 'Transform (T): On (dbl-click to apply)',
    });
  });

  it('toggles target picking modes', () => {
    expect(getNextTransformPickingMode('off', 'origin-1pt')).toBe('origin-1pt');
    expect(getNextTransformPickingMode('origin-1pt', 'origin-1pt')).toBe('off');
    expect(getNextTransformPickingMode('distance-2pt', 'normal-3pt')).toBe('normal-3pt');
  });

  it('returns picking button activity and next mode', () => {
    expect(getTransformPickingButtonState('origin-1pt', 'origin-1pt')).toEqual({
      isActive: true,
      nextMode: 'off',
    });
    expect(getTransformPickingButtonState('distance-2pt', 'origin-1pt')).toEqual({
      isActive: false,
      nextMode: 'origin-1pt',
    });
  });

  it('makes point cloud state pickable when entering point-picking modes', () => {
    expect(getPointCloudStateForPickingMode({
      showPointCloud: false,
      colorMode: 'trackLength',
    })).toEqual({
      showPointCloud: true,
      colorMode: 'rgb',
    });
    expect(getPointCloudStateForPickingMode({
      showPointCloud: true,
      colorMode: 'splats',
    })).toEqual({
      showPointCloud: true,
      colorMode: 'splatPoints',
    });
    expect(getPointCloudStateForPickingMode({
      showPointCloud: true,
      colorMode: 'splatPoints',
    })).toEqual({
      showPointCloud: true,
      colorMode: 'splatPoints',
    });
    expect(getPointCloudStateForPickingMode({
      showPointCloud: true,
      colorMode: 'rgb',
    })).toEqual({
      showPointCloud: true,
      colorMode: 'rgb',
    });
  });
});
