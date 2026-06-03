import * as THREE from 'three';
import type { ViewDirection } from '../../store/stores/uiStore';
import type { CameraViewState } from '../../store/types';

export interface ViewVectors {
  offset: THREE.Vector3;
  up: THREE.Vector3;
}

const AXIS_VIEWS: Record<Exclude<ViewDirection, 'reset'>, ViewVectors> = {
  x: { offset: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  y: { offset: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  z: { offset: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  '-x': { offset: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  '-y': { offset: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  '-z': { offset: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
};

export function buildCameraViewState(
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  target: THREE.Vector3,
  distance: number
): CameraViewState {
  return {
    position: [position.x, position.y, position.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    target: [target.x, target.y, target.z],
    distance,
  };
}

export function buildCameraViewStateHash(state: CameraViewState): string {
  return `${state.position.join(',')},${state.target.join(',')},${state.quaternion.join(',')}`;
}

export function getResetViewVectors(
  distance: number,
  horizonLocked: boolean,
  worldUp: THREE.Vector3
): ViewVectors {
  const sqrt2_2 = Math.SQRT1_2;

  if (horizonLocked) {
    return {
      offset: new THREE.Vector3(-0.5, -sqrt2_2 * worldUp.y, -0.5)
        .normalize()
        .multiplyScalar(distance),
      up: worldUp.clone(),
    };
  }

  return {
    offset: new THREE.Vector3(-0.5, -sqrt2_2, -0.5)
      .normalize()
      .multiplyScalar(distance),
    up: new THREE.Vector3(0.5, -sqrt2_2, 0.5).normalize(),
  };
}

export function getViewDirectionVectors(
  viewDirection: ViewDirection,
  distance: number,
  horizonLocked: boolean,
  worldUp: THREE.Vector3
): ViewVectors {
  if (viewDirection === 'reset') {
    return getResetViewVectors(distance, horizonLocked, worldUp);
  }

  const view = AXIS_VIEWS[viewDirection];

  if (horizonLocked) {
    if (viewDirection === 'y') {
      return {
        offset: worldUp.clone().multiplyScalar(distance),
        up: new THREE.Vector3(0, 0, -1),
      };
    }

    return {
      offset: view.offset.clone().multiplyScalar(distance),
      up: worldUp.clone(),
    };
  }

  return {
    offset: view.offset.clone().multiplyScalar(distance),
    up: view.up.clone(),
  };
}
