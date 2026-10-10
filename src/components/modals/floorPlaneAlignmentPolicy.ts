import type { CSSProperties } from 'react';
import type { FloorColorMode, FloorTargetAxis } from '../../store/stores/floorPlaneStore';
import { Z_INDEX } from '../../theme';
import type { Plane } from '../../utils/ransac';

export const FLOOR_COLOR_MODE_OPTIONS: { value: FloorColorMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'binary', label: 'Binary (In/Out)' },
  { value: 'distance', label: 'Distance' },
];

export const FLOOR_DETECTION_MODAL_ESTIMATED_WIDTH = 280;
export const FLOOR_DETECTION_MODAL_ESTIMATED_HEIGHT = 300;
export const FLOOR_ALIGN_MODAL_ESTIMATED_WIDTH = 120;
export const FLOOR_ALIGN_MODAL_ESTIMATED_HEIGHT = 40;

export interface FloorPlaneControlState {
  disabled: boolean;
  axisLabel: string;
}

export interface FloorDetectionActionState {
  disabled: boolean;
  label: string;
}

export interface FloorDetectedPlaneActionState {
  disabled: boolean;
}

export interface FloorDetectionStatusInfo {
  heading: string;
  lines: string[];
}

interface FloorModalPosition {
  x: number;
  y: number;
}

export function getFloorModalOverlayStyle(zIndex: number): CSSProperties {
  return { zIndex };
}

export function getFloorDetectionModalPanelStyle(position: FloorModalPosition): CSSProperties {
  return {
    left: position.x,
    top: position.y,
    width: FLOOR_DETECTION_MODAL_ESTIMATED_WIDTH,
  };
}

export function getFloorDetectionButtonStyle(): CSSProperties {
  return { flex: 1 };
}

export function getFloorAlignModalPanelStyle(
  position: FloorModalPosition,
  zIndex: number = Z_INDEX.modalOverlay
): CSSProperties {
  return {
    left: position.x,
    top: position.y,
    zIndex,
  };
}

export function getFloorModalHeaderDragStyle(): CSSProperties {
  return { touchAction: 'none' };
}

export function getFloorInlierPercentage(
  plane: Plane | null,
  pointCount: number
): string | null {
  if (!plane || pointCount <= 0) {
    return null;
  }

  return ((plane.inlierCount / pointCount) * 100).toFixed(1);
}

export function getFloorColorModeAfterDetection(
  currentMode: FloorColorMode,
  plane: Plane | null
): FloorColorMode {
  if (plane && currentMode === 'off') {
    return 'binary';
  }

  return currentMode;
}

export function formatFloorSampleCount(value: number): string {
  return `${(value / 1000).toFixed(0)}k`;
}

export function getFloorPlaneControlState(
  plane: Plane | null,
  targetAxis: FloorTargetAxis
): FloorPlaneControlState {
  return {
    disabled: plane === null,
    axisLabel: `Axis: ${targetAxis}`,
  };
}

export function getFloorDetectionActionState({
  isDetecting,
  hasPoints,
  hasPlane,
}: {
  isDetecting: boolean;
  hasPoints: boolean;
  hasPlane: boolean;
}): FloorDetectionActionState {
  return {
    disabled: isDetecting || !hasPoints,
    label: isDetecting ? 'Detecting...' : hasPlane ? 'Re-detect' : 'Detect',
  };
}

export function getFloorDetectedPlaneActionState(
  plane: Plane | null
): FloorDetectedPlaneActionState {
  return {
    disabled: plane === null,
  };
}

export function getFloorDetectionStatusInfo(
  plane: Plane | null,
  pointCount: number
): FloorDetectionStatusInfo {
  if (!plane) {
    return {
      heading: 'RANSAC Floor Detection:',
      lines: [
        'Detect dominant plane in the',
        'point cloud for alignment.',
      ],
    };
  }

  const inlierPercentage = getFloorInlierPercentage(plane, pointCount);

  return {
    heading: 'Detection Result:',
    lines: [
      `${inlierPercentage}% inliers (${plane.inlierCount.toLocaleString()} pts)`,
    ],
  };
}
