/** SH basis constant for DC (degree 0) term */
export declare const SH_C0 = 0.28209479177387814;
/** Apply exp to log-space scales → linear scales */
export declare function expActivation(logScales: Float32Array): Float32Array;
/** Apply exp in-place */
export declare function expActivationInPlace(logScales: Float32Array): void;
/** Apply sigmoid to logit opacities → linear [0,1] */
export declare function sigmoidActivation(logitOpacities: Float32Array): Float32Array;
/** Sigmoid scalar */
export declare function sigmoid(x: number): number;
/** Normalize quaternions in-place. Input/output: (N*4) wxyz flat array. */
export declare function normalizeQuaternions(quats: Float32Array): void;
/**
 * Reorder SH coefficients from PLY channel-first to interleaved layout.
 *
 * PLY stores: [R_coeff0, R_coeff1, ..., G_coeff0, G_coeff1, ..., B_coeff0, ...]
 * Output:     [coeff0_R, coeff0_G, coeff0_B, coeff1_R, coeff1_G, coeff1_B, ...]
 *
 * @param channelFirst  Flat array (N * numCoeffs * 3) in channel-first layout
 * @param numCoeffs     Number of SH coefficients per channel (e.g., 3, 8, 15)
 * @param count         Number of Gaussians
 * @returns New array in interleaved layout
 */
export declare function reorderSHChannelsFirst(channelFirst: Float32Array, numCoeffs: number, count: number): Float32Array;
/** Convert linear RGB [0,1] to SH DC coefficients */
export declare function rgbToSHDC(rgb: Float32Array): Float32Array;
/** Convert SH DC coefficients to linear RGB [0,1] */
export declare function shDCToRGB(shDC: Float32Array): Float32Array;
/**
 * Convert .splat RGBA uint8 colors to sh0 + opacities.
 *
 * @param rgba  Uint8Array (count * 4) — RGBA pixels
 * @param count Number of Gaussians
 * @returns { sh0, opacities }
 */
export declare function splatColorToSHDC(rgba: Uint8Array, count: number): {
    sh0: Float32Array;
    opacities: Float32Array;
};
