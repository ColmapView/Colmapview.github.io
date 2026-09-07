import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import type { CameraController } from '../../features/cameraControl';
import type { CameraViewState } from '../../store/types';
import { useCameraStore } from '../../store/stores/cameraStore';
import { buildCameraViewState, getViewDirectionVectors } from './trackballCameraViewPolicy';
import { getTrackballInitialDistance } from './trackballCameraLifecyclePolicy';
import type { TrackballAnimationTarget } from './useTrackballFlyTo';

interface Options {
  camera: THREE.Camera;
  target: [number, number, number]; radius: number;
  pivot: MutableRefObject<THREE.Vector3>; quaternion: MutableRefObject<THREE.Quaternion>;
  distance: MutableRefObject<number>; targetDistance: MutableRefObject<number>; orthoZoom: MutableRefObject<number>;
  angularVelocity: MutableRefObject<{ x: number; y: number }>;
  smoothedVelocity: MutableRefObject<{ x: number; y: number }>;
  flyVelocity: MutableRefObject<THREE.Vector3>; keys: MutableRefObject<Set<string>>;
  animation: MutableRefObject<TrackballAnimationTarget | null>;
  worldUp: MutableRefObject<THREE.Vector3>;
  rotate: (yaw: number, pitch: number) => void;
  update: () => void;
  imagePose: (id: number) => CameraViewState | null;
}
export function createTrackballCommandController(o: Options): CameraController {
  const read = () => ({ ...buildCameraViewState(o.camera.position, o.quaternion.current, o.pivot.current, o.distance.current),
    animating: o.animation.current !== null,
    projection: o.camera instanceof THREE.OrthographicCamera ? 'orthographic' : 'perspective',
    zoom: o.camera instanceof THREE.OrthographicCamera ? o.camera.zoom : 1 });
  const stop = () => {
    const store = useCameraStore.getState();
    store.setAutoRotateMode('off'); store.clearFlyTo(); store.clearFlyToViewState();
    o.animation.current = null;
    o.angularVelocity.current = { x: 0, y: 0 }; o.smoothedVelocity.current = { x: 0, y: 0 };
    o.flyVelocity.current.set(0, 0, 0); o.keys.current.clear();
    o.targetDistance.current = o.distance.current;
  };
  const applyPose = (pose: CameraViewState) => {
    o.camera.position.fromArray(pose.position); o.camera.quaternion.fromArray(pose.quaternion);
    o.quaternion.current.copy(o.camera.quaternion); o.pivot.current.fromArray(pose.target);
    o.distance.current = pose.distance; o.targetDistance.current = pose.distance;
  };
  return { read, execute(operation, input) {
    // Validate geometry before stopping or changing an existing view.
    let pose: CameraViewState | null = null;
    if (operation === 'image') {
      pose = o.imagePose(Number(input.imageId));
      if (!pose) throw new Error('Unknown image ID or missing camera pose. Query dataset images first.');
    }
    if (operation === 'lookAt' || operation === 'preset') {
      let position: THREE.Vector3; let pivot: THREE.Vector3; let up: THREE.Vector3;
      if (operation === 'lookAt') {
        position = new THREE.Vector3(Number(input.x), Number(input.y), Number(input.z));
        pivot = new THREE.Vector3(Number(input.targetX), Number(input.targetY), Number(input.targetZ));
        up = new THREE.Vector3(Number(input.upX), Number(input.upY), Number(input.upZ));
      } else {
        pivot = new THREE.Vector3(...o.target);
        const vectors = getViewDirectionVectors(input.direction as Parameters<typeof getViewDirectionVectors>[0],
          getTrackballInitialDistance(o.radius), useCameraStore.getState().horizonLock !== 'off', o.worldUp.current);
        position = pivot.clone().add(vectors.offset); up = vectors.up;
      }
      const direction = position.clone().sub(pivot);
      if (operation === 'lookAt' && (direction.length() < 1e-6 || up.length() < 1e-6 || direction.clone().normalize().cross(up.clone().normalize()).length() < 1e-6)) {
        throw new Error('Use distinct position/target and a nonzero up vector not parallel to the view direction.');
      }
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, pivot, up));
      pose = buildCameraViewState(position, quaternion, pivot, direction.length());
    }
    stop();
    if (pose) applyPose(pose);
    if (operation === 'orbit') { o.rotate(Number(input.yaw), Number(input.pitch)); o.update(); }
    if (operation === 'pan') {
      const delta = new THREE.Vector3(Number(input.right), Number(input.up), -Number(input.forward)).applyQuaternion(o.quaternion.current);
      o.camera.position.add(delta); o.pivot.current.add(delta);
    }
    if (operation === 'zoom') {
      if (o.camera instanceof THREE.OrthographicCamera) {
        o.camera.zoom = THREE.MathUtils.clamp(o.camera.zoom / Number(input.factor), 0.001, 10000);
        o.orthoZoom.current = o.camera.zoom; o.camera.updateProjectionMatrix();
      } else {
        const distance = THREE.MathUtils.clamp(o.distance.current * Number(input.factor), 1e-6, 1e12);
        o.camera.position.copy(o.pivot.current).add(new THREE.Vector3(0, 0, distance).applyQuaternion(o.quaternion.current));
        o.distance.current = distance; o.targetDistance.current = distance;
      }
    }
    o.camera.updateMatrixWorld(true);
  } };
}
