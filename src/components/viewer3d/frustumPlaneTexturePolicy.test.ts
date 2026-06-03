import { describe, expect, it } from 'vitest';
import {
  getFrustumPlaneDisplayTexture,
  getFrustumPlaneMaterialTexture,
  getFrustumPlaneSourceTexture,
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

  it('keeps the last texture visible while the current texture refreshes', () => {
    expect(getFrustumPlaneDisplayTexture({
      currentTexture: null,
      lastTexture: 'previous',
    })).toBe('previous');
    expect(getFrustumPlaneDisplayTexture({
      currentTexture: 'current',
      lastTexture: 'previous',
    })).toBe('current');
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

  it('clears the material texture when the display texture should be hidden', () => {
    expect(getFrustumPlaneMaterialTexture({
      shouldShowTexture: true,
      displayTexture: 'visible',
    })).toBe('visible');
    expect(getFrustumPlaneMaterialTexture({
      shouldShowTexture: false,
      displayTexture: 'hidden',
    })).toBeNull();
  });
});
