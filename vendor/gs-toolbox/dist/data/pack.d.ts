import type { GaussianCloud, PackedFormat, PackedGaussians } from '../types';
/**
 * Pack a GaussianCloud into GPU-optimized format.
 *
 * @param cloud - Input Gaussian cloud
 * @param format - 'compact' (16 bytes) or 'balanced' (32 bytes)
 * @returns PackedGaussians
 */
export declare function packGaussians(cloud: GaussianCloud, format?: PackedFormat): PackedGaussians;
/**
 * Unpack PackedGaussians back to a GaussianCloud.
 * Note: higher-order SH coefficients are lost during packing.
 */
export declare function unpackGaussians(packed: PackedGaussians): GaussianCloud;
/**
 * Compute 3D covariance matrix from rotations and scales.
 * Σ = R · diag(sx², sy², sz²) · Rᵀ → 6 unique upper-triangle values.
 *
 * @param rotations - (N*4) wxyz quaternions flat
 * @param scales - (N*3) linear scales flat
 * @param count - Number of Gaussians
 * @returns Float32Array(N*6) [cov00, cov01, cov02, cov11, cov12, cov22] per Gaussian
 */
export declare function computeCovariance3D(rotations: Float32Array, scales: Float32Array, count: number): Float32Array;
export interface QuatScaleToCovarPreciOptions {
    computeCovar?: boolean;
    computePreci?: boolean;
    triu?: boolean;
}
export interface QuatScaleToCovarPreciResult {
    covars: Float32Array | null;
    precis: Float32Array | null;
}
/**
 * Backend-style CPU helper for converting quaternion+scale to covariance and
 * precision matrices. Triangular output uses [00, 01, 02, 11, 12, 22].
 */
export declare function quatScaleToCovarPreciCPU(rotations: Float32Array, scales: Float32Array, count: number, options?: QuatScaleToCovarPreciOptions): QuatScaleToCovarPreciResult;
