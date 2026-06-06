import type { GaussianCloud } from '../types';
/**
 * Evaluate SH at a given viewing direction for a single Gaussian.
 *
 * @param sh0 - DC SH coefficients [R, G, B]
 * @param shN - Higher-order SH coefficients for this Gaussian (interleaved),
 *              or null if degree 0
 * @param shDegree - SH degree (0-3)
 * @param dirX - View direction X (normalized)
 * @param dirY - View direction Y (normalized)
 * @param dirZ - View direction Z (normalized)
 * @returns RGB color [R, G, B] clamped to [0, 1]
 */
export declare function evalSH(sh0: [number, number, number], shN: Float32Array | null, shDegree: number, dirX: number, dirY: number, dirZ: number): [number, number, number];
/**
 * Bake all Gaussians' SH to RGB at a given camera position.
 *
 * @param cloud - GaussianCloud with positions, sh0, shN, shDegree
 * @param cameraPos - Camera world position [x, y, z]
 * @returns Float32Array (N*3) RGB values [0,1]
 */
export declare function bakeSHToRGB(cloud: GaussianCloud, cameraPos: [number, number, number]): Float32Array;
