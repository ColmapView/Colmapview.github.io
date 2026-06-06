import type { GaussianCloud } from '../types';
/**
 * Load a .splat file from ArrayBuffer.
 *
 * 32 bytes per Gaussian, little-endian:
 *   0-11:  Position (3×f32) — already linear
 *  12-23:  Scale (3×f32) — already linear
 *  24-27:  Color (RGBA u8) — converted to SH DC + opacity
 *  28-31:  Rotation (4×u8) — decoded and normalized
 */
export declare function loadSplatFromBuffer(buffer: ArrayBuffer): GaussianCloud;
/** Load a .splat file from File, ArrayBuffer, or URL */
export declare function loadSplat(source: File | ArrayBuffer | string): Promise<GaussianCloud>;
