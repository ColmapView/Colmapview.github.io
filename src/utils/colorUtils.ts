/**
 * Color conversion utilities for 3D rendering.
 */

import * as THREE from 'three';
import { SRGB, RAINBOW, COLORMAP } from '../theme';

// Reusable Color object to avoid allocations in animation loop
const tempColor = new THREE.Color();

/**
 * Convert sRGB color component to linear color space.
 * Three.js expects linear vertex colors for proper rendering.
 * @param c - sRGB color component (0-1)
 * @returns Linear color component
 */
export function sRGBToLinear(c: number): number {
  return c <= SRGB.threshold
    ? c / SRGB.linearScale
    : Math.pow((c + SRGB.gammaOffset) / SRGB.gammaScale, SRGB.gamma);
}

/**
 * Generate a rainbow color cycling through hues.
 * Uses HSL color space with fixed saturation and lightness.
 * @param t - Hue value (0-1, wraps around)
 * @returns THREE.Color instance (reused to avoid allocations)
 */
export function rainbowColor(t: number): THREE.Color {
  const hue = t % 1;
  return tempColor.setHSL(hue, RAINBOW.saturation, RAINBOW.lightness);
}

/**
 * Apply jet colormap (blue -> cyan -> green -> yellow -> red).
 * Commonly used for error/heat visualization.
 * @param t - Value to map (0-1, clamped)
 * @returns RGB tuple [r, g, b] with values 0-1
 */
export function jetColormap(t: number): [number, number, number] {
  const { threshold1, threshold2, threshold3, multiplier } = COLORMAP.jet;
  t = Math.max(0, Math.min(1, t));
  if (t < threshold1) {
    return [0, t * multiplier, 1];
  } else if (t < threshold2) {
    return [0, 1, 1 - (t - threshold1) * multiplier];
  } else if (t < threshold3) {
    return [(t - threshold2) * multiplier, 1, 0];
  } else {
    return [1, 1 - (t - threshold3) * multiplier, 0];
  }
}
