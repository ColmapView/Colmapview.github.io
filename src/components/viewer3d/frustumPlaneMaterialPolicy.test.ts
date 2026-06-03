import { describe, expect, it } from 'vitest';
import { OPACITY, VIZ_COLORS } from '../../theme';
import { getFrustumPlaneBasicMaterialProps } from './frustumPlaneMaterialPolicy';

describe('frustum plane material policy', () => {
  it('uses white texture color and selected depth settings for selected textured planes', () => {
    expect(getFrustumPlaneBasicMaterialProps({
      isSelected: true,
      isTransparent: false,
      shouldShowTexture: true,
      selectionPlaneOpacity: 0.8,
      displayColor: '#ff0000',
    })).toEqual({
      color: VIZ_COLORS.material.white,
      depthTest: false,
      depthWrite: false,
      opacity: 0.8,
      transparent: true,
    });
  });

  it('dims textured planes when hover or touch transparency is active', () => {
    const props = getFrustumPlaneBasicMaterialProps({
      isSelected: false,
      isTransparent: true,
      shouldShowTexture: true,
      selectionPlaneOpacity: 0.8,
      displayColor: '#ff0000',
    });

    expect(props.color).toBe(VIZ_COLORS.material.white);
    expect(props.opacity).toBeCloseTo(0.4);
    expect(props.depthTest).toBe(true);
    expect(props.depthWrite).toBe(false);
    expect(props.transparent).toBe(true);
  });

  it('uses hover no-texture opacity and display color for transparent untextured planes', () => {
    expect(getFrustumPlaneBasicMaterialProps({
      isSelected: false,
      isTransparent: true,
      shouldShowTexture: false,
      selectionPlaneOpacity: 0.8,
      displayColor: '#123456',
    })).toEqual({
      color: '#123456',
      depthTest: true,
      depthWrite: false,
      opacity: OPACITY.frustum.hoveredNoTexture,
      transparent: true,
    });
  });

  it('uses low opacity for untextured planes without hover transparency', () => {
    const props = getFrustumPlaneBasicMaterialProps({
      isSelected: false,
      isTransparent: false,
      shouldShowTexture: false,
      selectionPlaneOpacity: 0.8,
      displayColor: '#123456',
    });

    expect(props.color).toBe('#123456');
    expect(props.opacity).toBeCloseTo(0.16);
    expect(props.depthTest).toBe(true);
    expect(props.depthWrite).toBe(false);
    expect(props.transparent).toBe(true);
  });
});
