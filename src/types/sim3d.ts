/**
 * Sim3d transformation types for COLMAP reconstruction transformations.
 *
 * Sim3d represents a similarity transformation with 7 degrees of freedom:
 * - scale: uniform scaling factor
 * - rotation: 3D rotation (quaternion)
 * - translation: 3D translation vector
 *
 * Transform formula: x_new = scale * (rotation * x_old) + translation
 *
 * Matches COLMAP's Sim3d from colmap/geometry/sim3.h
 */

import * as THREE from 'three';

/**
 * Sim3d transformation using Three.js types for computation.
 * Transform: x_new = scale * (R * x_old) + t
 */
export interface Sim3d {
  scale: number;
  rotation: THREE.Quaternion;
  translation: THREE.Vector3;
}

/**
 * User-friendly Sim3d representation using Euler angles.
 * Used for UI controls where Euler angles are more intuitive than quaternions.
 */
export interface Sim3dEuler {
  scale: number;
  rotationX: number; // radians
  rotationY: number; // radians
  rotationZ: number; // radians
  translationX: number;
  translationY: number;
  translationZ: number;
}

/**
 * Preset transformation types for common operations.
 */
export type TransformPreset = 'identity' | 'centerAtOrigin' | 'normalizeScale';
