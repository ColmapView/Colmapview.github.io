import type { MutableRefObject } from 'react';
import type { RootState } from '@react-three/fiber';
import type * as THREE from 'three';
import type { CameraViewState } from '../../store/types';
import type { AngularVelocity } from './trackballCameraLifecyclePolicy';

export interface MotionRefs {
  angularVelocityRef: MutableRefObject<AngularVelocity>;
  flyVelocityRef: MutableRefObject<THREE.Vector3>;
}

export interface CameraRefs {
  targetVecRef: MutableRefObject<THREE.Vector3>;
  cameraQuatRef: MutableRefObject<THREE.Quaternion>;
  distanceRef: MutableRefObject<number>;
  targetDistanceRef: MutableRefObject<number>;
}

export interface TrackballControlsApiFields {
  enabled: MutableRefObject<boolean>;
  dragging: MutableRefObject<boolean>;
  wheelHandled: MutableRefObject<boolean>;
  getCurrentViewState: () => CameraViewState;
}

export type TrackballControlsApi = THREE.EventDispatcher & TrackballControlsApiFields;

export type TrackballStateSetter = RootState['set'];
