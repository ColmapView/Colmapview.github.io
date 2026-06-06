// Pure math transforms — no I/O
/** SH basis constant for DC (degree 0) term */
export const SH_C0 = 0.28209479177387814;
/** Apply exp to log-space scales → linear scales */
export function expActivation(logScales) {
    const out = new Float32Array(logScales.length);
    for (let i = 0; i < logScales.length; i++) {
        out[i] = Math.exp(logScales[i]);
    }
    return out;
}
/** Apply exp in-place */
export function expActivationInPlace(logScales) {
    for (let i = 0; i < logScales.length; i++) {
        logScales[i] = Math.exp(logScales[i]);
    }
}
/** Apply sigmoid to logit opacities → linear [0,1] */
export function sigmoidActivation(logitOpacities) {
    const out = new Float32Array(logitOpacities.length);
    for (let i = 0; i < logitOpacities.length; i++) {
        out[i] = 1 / (1 + Math.exp(-logitOpacities[i]));
    }
    return out;
}
/** Sigmoid scalar */
export function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}
/** Normalize quaternions in-place. Input/output: (N*4) wxyz flat array. */
export function normalizeQuaternions(quats) {
    const n = quats.length / 4;
    for (let i = 0; i < n; i++) {
        const off = i * 4;
        const w = quats[off], x = quats[off + 1], y = quats[off + 2], z = quats[off + 3];
        const len = Math.sqrt(w * w + x * x + y * y + z * z);
        if (len > 0) {
            const inv = 1 / len;
            quats[off] *= inv;
            quats[off + 1] *= inv;
            quats[off + 2] *= inv;
            quats[off + 3] *= inv;
        }
    }
}
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
export function reorderSHChannelsFirst(channelFirst, numCoeffs, count) {
    const out = new Float32Array(count * numCoeffs * 3);
    for (let i = 0; i < count; i++) {
        const srcBase = i * numCoeffs * 3;
        const dstBase = i * numCoeffs * 3;
        for (let j = 0; j < numCoeffs; j++) {
            out[dstBase + j * 3 + 0] = channelFirst[srcBase + j]; // R
            out[dstBase + j * 3 + 1] = channelFirst[srcBase + numCoeffs + j]; // G
            out[dstBase + j * 3 + 2] = channelFirst[srcBase + numCoeffs * 2 + j]; // B
        }
    }
    return out;
}
/** Convert linear RGB [0,1] to SH DC coefficients */
export function rgbToSHDC(rgb) {
    const out = new Float32Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) {
        out[i] = (rgb[i] - 0.5) / SH_C0;
    }
    return out;
}
/** Convert SH DC coefficients to linear RGB [0,1] */
export function shDCToRGB(shDC) {
    const out = new Float32Array(shDC.length);
    for (let i = 0; i < shDC.length; i++) {
        out[i] = Math.max(0, Math.min(1, 0.5 + SH_C0 * shDC[i]));
    }
    return out;
}
/**
 * Convert .splat RGBA uint8 colors to sh0 + opacities.
 *
 * @param rgba  Uint8Array (count * 4) — RGBA pixels
 * @param count Number of Gaussians
 * @returns { sh0, opacities }
 */
export function splatColorToSHDC(rgba, count) {
    const sh0 = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const r = rgba[i * 4] / 255;
        const g = rgba[i * 4 + 1] / 255;
        const b = rgba[i * 4 + 2] / 255;
        const a = rgba[i * 4 + 3] / 255;
        sh0[i * 3] = (r - 0.5) / SH_C0;
        sh0[i * 3 + 1] = (g - 0.5) / SH_C0;
        sh0[i * 3 + 2] = (b - 0.5) / SH_C0;
        opacities[i] = a;
    }
    return { sh0, opacities };
}
