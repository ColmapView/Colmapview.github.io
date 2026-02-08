/**
 * Three.js material utilities for consistent rendering behavior.
 * Centralizes opacity/transparency logic for proper depth buffer handling.
 */

/**
 * Opacity threshold for determining if a material should be treated as opaque.
 * Materials with opacity >= this threshold will write to depth buffer.
 */
export const OPACITY_THRESHOLD = 0.99;

/**
 * Get material transparency properties based on opacity value.
 * When opacity is near 1.0, the material is treated as opaque and writes to depth buffer.
 * When opacity is less than threshold, the material is transparent and blends with background.
 */
export function getMaterialTransparency(opacity: number): {
  transparent: boolean;
  depthWrite: boolean;
} {
  const isOpaque = opacity >= OPACITY_THRESHOLD;
  return {
    transparent: !isOpaque,
    depthWrite: isOpaque,
  };
}

/**
 * Check if material should be visible based on opacity.
 * Materials with very low opacity are hidden to avoid rendering artifacts.
 */
/** CSS filter for images marked for deletion (grayscale + dimmed) */
export const DELETED_FILTER = 'grayscale(100%) opacity(0.5)';

export const VISIBILITY_THRESHOLD = 0.001;

export function isMaterialVisible(opacity: number, visible = true): boolean {
  return visible && opacity > VISIBILITY_THRESHOLD;
}
