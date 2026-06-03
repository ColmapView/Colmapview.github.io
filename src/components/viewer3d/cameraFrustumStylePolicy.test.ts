import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getFrustumArrowStyle,
  getFrustumLineStyle,
  getImagePlaneStyle,
  getMatchesBlinkFactor,
  getMatchesDisplayOpacity,
  hasFrustumLineRenderStateChanged,
  setRainbowColor,
} from './cameraFrustumStylePolicy';

describe('camera frustum style policy', () => {
  it('derives match blink factors across ramp, hold, fade, and idle phases', () => {
    expect(getMatchesBlinkFactor(0.15)).toBeCloseTo(0.5);
    expect(getMatchesBlinkFactor(0.45)).toBe(1);
    expect(getMatchesBlinkFactor(0.8)).toBeCloseTo(0.5);
    expect(getMatchesBlinkFactor(1.2)).toBe(0);
  });

  it('derives static and blinking match display opacity', () => {
    expect(getMatchesDisplayOpacity(0.7, 'static', 0.15)).toBe(0.7);
    expect(getMatchesDisplayOpacity(0.7, 'off', 0.15)).toBe(0.7);
    expect(getMatchesDisplayOpacity(0.7, 'blink', 0.15)).toBeCloseTo(0.7 * (0.1 + 0.9 * 0.5));
  });

  it('maps rainbow hues onto RGB colors', () => {
    const color = new THREE.Color();

    setRainbowColor(color, 0);

    expect(color.r).toBeGreaterThan(color.g);
    expect(color.r).toBeGreaterThan(color.b);
    expect(color.g).toBeCloseTo(color.b);
  });

  it('derives frustum line style policy from interaction state', () => {
    expect(getFrustumLineStyle({
      isSelected: false,
      isHovered: false,
      isMatched: false,
      isPendingDeletion: true,
      hasSelectedImage: false,
      showImagePlanes: false,
      frustumStandbyOpacity: 0.4,
      matchesOpacity: 0.7,
      unselectedCameraOpacity: 0.2,
      selectionColorMode: 'static',
      matchesDisplayMode: 'static',
      selectionBlinkFactor: 1,
      matchesBlinkFactor: 1,
    })).toEqual({ colorSource: 'deleted', opacity: 0.3 });

    expect(getFrustumLineStyle({
      isSelected: false,
      isHovered: true,
      isMatched: true,
      isPendingDeletion: false,
      hasSelectedImage: true,
      showImagePlanes: false,
      frustumStandbyOpacity: 0.4,
      matchesOpacity: 0.7,
      unselectedCameraOpacity: 0.2,
      selectionColorMode: 'static',
      matchesDisplayMode: 'static',
      selectionBlinkFactor: 1,
      matchesBlinkFactor: 1,
    })).toEqual({ colorSource: 'hover', opacity: 1 });

    expect(getFrustumLineStyle({
      isSelected: false,
      isHovered: false,
      isMatched: true,
      isPendingDeletion: false,
      hasSelectedImage: true,
      showImagePlanes: false,
      frustumStandbyOpacity: 0.4,
      matchesOpacity: 0.7,
      unselectedCameraOpacity: 0.2,
      selectionColorMode: 'static',
      matchesDisplayMode: 'blink',
      selectionBlinkFactor: 1,
      matchesBlinkFactor: 0.5,
    })).toEqual({ colorSource: 'matches', opacity: 0.7 * (0.1 + 0.9 * 0.5) });

    expect(getFrustumLineStyle({
      isSelected: true,
      isHovered: false,
      isMatched: false,
      isPendingDeletion: false,
      hasSelectedImage: true,
      showImagePlanes: false,
      frustumStandbyOpacity: 0.4,
      matchesOpacity: 0.7,
      unselectedCameraOpacity: 0.2,
      selectionColorMode: 'rainbow',
      matchesDisplayMode: 'static',
      selectionBlinkFactor: 0.5,
      matchesBlinkFactor: 1,
    })).toEqual({ colorSource: 'selectionRainbow', opacity: 0 });

    expect(getFrustumLineStyle({
      isSelected: false,
      isHovered: false,
      isMatched: false,
      isPendingDeletion: false,
      hasSelectedImage: false,
      showImagePlanes: true,
      frustumStandbyOpacity: 0.4,
      matchesOpacity: 0.7,
      unselectedCameraOpacity: 0.2,
      selectionColorMode: 'static',
      matchesDisplayMode: 'static',
      selectionBlinkFactor: 1,
      matchesBlinkFactor: 1,
    })).toEqual({ colorSource: 'base', opacity: 0 });
  });

  it('detects frustum-line render-state changes across visual inputs', () => {
    const matchedImageIds = new Set([1]);
    const pendingDeletions = new Set([3]);
    const baseColorData = new Float32Array([1, 0, 0]);
    const current = {
      selectedImageId: 1,
      hoveredImageId: 2,
      matchedImageIds,
      matchedImageCount: matchedImageIds.size,
      pendingDeletions,
      pendingDeletionCount: pendingDeletions.size,
      unselectedCameraOpacity: 0.2,
      matchesOpacity: 0.7,
      matchesDisplayMode: 'static' as const,
      matchesColor: '#00ff00',
      showImagePlanes: false,
      frustumStandbyOpacity: 0.4,
      selectionColorMode: 'static' as const,
      selectionColor: '#ff00ff',
      selectionAnimationSpeed: 1,
      baseColorData,
    };

    expect(hasFrustumLineRenderStateChanged(null, current)).toBe(true);
    expect(hasFrustumLineRenderStateChanged(current, current)).toBe(false);
    expect(hasFrustumLineRenderStateChanged(current, {
      ...current,
      matchesColor: '#ffffff',
    })).toBe(true);
    expect(hasFrustumLineRenderStateChanged(current, {
      ...current,
      matchedImageCount: 2,
    })).toBe(true);
    expect(hasFrustumLineRenderStateChanged(current, {
      ...current,
      pendingDeletionCount: 2,
    })).toBe(true);
    expect(hasFrustumLineRenderStateChanged(current, {
      ...current,
      baseColorData: new Float32Array([0, 1, 0]),
    })).toBe(true);
  });

  it('derives arrow color source, intensity, and selected scale policy', () => {
    expect(getFrustumArrowStyle({
      isSelected: false,
      isHovered: false,
      isMatched: false,
      isPendingDeletion: true,
      matchesOpacity: 0.7,
      selectionColorMode: 'static',
      matchesDisplayMode: 'static',
      selectionBlinkFactor: 1,
      matchesBlinkFactor: 1,
    })).toEqual({ colorSource: 'deleted', colorIntensity: 1, scale: 1 });

    expect(getFrustumArrowStyle({
      isSelected: true,
      isHovered: true,
      isMatched: false,
      isPendingDeletion: false,
      matchesOpacity: 0.7,
      selectionColorMode: 'static',
      matchesDisplayMode: 'static',
      selectionBlinkFactor: 1,
      matchesBlinkFactor: 1,
    })).toEqual({ colorSource: 'hover', colorIntensity: 1, scale: 0 });

    expect(getFrustumArrowStyle({
      isSelected: true,
      isHovered: false,
      isMatched: false,
      isPendingDeletion: false,
      matchesOpacity: 0.7,
      selectionColorMode: 'blink',
      matchesDisplayMode: 'static',
      selectionBlinkFactor: 0.25,
      matchesBlinkFactor: 1,
    })).toEqual({ colorSource: 'selection', colorIntensity: 0.625, scale: 0 });

    expect(getFrustumArrowStyle({
      isSelected: true,
      isHovered: false,
      isMatched: true,
      isPendingDeletion: false,
      matchesOpacity: 0.7,
      selectionColorMode: 'rainbow',
      matchesDisplayMode: 'blink',
      selectionBlinkFactor: 0.25,
      matchesBlinkFactor: 0.5,
    })).toEqual({ colorSource: 'selectionRainbow', colorIntensity: 1, scale: 0 });

    expect(getFrustumArrowStyle({
      isSelected: false,
      isHovered: false,
      isMatched: true,
      isPendingDeletion: false,
      matchesOpacity: 0.7,
      selectionColorMode: 'static',
      matchesDisplayMode: 'blink',
      selectionBlinkFactor: 1,
      matchesBlinkFactor: 0.5,
    })).toEqual({ colorSource: 'matches', colorIntensity: 0.7 * (0.1 + 0.9 * 0.5), scale: 1 });

    expect(getFrustumArrowStyle({
      isSelected: false,
      isHovered: false,
      isMatched: false,
      isPendingDeletion: false,
      matchesOpacity: 0.7,
      selectionColorMode: 'static',
      matchesDisplayMode: 'static',
      selectionBlinkFactor: 1,
      matchesBlinkFactor: 1,
    })).toEqual({ colorSource: 'base', colorIntensity: 1, scale: 1 });
  });

  it('derives image-plane color and opacity policy', () => {
    expect(getImagePlaneStyle({
      isMatched: true,
      isPendingDeletion: true,
      hasSelectedImage: true,
      selectionPlaneOpacity: 0.8,
      matchesOpacity: 0.5,
      unselectedCameraOpacity: 0.25,
      baseColor: '#111111',
      matchesColor: '#00ff00',
      deletedColor: '#ff4444',
    })).toEqual({ color: '#ff4444', opacity: 0.3 });

    expect(getImagePlaneStyle({
      isMatched: true,
      isPendingDeletion: false,
      hasSelectedImage: true,
      selectionPlaneOpacity: 0.8,
      matchesOpacity: 0.5,
      unselectedCameraOpacity: 0.25,
      baseColor: '#111111',
      matchesColor: '#00ff00',
      deletedColor: '#ff4444',
    })).toEqual({ color: '#00ff00', opacity: 0.4 });

    expect(getImagePlaneStyle({
      isMatched: false,
      isPendingDeletion: false,
      hasSelectedImage: false,
      selectionPlaneOpacity: 0.8,
      matchesOpacity: 0.5,
      unselectedCameraOpacity: 0.25,
      baseColor: '#111111',
      matchesColor: '#00ff00',
      deletedColor: '#ff4444',
    })).toEqual({ color: '#111111', opacity: 0.8 });
  });
});
