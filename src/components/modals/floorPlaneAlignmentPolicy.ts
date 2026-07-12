import type { CSSProperties } from 'react';
import * as THREE from 'three';
import type { FloorColorMode, FloorTargetAxis } from '../../store/stores/floorPlaneStore';
import type { AxesCoordinateSystem } from '../../store/types';
import type { Image } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';
import { Z_INDEX } from '../../theme';
import { getImageWorldPosition } from '../../utils/colmapTransforms';
import { getCoordinateSystemAxisDirection, isAxisSemanticallyDown } from '../../utils/coordinateSystems';
import {
  computeDistancesToPlane,
  detectPlaneRANSAC,
  flipPlaneNormal,
  transformPositions,
  type Plane,
  type RansacParams,
} from '../../utils/ransac';
import {
  composeSim3d,
  computePlaneAlignment,
  createSim3dFromEuler,
  isIdentityEuler,
  sim3dToEuler,
} from '../../utils/sim3dTransforms';

export const FLOOR_COLOR_MODE_OPTIONS: { value: FloorColorMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'binary', label: 'Binary (In/Out)' },
  { value: 'distance', label: 'Distance' },
];

export const FLOOR_DETECTION_MODAL_ESTIMATED_WIDTH = 280;
export const FLOOR_DETECTION_MODAL_ESTIMATED_HEIGHT = 300;
export const FLOOR_ALIGN_MODAL_ESTIMATED_WIDTH = 120;
export const FLOOR_ALIGN_MODAL_ESTIMATED_HEIGHT = 40;

export type FloorDetectionParams =
  Pick<RansacParams, 'distanceThreshold' | 'sampleCount'> &
  Partial<Pick<RansacParams, 'maxIterations'>>;

export interface FloorDetectionResult {
  positions: Float32Array;
  plane: Plane | null;
  distances: Float32Array | null;
}

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
  zIndex = Z_INDEX.modalOverlay
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

export function getFloorTargetUpVector(
  coordinateSystem: AxesCoordinateSystem,
  targetAxis: FloorTargetAxis
): THREE.Vector3 {
  const direction = getCoordinateSystemAxisDirection(coordinateSystem, targetAxis);
  // The oriented floor normal points toward the cameras (the floor's up
  // side). For semantically-DOWN axes (COLMAP/OpenCV +Y) the alignment target
  // must be the negated axis, otherwise the convention's down axis ends up
  // pointing at the frustums (reported bug 2026-07-12). `|| 0` avoids -0.
  if (isAxisSemanticallyDown(coordinateSystem, targetAxis)) {
    return new THREE.Vector3(-direction[0] || 0, -direction[1] || 0, -direction[2] || 0);
  }
  return new THREE.Vector3(direction[0], direction[1], direction[2]);
}

export function getFloorDetectionPositions(
  positions: Float32Array,
  transform: Sim3dEuler
): Float32Array {
  if (isIdentityEuler(transform)) {
    return positions;
  }

  return transformPositions(positions, createSim3dFromEuler(transform));
}

export function detectFloorPlaneFromPositions(
  positions: Float32Array,
  transform: Sim3dEuler,
  params: FloorDetectionParams
): FloorDetectionResult {
  const transformedPositions = getFloorDetectionPositions(positions, transform);
  const plane = detectPlaneRANSAC(transformedPositions, params);

  return {
    positions: transformedPositions,
    plane,
    distances: plane ? computeDistancesToPlane(transformedPositions, plane) : null,
  };
}

export function getFloorNormalFlippedForCameraDownSide(
  plane: Plane | null,
  images: Iterable<Image>,
  transform: Sim3dEuler,
  epsilon = 1e-6,
  fallbackPositions?: Float32Array
): boolean {
  if (!plane) return false;

  const sideEpsilon = Math.max(0, epsilon);
  const normal = new THREE.Vector3(...plane.normal);
  const sim3d = isIdentityEuler(transform) ? null : createSim3dFromEuler(transform);
  let positiveSideCameraCount = 0;
  let negativeSideCameraCount = 0;

  for (const image of images) {
    const position = getImageWorldPosition(image);
    if (sim3d) {
      position
        .applyQuaternion(sim3d.rotation)
        .multiplyScalar(sim3d.scale)
        .add(sim3d.translation);
    }

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      continue;
    }

    const signedDistance = normal.dot(position) + plane.d;
    if (signedDistance > sideEpsilon) {
      positiveSideCameraCount++;
    } else if (signedDistance < -sideEpsilon) {
      negativeSideCameraCount++;
    }
  }

  if (positiveSideCameraCount !== negativeSideCameraCount) {
    return positiveSideCameraCount < negativeSideCameraCount;
  }

  // Cameras tied (or none countable): without a tie-breaker the raw RANSAC
  // sign — random per run — would leak into the arrow. The scene bulk sits on
  // the up side of a floor, so let the point majority vote the same way.
  // fallbackPositions are in the already-transformed frame (the caller hands
  // over detectFloorPlaneFromPositions's output), so no sim3d here.
  if (fallbackPositions) {
    let positiveSidePointCount = 0;
    let negativeSidePointCount = 0;
    for (let i = 0; i + 2 < fallbackPositions.length; i += 3) {
      const signedDistance =
        normal.x * fallbackPositions[i] +
        normal.y * fallbackPositions[i + 1] +
        normal.z * fallbackPositions[i + 2] +
        plane.d;
      if (signedDistance > sideEpsilon) {
        positiveSidePointCount++;
      } else if (signedDistance < -sideEpsilon) {
        negativeSidePointCount++;
      }
    }
    return positiveSidePointCount < negativeSidePointCount;
  }

  return false;
}

export function computeFloorAlignmentTransform(
  plane: Plane,
  normalFlipped: boolean,
  targetUp: THREE.Vector3,
  currentTransform: Sim3dEuler
): Sim3dEuler {
  const orientedPlane = normalFlipped ? flipPlaneNormal(plane) : plane;
  const alignSim3d = computePlaneAlignment(
    orientedPlane.normal,
    orientedPlane.centroid,
    targetUp
  );
  const currentSim3d = createSim3dFromEuler(currentTransform);

  return sim3dToEuler(composeSim3d(alignSim3d, currentSim3d));
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
