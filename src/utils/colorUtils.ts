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

/**
 * Convert HSL color values to hex string.
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns Hex color string (e.g., "#ff0000")
 */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Convert hex color string to HSL values.
 * @param hex - Hex color string (e.g., "#ff0000")
 * @returns Object with h (0-360), s (0-100), l (0-100)
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
