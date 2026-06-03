import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildImage } from '../../test/builders';
import { getCameraColor } from '../../theme';
import {
  buildRigConnectionGeometryData,
  getRigConnectionAlpha,
  getRigConnectionBlinkOpacityFactor,
  getRigConnectionFrameId,
  groupRigImagesByFrame,
  hasRigConnectionRenderStateChanged,
  shouldRestoreRigConnectionFrameColors,
} from './rigConnectionsViewModel';

describe('rig connections view-model helpers', () => {
  it('extracts frame ids from path-style and flat image names', () => {
    expect(getRigConnectionFrameId('cam_1/00.png')).toBe('00.png');
    expect(getRigConnectionFrameId('cam_2\\01.jpg')).toBe('01.jpg');
    expect(getRigConnectionFrameId('image_001.png')).toBe('image_001.png');
  });

  it('groups rig images by inferred frame id', () => {
    const frameA1 = buildImage({ imageId: 1, name: 'left/frame-001.jpg' });
    const frameA2 = buildImage({ imageId: 2, name: 'right/frame-001.jpg' });
    const frameB = buildImage({ imageId: 3, name: 'left/frame-002.jpg' });

    const groups = groupRigImagesByFrame([frameA1, frameA2, frameB]);

    expect(groups.get('frame-001.jpg')?.map((image) => image.imageId)).toEqual([1, 2]);
    expect(groups.get('frame-002.jpg')?.map((image) => image.imageId)).toEqual([3]);
  });

  it('builds star-pattern line geometry for multi-camera frame groups', () => {
    const first = buildImage({ imageId: 1, name: 'left/frame-001.jpg', tvec: [1, 0, 0] });
    const second = buildImage({ imageId: 2, name: 'right/frame-001.jpg', tvec: [0, 2, 0] });
    const third = buildImage({ imageId: 3, name: 'top/frame-001.jpg', tvec: [0, 0, 3] });
    const singleton = buildImage({ imageId: 4, name: 'left/frame-002.jpg', tvec: [4, 0, 0] });

    const data = buildRigConnectionGeometryData([first, second, third, singleton]);

    expect(data).not.toBeNull();
    expect(Array.from(data?.positions ?? [])).toEqual([
      -1, 0, 0,
      0, -2, 0,
      -1, 0, 0,
      0, 0, -3,
    ]);
    expect(Array.from(data?.alphas ?? [])).toEqual([1, 1, 1, 1]);
    expect(data?.lineFrameImageIds).toHaveLength(4);
    expect(data?.lineFrameImageIds[0]).toEqual(new Set([1, 2, 3]));

    const expectedColor = new THREE.Color(getCameraColor(0));
    expect(data?.colors[0]).toBeCloseTo(expectedColor.r);
    expect(data?.colors[1]).toBeCloseTo(expectedColor.g);
    expect(data?.colors[2]).toBeCloseTo(expectedColor.b);
  });

  it('returns null when no frame has multiple images', () => {
    expect(buildRigConnectionGeometryData([
      buildImage({ imageId: 1, name: 'left/frame-001.jpg' }),
      buildImage({ imageId: 2, name: 'left/frame-002.jpg' }),
    ])).toBeNull();
  });

  it('derives blink opacity and selected-frame alpha policy', () => {
    expect(getRigConnectionBlinkOpacityFactor('static', 0.15)).toBe(1);
    expect(getRigConnectionBlinkOpacityFactor('blink', 0.15)).toBeCloseTo(0.55);

    const frameImageIds = new Set([1, 2]);
    expect(getRigConnectionAlpha({
      frameImageIds,
      selectedImageId: null,
      rigOpacity: 0.8,
      unselectedOpacity: 0.25,
      blinkOpacityFactor: 0.5,
    })).toBe(0.4);
    expect(getRigConnectionAlpha({
      frameImageIds,
      selectedImageId: 2,
      rigOpacity: 0.8,
      unselectedOpacity: 0.25,
      blinkOpacityFactor: 0.5,
    })).toBe(0.4);
    expect(getRigConnectionAlpha({
      frameImageIds,
      selectedImageId: 9,
      rigOpacity: 0.8,
      unselectedOpacity: 0.25,
      blinkOpacityFactor: 0.5,
    })).toBe(0.1);
  });

  it('detects rig render state changes', () => {
    const current = {
      selectedImageId: 1,
      rigOpacity: 0.7,
      unselectedOpacity: 0.3,
      colorMode: 'perFrame' as const,
      color: '#00ffff',
    };

    expect(hasRigConnectionRenderStateChanged(null, current)).toBe(true);
    expect(hasRigConnectionRenderStateChanged(current, current)).toBe(false);
    expect(hasRigConnectionRenderStateChanged(current, {
      ...current,
      selectedImageId: 2,
    })).toBe(true);
    expect(hasRigConnectionRenderStateChanged(current, {
      ...current,
      colorMode: 'single',
    })).toBe(true);
    expect(hasRigConnectionRenderStateChanged({
      ...current,
      colorMode: 'single',
      color: '#00ffff',
    }, {
      ...current,
      colorMode: 'single',
      color: '#ff00ff',
    })).toBe(true);
  });

  it('detects when per-frame colors must be restored after single-color mode', () => {
    const perFrame = {
      selectedImageId: null,
      rigOpacity: 0.7,
      unselectedOpacity: 0.3,
      colorMode: 'perFrame' as const,
      color: '#00ffff',
    };
    const single = {
      ...perFrame,
      colorMode: 'single' as const,
    };

    expect(shouldRestoreRigConnectionFrameColors(single, perFrame)).toBe(true);
    expect(shouldRestoreRigConnectionFrameColors(perFrame, single)).toBe(false);
    expect(shouldRestoreRigConnectionFrameColors(null, perFrame)).toBe(false);
  });
});
