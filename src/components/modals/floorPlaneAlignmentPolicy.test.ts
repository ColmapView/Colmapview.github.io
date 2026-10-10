import { describe, expect, it } from 'vitest';
import type { Plane } from '../../utils/ransac';
import {
  FLOOR_ALIGN_MODAL_ESTIMATED_HEIGHT,
  FLOOR_ALIGN_MODAL_ESTIMATED_WIDTH,
  FLOOR_COLOR_MODE_OPTIONS,
  FLOOR_DETECTION_MODAL_ESTIMATED_HEIGHT,
  FLOOR_DETECTION_MODAL_ESTIMATED_WIDTH,
  formatFloorSampleCount,
  getFloorAlignModalPanelStyle,
  getFloorColorModeAfterDetection,
  getFloorDetectionButtonStyle,
  getFloorDetectionModalPanelStyle,
  getFloorDetectedPlaneActionState,
  getFloorDetectionActionState,
  getFloorDetectionStatusInfo,
  getFloorInlierPercentage,
  getFloorModalHeaderDragStyle,
  getFloorModalOverlayStyle,
  getFloorPlaneControlState,
} from './floorPlaneAlignmentPolicy';
import { Z_INDEX } from '../../theme';

describe('floor plane alignment policy', () => {
  it('formats floor detection view state', () => {
    const plane: Plane = {
      normal: [0, 1, 0],
      d: 0,
      centroid: [0, 0, 0],
      inlierCount: 25,
      radius: 1,
    };

    expect(getFloorInlierPercentage(plane, 40)).toBe('62.5');
    expect(getFloorInlierPercentage(null, 40)).toBeNull();
    expect(getFloorInlierPercentage(plane, 0)).toBeNull();
    expect(getFloorColorModeAfterDetection('off', plane)).toBe('binary');
    expect(getFloorColorModeAfterDetection('distance', plane)).toBe('distance');
    expect(getFloorColorModeAfterDetection('off', null)).toBe('off');
    expect(formatFloorSampleCount(50000)).toBe('50k');
    expect(getFloorPlaneControlState(null, 'Y')).toEqual({
      disabled: true,
      axisLabel: 'Axis: Y',
    });
    expect(getFloorPlaneControlState(plane, 'Z')).toEqual({
      disabled: false,
      axisLabel: 'Axis: Z',
    });
    expect(getFloorDetectionActionState({
      isDetecting: true,
      hasPoints: true,
      hasPlane: true,
    })).toEqual({
      disabled: true,
      label: 'Detecting...',
    });
    expect(getFloorDetectionActionState({
      isDetecting: false,
      hasPoints: false,
      hasPlane: false,
    })).toEqual({
      disabled: true,
      label: 'Detect',
    });
    expect(getFloorDetectionActionState({
      isDetecting: false,
      hasPoints: true,
      hasPlane: true,
    })).toEqual({
      disabled: false,
      label: 'Re-detect',
    });
    expect(getFloorDetectedPlaneActionState(null)).toEqual({ disabled: true });
    expect(getFloorDetectedPlaneActionState(plane)).toEqual({ disabled: false });
    expect(getFloorDetectionStatusInfo(null, 40)).toEqual({
      heading: 'RANSAC Floor Detection:',
      lines: [
        'Detect dominant plane in the',
        'point cloud for alignment.',
      ],
    });
    expect(getFloorDetectionStatusInfo(plane, 40)).toEqual({
      heading: 'Detection Result:',
      lines: ['62.5% inliers (25 pts)'],
    });
    expect(FLOOR_COLOR_MODE_OPTIONS.map((option) => option.value)).toEqual([
      'off',
      'binary',
      'distance',
    ]);
  });

  it('derives floor modal dimensions and render styles', () => {
    expect(FLOOR_DETECTION_MODAL_ESTIMATED_WIDTH).toBe(280);
    expect(FLOOR_DETECTION_MODAL_ESTIMATED_HEIGHT).toBe(300);
    expect(FLOOR_ALIGN_MODAL_ESTIMATED_WIDTH).toBe(120);
    expect(FLOOR_ALIGN_MODAL_ESTIMATED_HEIGHT).toBe(40);
    expect(getFloorModalOverlayStyle(88)).toEqual({ zIndex: 88 });
    expect(getFloorDetectionModalPanelStyle({ x: 12, y: 34 })).toEqual({
      left: 12,
      top: 34,
      width: FLOOR_DETECTION_MODAL_ESTIMATED_WIDTH,
    });
    expect(getFloorDetectionButtonStyle()).toEqual({ flex: 1 });
    expect(getFloorAlignModalPanelStyle({ x: 56, y: 78 })).toEqual({
      left: 56,
      top: 78,
      zIndex: Z_INDEX.modalOverlay,
    });
    expect(getFloorAlignModalPanelStyle({ x: 56, y: 78 }, 99)).toEqual({
      left: 56,
      top: 78,
      zIndex: 99,
    });
    expect(getFloorModalHeaderDragStyle()).toEqual({ touchAction: 'none' });
  });
});
