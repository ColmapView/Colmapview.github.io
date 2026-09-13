import { Children, type ReactElement, type RefObject } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCamera } from '../../test/builders';
import { FrustumPlaneSurface } from './FrustumPlaneSurface';

type Props = Parameters<typeof FrustumPlaneSurface>[0];
function props(overrides: Partial<Props> = {}): Props {
  return { camera: buildCamera(), displayColor: '#ffffff', displayTexture: null, isSelected: false,
    isTransparent: false, planeSize: { width: 2, height: 2, depth: 1, offsetX: 0, offsetY: 0 },
    selectionPlaneOpacity: 1, shouldShowTexture: false, textureHiddenByViewAngle: false,
    undistortionEnabled: false, undistortionMode: 'cropped', ...overrides };
}
function children(element: ReactElement) {
  const [geometry, material] = Children.toArray((element.props as { children: ReactElement[] }).children) as ReactElement[];
  return { geometry: geometry as ReactElement<{ args: [number, number] }>,
    material: material as ReactElement<{ visible: boolean; opacity: number; depthWrite: boolean; map: THREE.Texture | null; ref: RefObject<THREE.MeshBasicMaterial | null> }> };
}

describe('FrustumPlaneSurface draw visibility', () => {
  it('skips zero-opacity drawing while retaining the plane geometry and normal mesh picking', () => {
    const { result } = renderHook(FrustumPlaneSurface, { initialProps: props({ isSelected: true }) });
    const { geometry, material } = children(result.current);
    expect(geometry.type).toBe('planeGeometry');
    expect(material.props).toMatchObject({ visible: false, opacity: 0, depthWrite: false });
    const plane = new THREE.PlaneGeometry(...geometry.props.args);
    const basic = new THREE.MeshBasicMaterial({ visible: material.props.visible, opacity: material.props.opacity, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(plane, basic);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
    expect(mesh.visible).toBe(true);
    expect(raycaster.intersectObject(mesh).length).toBeGreaterThan(0);
    plane.dispose(); basic.dispose();
  });

  it('restores visibility and updates the material map when a texture arrives', () => {
    const initial = props();
    const { result, rerender } = renderHook(FrustumPlaneSurface, { initialProps: initial });
    const previous = children(result.current);
    const basic = new THREE.MeshBasicMaterial();
    previous.material.props.ref.current = basic;
    const texture = new THREE.Texture();
    rerender({ ...initial, shouldShowTexture: true, displayTexture: texture });
    const shown = children(result.current);
    expect(shown.geometry.type).toBe(previous.geometry.type);
    expect(shown.geometry.props.args).toEqual(previous.geometry.props.args);
    expect(shown.material.props).toMatchObject({ visible: true, opacity: 1, map: texture });
    expect(basic.map).toBe(texture);
    rerender({ ...initial, shouldShowTexture: true, displayTexture: texture, selectionPlaneOpacity: 0 });
    expect(children(result.current).material.props).toMatchObject({ visible: false, opacity: 0, map: texture });
    rerender({ ...initial, shouldShowTexture: true, displayTexture: texture, selectionPlaneOpacity: 0.0001 });
    expect(children(result.current).material.props).toMatchObject({ visible: true, opacity: 0.0001, map: texture });
    basic.dispose(); texture.dispose();
  });

  it('keeps positive angle-muted and hover fallback materials visible without a texture', () => {
    const initial = props({ textureHiddenByViewAngle: true, selectionPlaneOpacity: 0.5 });
    const { result, rerender } = renderHook(FrustumPlaneSurface, { initialProps: initial });
    expect(children(result.current).material.props).toMatchObject({ visible: true, opacity: 0.1, map: null });
    rerender({ ...initial, selectionPlaneOpacity: 0, isTransparent: true });
    expect(children(result.current).material.props.visible).toBe(true);
    expect(children(result.current).material.props.opacity).toBeGreaterThan(0);
    rerender({ ...initial, selectionPlaneOpacity: 0 });
    expect(children(result.current).material.props).toMatchObject({ visible: false, opacity: 0 });
  });
});
