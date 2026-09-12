import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { buildCamera, buildImage } from '../../test/builders';
import { VIZ_COLORS } from '../../theme';
import { BatchedFrustumLines } from './BatchedFrustumLines';
import * as geometryBuilder from './cameraFrustumViewModel';
import { getFatLineAlphaArray, getFatLineColorArray } from './fatLineSegments';

const frame = vi.hoisted(() => ({ callback: null as ((state: { clock: { elapsedTime: number } }, delta: number) => void) | null }));
vi.mock('@react-three/fiber', () => ({ useFrame: (callback: typeof frame.callback) => { frame.callback = callback; } }));
afterEach(() => vi.restoreAllMocks());
type Props = Parameters<typeof BatchedFrustumLines>[0];
function props(): Props {
  return {
    frustums: [1, 2, 3, 4].map(imageId => ({ image: buildImage({ imageId }), camera: buildCamera(),
      position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), cameraIndex: 0 })),
    cameraScale: 1, selectedImageId: null, hoveredImageId: null, matchedImageIds: new Set(),
    matchesOpacity: 0.6, matchesDisplayMode: 'static', matchesColor: '#00ff00', frustumColorMode: 'single',
    frustumSingleColor: '#ff0000', frustumStandbyOpacity: 0.4, frustumLineWidth: 2,
    selectionColorMode: 'static', selectionColor: '#0000ff', selectionAnimationSpeed: 1,
    unselectedCameraOpacity: 0.2, showImagePlanes: false, imageFrameIndexMap: new Map(), splatPsnrByImage: new Map(),
  };
}
function draw(elapsedTime = 0, delta = 0) {
  act(() => frame.callback!({ clock: { elapsedTime } }, delta));
}
function expectStyle(object: LineSegments2, index: number, opacity: number, color?: string) {
  const alphas = getFatLineAlphaArray(object.geometry)!;
  for (const alpha of alphas.slice(index * 16, (index + 1) * 16)) expect(alpha).toBeCloseTo(opacity);
  if (color) {
    const expected = new THREE.Color(color);
    const colors = getFatLineColorArray(object.geometry)!;
    expect(colors[index * 48]).toBeCloseTo(expected.r);
    expect(colors[index * 48 + 1]).toBeCloseTo(expected.g);
    expect(colors[index * 48 + 2]).toBeCloseTo(expected.b);
  }
}

