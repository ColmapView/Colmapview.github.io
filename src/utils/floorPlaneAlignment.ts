import * as THREE from 'three';
import type { FloorTargetAxis } from '../store/stores/floorPlaneStore';
import type { AxesCoordinateSystem } from '../store/types';
import type { Image } from '../types/colmap';
import type { Sim3dEuler } from '../types/sim3d';
import { getImageWorldPosition } from './colmapTransforms';
import { getCoordinateSystemAxisDirection, isAxisSemanticallyDown } from './coordinateSystems';
import { computeDistancesToPlane, detectPlaneRANSAC, flipPlaneNormal, transformPositions, type Plane, type RansacParams } from './ransac';
import { composeSim3d, computePlaneAlignment, createSim3dFromEuler, isIdentityEuler, sim3dToEuler } from './sim3dTransforms';

export type FloorDetectionParams =
  Pick<RansacParams, 'distanceThreshold' | 'sampleCount'> &
  Partial<Pick<RansacParams, 'maxIterations'>>;

export interface FloorDetectionResult {
  positions: Float32Array;
  plane: Plane | null;
  distances: Float32Array | null;
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
