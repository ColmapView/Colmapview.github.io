import { describe, expect, it } from 'vitest';
import { OPACITY, VIZ_COLORS } from '../../theme';
import {
  getFrustumPlaneBasicMaterialProps,
  syncFrustumPlaneMaterialMap,
} from './frustumPlaneMaterialPolicy';

describe('frustum plane material policy', () => {
  it('uses white texture color and selected depth settings for selected textured planes', () => {
    expect(getFrustumPlaneBasicMaterialProps({
      isSelected: true,
      isTransparent: false,
      shouldShowTexture: true,
      textureHiddenByViewAngle: false,
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
      textureHiddenByViewAngle: false,
      selectionPlaneOpacity: 0.8,
      displayColor: '#ff0000',
    });

    expect(props.color).toBe(VIZ_COLORS.material.white);
    expect(props.opacity).toBeCloseTo(0.4);
    expect(props.depthTest).toBe(true);
    expect(props.depthWrite).toBe(false);
    expect(props.transparent).toBe(true);
  });

  it('uses a colored no-texture plane for view-angle-pruned planes', () => {
    const props = getFrustumPlaneBasicMaterialProps({
      isSelected: false,
      isTransparent: false,
      shouldShowTexture: false,
      textureHiddenByViewAngle: true,
      selectionPlaneOpacity: 0.8,
      displayColor: '#123456',
    });

    expect(props.color).toBe('#123456');
    expect(props.opacity).toBeCloseTo(0.16);
    expect(props.depthTest).toBe(true);
    expect(props.depthWrite).toBe(false);
    expect(props.transparent).toBe(true);
  });

  it('uses hover no-texture opacity for transparent view-angle-pruned planes', () => {
    expect(getFrustumPlaneBasicMaterialProps({
      isSelected: false,
      isTransparent: true,
      shouldShowTexture: false,
      textureHiddenByViewAngle: true,
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

  it('hides unloaded untextured planes even when hover or touch transparency is active', () => {
    expect(getFrustumPlaneBasicMaterialProps({
      isSelected: false,
      isTransparent: true,
      shouldShowTexture: false,
      textureHiddenByViewAngle: false,
      selectionPlaneOpacity: 0.8,
      displayColor: '#123456',
    })).toEqual({
      color: '#123456',
      depthTest: true,
      depthWrite: false,
      opacity: 0,
      transparent: true,
    });
  });

  it('hides unloaded untextured planes without hover transparency', () => {
    const props = getFrustumPlaneBasicMaterialProps({
      isSelected: false,
      isTransparent: false,
      shouldShowTexture: false,
      textureHiddenByViewAngle: false,
      selectionPlaneOpacity: 0.8,
      displayColor: '#123456',
    });

    expect(props.color).toBe('#123456');
    expect(props.opacity).toBe(0);
    expect(props.depthTest).toBe(true);
    expect(props.depthWrite).toBe(false);
    expect(props.transparent).toBe(true);
  });

  it('syncs a changed material texture map and marks the material dirty', () => {
    const currentMap = { id: 'current' };
    const nextMap = { id: 'next' };
    const material = { map: currentMap, needsUpdate: false };

    expect(syncFrustumPlaneMaterialMap(material, nextMap)).toBe(true);
    expect(material.map).toBe(nextMap);
    expect(material.needsUpdate).toBe(true);
  });

  it('marks the material dirty when the intended map changes after React already assigned it', () => {
    const nextMap = { id: 'next' };
    const material = { map: nextMap, needsUpdate: false };

    expect(syncFrustumPlaneMaterialMap(material, nextMap, null)).toBe(true);
    expect(material.map).toBe(nextMap);
    expect(material.needsUpdate).toBe(true);
  });

  it('does not mark the material dirty when the map is unchanged', () => {
    const currentMap = { id: 'current' };
    const material = { map: currentMap, needsUpdate: false };

    expect(syncFrustumPlaneMaterialMap(material, currentMap, currentMap)).toBe(false);
    expect(material.map).toBe(currentMap);
    expect(material.needsUpdate).toBe(false);
  });
});
