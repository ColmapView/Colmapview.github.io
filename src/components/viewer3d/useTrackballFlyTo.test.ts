import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getImageFlyToPose } from './useTrackballFlyTo';
import { SPHERICAL_FLYTO_DISTANCE_FACTOR } from './sphericalFlyTo';
import { buildCamera, buildImage, buildReconstruction } from '../../test/builders';
import { CameraModelId } from '../../types/colmap';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import type { Sim3dEuler } from '../../types/sim3d';

const IDENTITY: Sim3dEuler = {
  scale: 1,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  translationX: 0,
  translationY: 0,
  translationZ: 0,
};
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CAMERA_SCALE = 2;
const ORBIT_DISTANCE = 5;

describe('getImageFlyToPose', () => {
  it('pinhole cameras fly to AT the camera center (pre-existing pose contract unchanged)', () => {
    const camera = buildCamera({ cameraId: 7, modelId: CameraModelId.PINHOLE });
    const image = buildImage({ imageId: 3, cameraId: 7, tvec: [-1, -2, -3] });
    const reconstruction = buildReconstruction({ cameras: [camera], images: [image] });
    const center = getImageWorldPose(image).position; // identity transform => world position
    const viewer = new THREE.Vector3(50, 0, 0);

    const pose = getImageFlyToPose(
      reconstruction, 3, IDENTITY, 'off', WORLD_UP, ORBIT_DISTANCE, CAMERA_SCALE, viewer
    );

    expect(pose).not.toBeNull();
    // Pinhole: viewer sits AT the camera center; orbit distance untouched.
    expect(pose!.position.distanceTo(center)).toBeCloseTo(0, 10);
    expect(pose!.distance).toBe(ORBIT_DISTANCE);
  });

  it('spherical cameras stop OUTSIDE the sphere, orbiting its center', () => {
    const camera = buildCamera({
      cameraId: 8,
      modelId: CameraModelId.EQUIRECTANGULAR,
      width: 3840,
      height: 1920,
      params: [3840, 1920],
    });
    const image = buildImage({ imageId: 4, cameraId: 8, tvec: [-1, -2, -3] });
    const reconstruction = buildReconstruction({ cameras: [camera], images: [image] });
    const center = getImageWorldPose(image).position;
    const viewer = new THREE.Vector3(center.x + 100, center.y, center.z);

    const pose = getImageFlyToPose(
      reconstruction, 4, IDENTITY, 'off', WORLD_UP, ORBIT_DISTANCE, CAMERA_SCALE, viewer
    );

    expect(pose).not.toBeNull();
    // scale=1 => world radius = cameraScale; stop distance = factor * radius.
    const D = SPHERICAL_FLYTO_DISTANCE_FACTOR * CAMERA_SCALE;
    expect(pose!.position.equals(center)).toBe(false);
    expect(pose!.position.distanceTo(center)).toBeCloseTo(D, 6);
    // Orbit target/pivot is the sphere center; orbit distance equals the stop distance.
    expect(pose!.target.distanceTo(center)).toBeCloseTo(0, 6);
    expect(pose!.distance).toBeCloseTo(D, 6);
    // Camera looks toward the sphere center (-Z axis aligned with position->center).
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(pose!.quaternion);
    const toCenter = center.clone().sub(pose!.position).normalize();
    expect(lookDir.dot(toCenter)).toBeCloseTo(1, 6);
  });

  it('scales the spherical stop distance with the sim3d transform scale', () => {
    const camera = buildCamera({ cameraId: 9, modelId: CameraModelId.EQUIRECTANGULAR, params: [3840, 1920] });
    const image = buildImage({ imageId: 5, cameraId: 9, tvec: [0, 0, 0] });
    const reconstruction = buildReconstruction({ cameras: [camera], images: [image] });
    const scaledTransform: Sim3dEuler = { ...IDENTITY, scale: 3 };
    const center = new THREE.Vector3(0, 0, 0); // identity pose, translation 0 => center at origin even scaled
    const viewer = new THREE.Vector3(100, 0, 0);

    const pose = getImageFlyToPose(
      reconstruction, 5, scaledTransform, 'off', WORLD_UP, ORBIT_DISTANCE, CAMERA_SCALE, viewer
    );

    expect(pose).not.toBeNull();
    // World radius = cameraScale * sim3d.scale = 2 * 3 = 6; stop = factor * 6.
    const D = SPHERICAL_FLYTO_DISTANCE_FACTOR * CAMERA_SCALE * 3;
    expect(pose!.position.distanceTo(center)).toBeCloseTo(D, 6);
  });

  it('returns null when the image is missing', () => {
    const reconstruction = buildReconstruction({ cameras: [buildCamera()], images: [] });
    const viewer = new THREE.Vector3(1, 0, 0);
    expect(
      getImageFlyToPose(reconstruction, 999, IDENTITY, 'off', WORLD_UP, ORBIT_DISTANCE, CAMERA_SCALE, viewer)
    ).toBeNull();
  });
});
