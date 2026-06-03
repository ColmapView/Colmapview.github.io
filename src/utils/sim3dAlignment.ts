import * as THREE from 'three';
import type { Sim3d } from '../types/sim3d';

function identitySim3d(): Sim3d {
  return {
    scale: 1,
    rotation: new THREE.Quaternion(),
    translation: new THREE.Vector3(),
  };
}

/**
 * Compute scale transform to set distance between two points to a target value.
 * Scale is applied uniformly about the midpoint of the two points.
 */
export function computeDistanceScale(
  point1: THREE.Vector3,
  point2: THREE.Vector3,
  targetDistance: number
): Sim3d {
  const currentDistance = point1.distanceTo(point2);

  if (currentDistance < 1e-10) {
    return identitySim3d();
  }

  const scale = targetDistance / currentDistance;
  const midpoint = new THREE.Vector3()
    .addVectors(point1, point2)
    .multiplyScalar(0.5);
  const translation = midpoint.clone().multiplyScalar(1 - scale);

  return {
    scale,
    rotation: new THREE.Quaternion(),
    translation,
  };
}

/**
 * Compute translation transform to move a point to the world origin.
 */
export function computeOriginTranslation(point: THREE.Vector3): Sim3d {
  return {
    scale: 1,
    rotation: new THREE.Quaternion(),
    translation: new THREE.Vector3(-point.x, -point.y, -point.z),
  };
}

/**
 * Compute rotation transform to align a plane's normal with the target up axis.
 * The plane is defined by three points, and rotation is about their centroid.
 */
export function computeNormalAlignment(
  point1: THREE.Vector3,
  point2: THREE.Vector3,
  point3: THREE.Vector3,
  flipNormal = false,
  targetUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0)
): Sim3d {
  const v1 = new THREE.Vector3().subVectors(point2, point1);
  const v2 = new THREE.Vector3().subVectors(point3, point1);
  const normal = new THREE.Vector3().crossVectors(v1, v2);

  if (normal.lengthSq() < 1e-10) {
    return identitySim3d();
  }

  normal.normalize();

  if (flipNormal) {
    normal.negate();
  }

  const upNormalized = targetUp.clone().normalize();
  const dot = normal.dot(upNormalized);
  if (Math.abs(dot - 1) < 1e-6) {
    return identitySim3d();
  }

  let rotation: THREE.Quaternion;

  if (Math.abs(dot + 1) < 1e-6) {
    const perpAxis = new THREE.Vector3(1, 0, 0);
    if (Math.abs(upNormalized.dot(perpAxis)) > 0.9) {
      perpAxis.set(0, 0, 1);
    }
    rotation = new THREE.Quaternion().setFromAxisAngle(perpAxis, Math.PI);
  } else {
    rotation = new THREE.Quaternion().setFromUnitVectors(normal, upNormalized);
  }

  const centroid = new THREE.Vector3()
    .add(point1)
    .add(point2)
    .add(point3)
    .divideScalar(3);
  const rotatedCentroid = centroid.clone().applyQuaternion(rotation);
  const translation = new THREE.Vector3().subVectors(centroid, rotatedCentroid);

  return {
    scale: 1,
    rotation,
    translation,
  };
}

/**
 * Compute a transform that aligns a detected floor plane with a target axis
 * and translates it to pass through the origin.
 */
export function computePlaneAlignment(
  normal: [number, number, number],
  centroid: [number, number, number],
  targetUp: THREE.Vector3
): Sim3d {
  const normalVec = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
  const centroidVec = new THREE.Vector3(centroid[0], centroid[1], centroid[2]);

  const rotation = new THREE.Quaternion().setFromUnitVectors(normalVec, targetUp.clone().normalize());
  const rotatedCentroid = centroidVec.clone().applyQuaternion(rotation);
  const distanceAlongAxis = rotatedCentroid.dot(targetUp);
  const translation = targetUp.clone().multiplyScalar(-distanceAlongAxis);

  return { rotation, translation, scale: 1 };
}