describe('BatchedFrustumLines resource lifetime', () => {
  it('keeps geometry/material/buffers across selection, hover, matches, opacity and width changes', () => {
    const initial = props();
    const { result, rerender, unmount } = renderHook(BatchedFrustumLines, { initialProps: initial });
    const object = result.current!.props.object as LineSegments2;
    const geometry = object.geometry;
    const material = object.material;
    const colors = getFatLineColorArray(geometry);
    const alphas = getFatLineAlphaArray(geometry);
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    draw();
    expectStyle(object, 0, 0.4, '#ff0000');
    const changed: Props = { ...initial, selectedImageId: 1, hoveredImageId: 2, matchedImageIds: new Set([3]),
      matchesOpacity: 0.7, unselectedCameraOpacity: 0.1, frustumLineWidth: 5 };
    rerender(changed);
    draw();
    expect(result.current!.props.object).toBe(object);
    expect(object.geometry).toBe(geometry);
    expect(object.material).toBe(material);
    expect(getFatLineColorArray(geometry)).toBe(colors);
    expect(getFatLineAlphaArray(geometry)).toBe(alphas);
    expect(material.linewidth).toBe(5);
    expectStyle(object, 0, 0, '#0000ff');
    expectStyle(object, 1, 1, VIZ_COLORS.frustum.hover);
    expectStyle(object, 2, 0.7, '#00ff00');
    expectStyle(object, 3, 0.1, '#ff0000');
    rerender({ ...changed, selectedImageId: 4, hoveredImageId: null, matchedImageIds: new Set(), pendingDeletions: new Set([2]) });
    draw();
    expect(result.current!.props.object).toBe(object);
    expectStyle(object, 0, 0.1, '#ff0000');
    expectStyle(object, 1, 0.3, VIZ_COLORS.frustum.deleted);
    expectStyle(object, 3, 0, '#0000ff');
    rerender({ ...initial, frustumStandbyOpacity: 0.8 });
    draw();
    expect(result.current!.props.object).toBe(object);
    expectStyle(object, 0, 0.8);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    unmount();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });

  it('initializes replacement position buffers even when all style inputs retain identity', () => {
    const initial = { ...props(), selectedImageId: 1, hoveredImageId: 2, matchedImageIds: new Set([3]) };
    const baseColors = new Float32Array(4 * 48).fill(0.25);
    const baseAlphas = new Float32Array(4 * 16).fill(1);
    vi.spyOn(geometryBuilder, 'buildFrustumLineGeometryData').mockImplementation(() => ({
      positions: new Float32Array(4 * 48), baseColors, baseAlphas,
    }));
    const { result, rerender } = renderHook(BatchedFrustumLines, { initialProps: initial });
    const old = result.current!.props.object as LineSegments2;
    draw();
    const dispose = vi.spyOn(old.geometry, 'dispose');
    rerender({ ...initial, cameraScale: 2 });
    const replacement = result.current!.props.object as LineSegments2;
    expect(replacement).not.toBe(old);
    expect(dispose).toHaveBeenCalledOnce();
    draw();
    expectStyle(replacement, 0, 0, '#0000ff');
    expectStyle(replacement, 1, 1, VIZ_COLORS.frustum.hover);
    expectStyle(replacement, 2, 0.6, '#00ff00');
    expectStyle(replacement, 3, 0.2);
  });

  it('updates animated matches in place after the initial full style pass', () => {
    const initial: Props = { ...props(), selectedImageId: 1, matchedImageIds: new Set([3]), matchesDisplayMode: 'blink' };
    const { result } = renderHook(BatchedFrustumLines, { initialProps: initial });
    const object = result.current!.props.object as LineSegments2;
    draw(0, 0);
    expectStyle(object, 2, 0.06, '#00ff00');
    draw(0.15, 0.15);
    expectStyle(object, 2, 0.33, '#00ff00');
    expectStyle(object, 3, 0.2, '#ff0000');
  });
});


it('limits animation uploads to affected frustums and preserves writes while rendering is skipped', () => {
  const initial: Props = { ...props(), selectedImageId: 1, selectionColorMode: 'rainbow', matchedImageIds: new Set([3]), matchesDisplayMode: 'blink' };
  const { result, rerender } = renderHook(BatchedFrustumLines, { initialProps: initial });
  const object = result.current!.props.object as LineSegments2;
  const colorBuffer = (object.geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data;
  const alphaBuffer = (object.geometry.getAttribute('instanceAlphaStart') as THREE.InterleavedBufferAttribute).data;
  draw(0, 0);
  // Before any GPU consumption, animation must preserve the initial full rewrite.
  draw(0.1, 0.1);
  expect(colorBuffer.updateRanges).toEqual([{ start: 0, count: 192 }]);
  expect(alphaBuffer.updateRanges).toEqual([{ start: 0, count: 64 }]);
  colorBuffer.onUploadCallback(); alphaBuffer.onUploadCallback();
  draw(0.2, 0.1);
  draw(0.3, 0.1);
  expect(colorBuffer.updateRanges).toEqual([{ start: 0, count: 48 }, { start: 96, count: 48 }]);
  expect(alphaBuffer.updateRanges).toEqual([{ start: 0, count: 16 }, { start: 32, count: 16 }]);
  rerender({ ...initial, unselectedCameraOpacity: 0.9 });
  draw(0.4, 0.1);
  draw(0.5, 0.1);
  expect(colorBuffer.updateRanges).toEqual([{ start: 0, count: 192 }]);
  expect(alphaBuffer.updateRanges).toEqual([{ start: 0, count: 64 }]);
  expectStyle(object, 3, 0.9, '#ff0000');
  colorBuffer.onUploadCallback(); alphaBuffer.onUploadCallback();
  draw(0.6, 0.1);
  expect(colorBuffer.updateRanges).toEqual([{ start: 0, count: 48 }, { start: 96, count: 48 }]);
  expect(alphaBuffer.updateRanges).toEqual([{ start: 0, count: 16 }, { start: 32, count: 16 }]);
});
