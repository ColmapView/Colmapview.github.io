import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCamera, buildImage } from '../../test/builders/colmapBuilders';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { CameraModelId } from '../../types/colmap';
import type { CameraFrustumItem } from './cameraFrustumGeometry';
import {
  buildSphereLineGeometryData,
  FLOATS_PER_SPHERE,
  VERTS_PER_SPHERE,
} from './sphericalCameraGeometry';

function sphericalItem(overrides: Partial<CameraFrustumItem> = {}): CameraFrustumItem {
  const image = buildImage({ tvec: [0, 0, 0], qvec: [1, 0, 0, 0] });
  const { position, quaternion } = getImageWorldPose(image);
  return {
    image,
    camera: buildCamera({ modelId: CameraModelId.EQUIRECTANGULAR, params: [4096, 2048], width: 4096, height: 2048 }),
    position, quaternion, cameraIndex: 0, numPoints3D: 0,
    ...overrides,
  };
}

const opts = { frustumColorMode: 'single' as const, frustumSingleColor: '#ffffff', imageFrameIndexMap: new Map<number, number>(), splatPsnrByImage: new Map() };

describe('buildSphereLineGeometryData', () => {
  it('produces correctly-sized batched arrays per camera', () => {
    const { positions, baseColors, baseAlphas } = buildSphereLineGeometryData([sphericalItem(), sphericalItem()], 1, opts);
    expect(positions.length).toBe(2 * FLOATS_PER_SPHERE);
    expect(baseColors.length).toBe(2 * FLOATS_PER_SPHERE);
    expect(baseAlphas.length).toBe(2 * VERTS_PER_SPHERE);
  });

  it('returns empty arrays for no items', () => {
    const { positions } = buildSphereLineGeometryData([], 1, opts);
    expect(positions.length).toBe(0);
  });

  it('places every vertex on a sphere of radius = cameraScale around the camera position', () => {
    const scale = 3;
    const item = sphericalItem();
    const { positions } = buildSphereLineGeometryData([item], scale, opts);
    for (let i = 0; i < positions.length; i += 3) {
      const d = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]).distanceTo(item.position);
      expect(d).toBeCloseTo(scale, 4);
    }
  });

  it('sets alpha 1.0 for every vertex and the base color for single mode', () => {
    const { baseColors, baseAlphas } = buildSphereLineGeometryData([sphericalItem()], 1, opts);
    for (let v = 0; v < VERTS_PER_SPHERE; v++) expect(baseAlphas[v]).toBe(1);
    expect(baseColors[0]).toBeCloseTo(1); expect(baseColors[1]).toBeCloseTo(1); expect(baseColors[2]).toBeCloseTo(1);
  });

  it('translates with the camera position', () => {
    const moved = sphericalItem();
    moved.position = new THREE.Vector3(10, 0, 0);
    const { positions } = buildSphereLineGeometryData([moved], 1, opts);
    let cx = 0; for (let i = 0; i < positions.length; i += 3) cx += positions[i];
    expect(cx / (positions.length / 3)).toBeCloseTo(10, 4);
  });
});
