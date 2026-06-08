import { describe, expect, it } from 'vitest';
import {
  getFrustumPlaneSourceTexture,
  isRenderableFrustumPlaneTexture,
  shouldShowFrustumPlaneTexture,
} from './frustumPlaneTexturePolicy';

describe('frustum plane texture policy', () => {
  it('prefers the high-resolution texture for selected planes', () => {
    expect(getFrustumPlaneSourceTexture({
      isSelected: true,
      highResTexture: 'high',
      lowResTexture: 'low',
    })).toBe('high');
  });

  it('falls back to low-resolution texture for selected planes without high resolution', () => {
    expect(getFrustumPlaneSourceTexture({
      isSelected: true,
      highResTexture: null,
      lowResTexture: 'low',
    })).toBe('low');
  });

  it('uses only the low-resolution texture for non-selected planes', () => {
    expect(getFrustumPlaneSourceTexture({
      isSelected: false,
      highResTexture: 'high',
      lowResTexture: 'low',
    })).toBe('low');
  });

  it('shows plane textures only when enabled, available, and viewable', () => {
    expect(shouldShowFrustumPlaneTexture({
      showImagePlane: true,
      hasDisplayTexture: true,
      viewAngleOk: true,
    })).toBe(true);
    expect(shouldShowFrustumPlaneTexture({
      showImagePlane: false,
      hasDisplayTexture: true,
      viewAngleOk: true,
    })).toBe(false);
    expect(shouldShowFrustumPlaneTexture({
      showImagePlane: true,
      hasDisplayTexture: false,
      viewAngleOk: true,
    })).toBe(false);
    expect(shouldShowFrustumPlaneTexture({
      showImagePlane: true,
      hasDisplayTexture: true,
      viewAngleOk: false,
    })).toBe(false);
  });

  it('requires image dimensions before treating a texture as renderable', () => {
    expect(isRenderableFrustumPlaneTexture(null)).toBe(false);
    expect(isRenderableFrustumPlaneTexture({ image: null })).toBe(false);
    expect(isRenderableFrustumPlaneTexture({ image: { width: 0, height: 64 } })).toBe(false);
    expect(isRenderableFrustumPlaneTexture({ image: { width: 64, height: 32 } })).toBe(true);
  });
});
