import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCamera, buildImage } from '../../test/builders/colmapBuilders';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { CameraModelId } from '../../types/colmap';
import { getCameraColor } from '../../theme';
import type { CameraFrustumItem } from './cameraFrustumGeometry';
import { SPLAT_PSNR_UNAVAILABLE_COLOR } from './splatPsnrMetric';
import {
  buildSphereLineGeometryData,
  getSphereLineAlpha,
  writeSphereLineAlphas,
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

function sphericalItemWithId(imageId: number, cameraIndex = 0): CameraFrustumItem {
  const image = buildImage({ imageId, tvec: [0, 0, 0], qvec: [1, 0, 0, 0] });
  const { position, quaternion } = getImageWorldPose(image);
  return {
    image,
    camera: buildCamera({ modelId: CameraModelId.EQUIRECTANGULAR, params: [4096, 2048], width: 4096, height: 2048 }),
    position, quaternion, cameraIndex, numPoints3D: 0,
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

  it('falls back to the per-camera color (not the metric-unavailable gray) under a splat-metric mode', () => {
    // Spherical cameras never have PSNR/SSIM computed. In a metric color mode with no metric for
    // this image the color must be the byCamera color — NOT SPLAT_PSNR_UNAVAILABLE_COLOR, which
    // would misleadingly read as a bad/unknown score.
    const item = sphericalItemWithId(1, 0); // cameraIndex 0
    const { baseColors } = buildSphereLineGeometryData([item], 1, {
      frustumColorMode: 'splatPsnr',
      frustumSingleColor: '#ffffff',
      imageFrameIndexMap: new Map<number, number>(),
      splatPsnrByImage: new Map(), // empty: no metric for the spherical image
    });
    const expected = new THREE.Color(getCameraColor(item.cameraIndex));
    const unavailableGray = new THREE.Color(SPLAT_PSNR_UNAVAILABLE_COLOR);
    expect(baseColors[0]).toBeCloseTo(expected.r);
    expect(baseColors[1]).toBeCloseTo(expected.g);
    expect(baseColors[2]).toBeCloseTo(expected.b);
    // Explicitly NOT the unavailable gray (the pre-fix behavior).
    expect(baseColors[0]).not.toBeCloseTo(unavailableGray.r);
  });

  it('translates with the camera position', () => {
    const moved = sphericalItem();
    moved.position = new THREE.Vector3(10, 0, 0);
    const { positions } = buildSphereLineGeometryData([moved], 1, opts);
    let cx = 0; for (let i = 0; i < positions.length; i += 3) cx += positions[i];
    expect(cx / (positions.length / 3)).toBeCloseTo(10, 4);
  });
});

// Expected values are derived from the SETTINGS passed in, mirroring the pinhole
// line-opacity semantics in getFrustumLineStyle (cameraFrustumStylePolicy.ts):
//   no selection             -> frustumStandbyOpacity (hover ignored)
//   selection, this selected -> 1.0 (pinhole-equivalent selected value, pre image-plane override)
//   selection, this hovered  -> 1.0 (pinhole hover-brighten parity)
//   selection, unselected    -> unselectedCameraOpacity
describe('getSphereLineAlpha — pinhole opacity parity', () => {
  const STANDBY = 0.35;
  const UNSELECTED = 0.15;

  it('no selection active -> standby opacity', () => {
    expect(getSphereLineAlpha({
      isSelected: false, isHovered: false, hasSelectedImage: false,
      frustumStandbyOpacity: STANDBY, unselectedCameraOpacity: UNSELECTED,
    })).toBe(STANDBY);
  });

  it('selection active, this camera unselected -> unselected opacity', () => {
    expect(getSphereLineAlpha({
      isSelected: false, isHovered: false, hasSelectedImage: true,
      frustumStandbyOpacity: STANDBY, unselectedCameraOpacity: UNSELECTED,
    })).toBe(UNSELECTED);
  });

  it('selection active, this camera selected -> 1.0', () => {
    expect(getSphereLineAlpha({
      isSelected: true, isHovered: false, hasSelectedImage: true,
      frustumStandbyOpacity: STANDBY, unselectedCameraOpacity: UNSELECTED,
    })).toBe(1.0);
  });

  it('selection active, this camera hovered (not selected) -> 1.0 (hover brighten parity)', () => {
    expect(getSphereLineAlpha({
      isSelected: false, isHovered: true, hasSelectedImage: true,
      frustumStandbyOpacity: STANDBY, unselectedCameraOpacity: UNSELECTED,
    })).toBe(1.0);
  });

  it('no selection active, hovered -> standby opacity (hover ignored without a selection, mirroring pinhole !hasSelectedImage-first ordering)', () => {
    expect(getSphereLineAlpha({
      isSelected: false, isHovered: true, hasSelectedImage: false,
      frustumStandbyOpacity: STANDBY, unselectedCameraOpacity: UNSELECTED,
    })).toBe(STANDBY);
  });
});

describe('writeSphereLineAlphas — per-camera alpha attribute values', () => {
  // Float32-exact settings (negative powers of two) so the values round-trip
  // through the Float32Array attribute buffer exactly under toBe.
  const STANDBY = 0.5;
  const UNSELECTED = 0.25;

  it('no selection: every vertex of every sphere gets the standby opacity', () => {
    const items = [sphericalItemWithId(1), sphericalItemWithId(2)];
    const target = new Float32Array(items.length * VERTS_PER_SPHERE);
    writeSphereLineAlphas(target, items, null, null, STANDBY, UNSELECTED);
    for (let i = 0; i < target.length; i++) expect(target[i]).toBe(STANDBY);
  });

  it('selection active: selected sphere = 1.0, unselected spheres = unselected opacity', () => {
    const items = [sphericalItemWithId(1), sphericalItemWithId(2)];
    const target = new Float32Array(items.length * VERTS_PER_SPHERE);
    // Select image id 2 (items[1]), nothing hovered.
    writeSphereLineAlphas(target, items, 2, null, STANDBY, UNSELECTED);
    // items[0] (unselected) occupies vertex range [0, VERTS_PER_SPHERE).
    for (let v = 0; v < VERTS_PER_SPHERE; v++) expect(target[v]).toBe(UNSELECTED);
    // items[1] (selected) occupies [VERTS_PER_SPHERE, 2*VERTS_PER_SPHERE).
    for (let v = 0; v < VERTS_PER_SPHERE; v++) expect(target[VERTS_PER_SPHERE + v]).toBe(1.0);
  });

  it('selection active: a hovered non-selected sphere brightens to 1.0', () => {
    const items = [sphericalItemWithId(1), sphericalItemWithId(2)];
    const target = new Float32Array(items.length * VERTS_PER_SPHERE);
    // Select image id 1 (items[0]); hover image id 2 (items[1], not selected).
    writeSphereLineAlphas(target, items, 1, 2, STANDBY, UNSELECTED);
    // items[0] (selected) occupies [0, VERTS_PER_SPHERE).
    for (let v = 0; v < VERTS_PER_SPHERE; v++) expect(target[v]).toBe(1.0);
    // items[1] (hovered, not selected) brightens to 1.0.
    for (let v = 0; v < VERTS_PER_SPHERE; v++) expect(target[VERTS_PER_SPHERE + v]).toBe(1.0);
  });
});
