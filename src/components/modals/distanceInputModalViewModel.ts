import type { CSSProperties } from 'react';
import * as THREE from 'three';
import type { AxesCoordinateSystem } from '../../store/types';
import type {
  PointPickingMode,
  SelectedPoint,
  TargetAxis,
} from '../../store/stores/pointPickingStore';
import type { Sim3d, Sim3dEuler } from '../../types/sim3d';
import { Z_INDEX } from '../../theme';
import { getCoordinateSystemAxisDirection, isAxisSemanticallyDown } from '../../utils/coordinateSystems';
import { parseFiniteNumberString } from '../../utils/numberParsing';
import {
  composeSim3d,
  computeDistanceScale,
  computeNormalAlignment,
  computeOriginTranslation,
  createSim3dFromEuler,
  sim3dToEuler,
} from '../../utils/sim3dTransforms';

export interface DistanceInputApplyOptions {
  pickingMode: PointPickingMode;
  selectedPoints: readonly SelectedPoint[];
  inputValue: string;
  normalFlipped: boolean;
  targetUp: THREE.Vector3;
  transform: Sim3dEuler;
}

export interface DistanceInputApplyResult {
  transform: Sim3dEuler;
  targetDistance: number | null;
}

interface DistanceInputModalPosition {
  x: number;
  y: number;
}

export const DISTANCE_INPUT_MODAL_ESTIMATED_WIDTH = 200;
export const DISTANCE_INPUT_MODAL_ESTIMATED_HEIGHT = 80;

export function isOriginDistanceMode(pickingMode: PointPickingMode): boolean {
  return pickingMode === 'origin-1pt';
}

export function isNormalDistanceMode(pickingMode: PointPickingMode): boolean {
  return pickingMode === 'normal-3pt';
}

export function shouldShowDistanceValueInput(pickingMode: PointPickingMode): boolean {
  return !isOriginDistanceMode(pickingMode) && !isNormalDistanceMode(pickingMode);
}

export function getDistanceInputTargetUp(
  axesCoordinateSystem: AxesCoordinateSystem,
  targetAxis: TargetAxis
): THREE.Vector3 {
  const direction = getCoordinateSystemAxisDirection(axesCoordinateSystem, targetAxis);

  // Mirror getFloorTargetUpVector: semantically-down axes (COLMAP/OpenCV +Y)
  // negate so the picked plane's up side never maps onto the convention's
  // down axis. `|| 0` avoids -0 components.
  if (isAxisSemanticallyDown(axesCoordinateSystem, targetAxis)) {
    return new THREE.Vector3(-direction[0] || 0, -direction[1] || 0, -direction[2] || 0);
  }
  return new THREE.Vector3(direction[0], direction[1], direction[2]);
}

export function getInitialDistanceInputValue(
  showDistanceModal: boolean,
  selectedPoints: readonly SelectedPoint[]
): string {
  if (!showDistanceModal || selectedPoints.length !== 2) return '';

  return selectedPoints[0].position.distanceTo(selectedPoints[1].position).toFixed(4);
}

export function getDistanceInputModalPanelStyle(
  position: DistanceInputModalPosition,
  zIndex = Z_INDEX.modalOverlay
): CSSProperties {
  return {
    left: position.x,
    top: position.y,
    zIndex,
  };
}

export function shouldApplyDistanceInputKey(key: string): boolean {
  return key === 'Enter';
}

export function getDistanceInputApplyResult({
  pickingMode,
  selectedPoints,
  inputValue,
  normalFlipped,
  targetUp,
  transform,
}: DistanceInputApplyOptions): DistanceInputApplyResult | null {
  if (isOriginDistanceMode(pickingMode)) {
    if (selectedPoints.length !== 1) return null;

    return {
      transform: composeWithCurrentTransform(
        computeOriginTranslation(selectedPoints[0].position),
        transform
      ),
      targetDistance: null,
    };
  }

  if (isNormalDistanceMode(pickingMode)) {
    if (selectedPoints.length !== 3) return null;

    return {
      transform: composeWithCurrentTransform(
        computeNormalAlignment(
          selectedPoints[0].position,
          selectedPoints[1].position,
          selectedPoints[2].position,
          normalFlipped,
          targetUp
        ),
        transform
      ),
      targetDistance: null,
    };
  }

  const targetDistance = parseFiniteNumberString(inputValue);
  if (targetDistance === null || targetDistance <= 0) return null;
  if (selectedPoints.length !== 2) return null;

  return {
    transform: composeWithCurrentTransform(
      computeDistanceScale(
        selectedPoints[0].position,
        selectedPoints[1].position,
        targetDistance
      ),
      transform
    ),
    targetDistance,
  };
}

function composeWithCurrentTransform(nextTransform: Sim3d, currentTransform: Sim3dEuler): Sim3dEuler {
  const currentSim3d = createSim3dFromEuler(currentTransform);
  const composed = composeSim3d(nextTransform, currentSim3d);

  return sim3dToEuler(composed);
}
