import type { GaussianCloud } from '../../types';
/**
 * Write a GaussianCloud to .splat format (32 bytes per Gaussian).
 *
 * Layout per Gaussian (little-endian):
 *   0-11:  Position (3×f32)
 *  12-23:  Scale (3×f32)
 *  24-27:  Color (RGBA u8) — SH DC → RGB, opacity → alpha
 *  28-31:  Rotation (4×u8) — wxyz, each mapped to [0, 255]
 *
 * Note: SH degree 0 only. Higher-order SH is discarded.
 */
export declare function saveSplat(cloud: GaussianCloud): ArrayBuffer;
