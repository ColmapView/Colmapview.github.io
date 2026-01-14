/**
 * COLMAP coordinate transform utilities.
 *
 * COLMAP stores camera poses as world-to-camera transforms (qvec, tvec),
 * where qvec is a quaternion in (w, x, y, z) format.
 *
 * These utilities convert to world coordinates for 3D visualization.
 */

import * as THREE from 'three';
import type { Image } from '../types/colmap';

/**
 * Convert COLMAP qvec to THREE.Quaternion.
 * COLMAP uses (w, x, y, z) format, THREE uses (x, y, z, w).
 * The result is inverted to convert from world-to-camera to camera-to-world.
 */
export function getImageWorldQuaternion(image: Image): THREE.Quaternion {
  return new THREE.Quaternion(
    image.qvec[1],  // x
    image.qvec[2],  // y
    image.qvec[3],  // z
    image.qvec[0]   // w
  ).invert();
}

/**
 * Get the world position of a camera from its COLMAP pose.
 * Converts from world-to-camera (qvec, tvec) to camera position in world space.
 */
export function getImageWorldPosition(image: Image): THREE.Vector3 {
  const quat = getImageWorldQuaternion(image);
  const t = new THREE.Vector3(image.tvec[0], image.tvec[1], image.tvec[2]);
  return t.negate().applyQuaternion(quat);
}

/**
 * Get both world position and quaternion for an image.
 * More efficient when you need both values.
 */
export function getImageWorldPose(image: Image): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const quaternion = getImageWorldQuaternion(image);
  const t = new THREE.Vector3(image.tvec[0], image.tvec[1], image.tvec[2]);
  const position = t.negate().applyQuaternion(quaternion);
  return { position, quaternion };
}
