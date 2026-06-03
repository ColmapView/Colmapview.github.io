import * as THREE from 'three';
import type {
  PointPickingMode,
  SelectedPoint,
} from '../../store/stores/pointPickingStore';

export {
  getRequiredPointCount,
  needsMoreSelectedPoints,
} from '../../store/pointPickingPolicy';

const BASE_MARKER_SCALE = 0.012;
const SINGLE_POINT_MARKER_SCALE = 0.015;
const DISTANCE_MARKER_SCALE = 0.015;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface NormalArrowData {
  start: THREE.Vector3;
  end: THREE.Vector3;
  quaternion: THREE.Quaternion;
  coneHeight: number;
  coneRadius: number;
  normal: THREE.Vector3;
  trianglePositions: Float32Array;
}

export function shouldShowSelectedPointMarkers(
  selectedPointCount: number,
  hoveredPoint: THREE.Vector3 | null
): boolean {
  return selectedPointCount > 0 || hoveredPoint !== null;
}

export function shouldInitializeNormalTargetAxis(
  previousMode: PointPickingMode,
  currentMode: PointPickingMode
): boolean {
  return currentMode === 'normal-3pt' && previousMode !== 'normal-3pt';
}

export function getSelectedPointMarkerScale(selectedPoints: readonly SelectedPoint[]): number {
  if (selectedPoints.length < 2) {
    return SINGLE_POINT_MARKER_SCALE;
  }

  const distance = selectedPoints[0].position.distanceTo(selectedPoints[1].position);
  return Math.max(BASE_MARKER_SCALE, distance * DISTANCE_MARKER_SCALE);
}

export function getSelectedPointLinePositions(
  selectedPoints: readonly SelectedPoint[],
  pickingMode: PointPickingMode
): number[] | null {
  if (selectedPoints.length < 2) return null;

  const positions = selectedPoints.flatMap((point) => [
    point.position.x,
    point.position.y,
    point.position.z,
  ]);

  if (pickingMode === 'normal-3pt' && selectedPoints.length === 3) {
    const first = selectedPoints[0].position;
    positions.push(first.x, first.y, first.z);
  }

  return positions;
}

export function getNormalArrowData(
  selectedPoints: readonly SelectedPoint[],
  pickingMode: PointPickingMode,
  normalFlipped: boolean
): NormalArrowData | null {
  if (pickingMode !== 'normal-3pt' || selectedPoints.length !== 3) return null;

  const p1 = selectedPoints[0].position;
  const p2 = selectedPoints[1].position;
  const p3 = selectedPoints[2].position;

  const v1 = new THREE.Vector3().subVectors(p2, p1);
  const v2 = new THREE.Vector3().subVectors(p3, p1);
  const normal = new THREE.Vector3().crossVectors(v1, v2);

  if (normal.lengthSq() < 1e-10) return null;

  normal.normalize();

  if (normalFlipped) {
    normal.negate();
  }

  const start = new THREE.Vector3()
    .add(p1)
    .add(p2)
    .add(p3)
    .divideScalar(3);

  const size = Math.max(v1.length(), v2.length()) * 0.5;
  const end = start.clone().add(normal.clone().multiplyScalar(size));

  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

  return {
    start,
    end,
    quaternion,
    coneHeight: size * 0.2,
    coneRadius: size * 0.04,
    normal,
    trianglePositions: new Float32Array([
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z,
    ]),
  };
}

export function getScreenPoint(clientX: number, clientY: number): ScreenPoint {
  return { x: clientX, y: clientY };
}
