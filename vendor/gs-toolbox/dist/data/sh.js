// CPU Spherical Harmonics evaluation
// Mirrors the WGSL shader SH evaluation (evalSH_Degree0/1/2/3)
import { SH_C0 } from './transforms';
// SH basis constants (matching shader)
const SH_C1 = 0.48860251190292;
const SH_C2_0 = 1.092548430592079;
const SH_C2_1 = 0.9461746957575601;
const SH_C2_2 = 0.3153915652525201;
const SH_C2_3 = 0.5462742152960395;
const SH_C3_0 = 2.285228997322329;
const SH_C3_1 = 0.4570457994644658;
const SH_C3_2 = 1.445305721320277;
const SH_C3_3 = 1.865881662950577;
const SH_C3_4 = 1.119528997770346;
const SH_C3_5 = 0.5900435899266435;
/**
 * Evaluate SH at a given viewing direction for a single Gaussian.
 *
 * @param sh0 - DC SH coefficients [R, G, B]
 * @param shN - Higher-order SH coefficients for this Gaussian (interleaved),
 *              or null if degree 0
 * @param shDegree - SH degree (0-3)
 * @param dirX - View direction X (normalized, splat position - camera position)
 * @param dirY - View direction Y (normalized, splat position - camera position)
 * @param dirZ - View direction Z (normalized, splat position - camera position)
 * @returns RGB color [R, G, B] clamped to [0, 1]
 */
export function evalSH(sh0, shN, shDegree, dirX, dirY, dirZ) {
    // Degree 0
    let r = sh0[0] * SH_C0 + 0.5;
    let g = sh0[1] * SH_C0 + 0.5;
    let b = sh0[2] * SH_C0 + 0.5;
    if (shDegree < 1 || !shN)
        return [clamp01(r), clamp01(g), clamp01(b)];
    // Degree 1 (coeffs 0-2, interleaved as R,G,B)
    const sh1_0r = shN[0], sh1_0g = shN[1], sh1_0b = shN[2];
    const sh1_1r = shN[3], sh1_1g = shN[4], sh1_1b = shN[5];
    const sh1_2r = shN[6], sh1_2g = shN[7], sh1_2b = shN[8];
    r += SH_C1 * (-dirY * sh1_0r + dirZ * sh1_1r - dirX * sh1_2r);
    g += SH_C1 * (-dirY * sh1_0g + dirZ * sh1_1g - dirX * sh1_2g);
    b += SH_C1 * (-dirY * sh1_0b + dirZ * sh1_1b - dirX * sh1_2b);
    if (shDegree < 2)
        return [clamp01(r), clamp01(g), clamp01(b)];
    // Degree 2 (coeffs 3-7)
    const x2 = dirX * dirX;
    const y2 = dirY * dirY;
    const z2 = dirZ * dirZ;
    const fTmp0B = -SH_C2_0 * dirZ;
    const fC1 = x2 - y2;
    const fS1 = 2 * dirX * dirY;
    const pSH6 = SH_C2_1 * z2 - SH_C2_2;
    const pSH7 = fTmp0B * dirX;
    const pSH5 = fTmp0B * dirY;
    const pSH8 = SH_C2_3 * fC1;
    const pSH4 = SH_C2_3 * fS1;
    const sh2_0r = shN[9], sh2_0g = shN[10], sh2_0b = shN[11];
    const sh2_1r = shN[12], sh2_1g = shN[13], sh2_1b = shN[14];
    const sh2_2r = shN[15], sh2_2g = shN[16], sh2_2b = shN[17];
    const sh2_3r = shN[18], sh2_3g = shN[19], sh2_3b = shN[20];
    const sh2_4r = shN[21], sh2_4g = shN[22], sh2_4b = shN[23];
    r += pSH4 * sh2_0r + pSH5 * sh2_1r + pSH6 * sh2_2r + pSH7 * sh2_3r + pSH8 * sh2_4r;
    g += pSH4 * sh2_0g + pSH5 * sh2_1g + pSH6 * sh2_2g + pSH7 * sh2_3g + pSH8 * sh2_4g;
    b += pSH4 * sh2_0b + pSH5 * sh2_1b + pSH6 * sh2_2b + pSH7 * sh2_3b + pSH8 * sh2_4b;
    if (shDegree < 3)
        return [clamp01(r), clamp01(g), clamp01(b)];
    // Degree 3 (coeffs 8-14)
    const fTmp0C = -SH_C3_0 * z2 + SH_C3_1;
    const fTmp1B = SH_C3_2 * dirZ;
    const fC2 = dirX * fC1 - dirY * fS1;
    const fS2 = dirX * fS1 + dirY * fC1;
    const pSH12 = dirZ * (SH_C3_3 * z2 - SH_C3_4);
    const pSH13 = fTmp0C * dirX;
    const pSH11 = fTmp0C * dirY;
    const pSH14 = fTmp1B * fC1;
    const pSH10 = fTmp1B * fS1;
    const pSH15 = -SH_C3_5 * fC2;
    const pSH9 = -SH_C3_5 * fS2;
    const sh3_0r = shN[24], sh3_0g = shN[25], sh3_0b = shN[26];
    const sh3_1r = shN[27], sh3_1g = shN[28], sh3_1b = shN[29];
    const sh3_2r = shN[30], sh3_2g = shN[31], sh3_2b = shN[32];
    const sh3_3r = shN[33], sh3_3g = shN[34], sh3_3b = shN[35];
    const sh3_4r = shN[36], sh3_4g = shN[37], sh3_4b = shN[38];
    const sh3_5r = shN[39], sh3_5g = shN[40], sh3_5b = shN[41];
    const sh3_6r = shN[42], sh3_6g = shN[43], sh3_6b = shN[44];
    r += pSH9 * sh3_0r + pSH10 * sh3_1r + pSH11 * sh3_2r + pSH12 * sh3_3r +
        pSH13 * sh3_4r + pSH14 * sh3_5r + pSH15 * sh3_6r;
    g += pSH9 * sh3_0g + pSH10 * sh3_1g + pSH11 * sh3_2g + pSH12 * sh3_3g +
        pSH13 * sh3_4g + pSH14 * sh3_5g + pSH15 * sh3_6g;
    b += pSH9 * sh3_0b + pSH10 * sh3_1b + pSH11 * sh3_2b + pSH12 * sh3_3b +
        pSH13 * sh3_4b + pSH14 * sh3_5b + pSH15 * sh3_6b;
    return [clamp01(r), clamp01(g), clamp01(b)];
}
/**
 * Bake all Gaussians' SH to RGB at a given camera position.
 *
 * @param cloud - GaussianCloud with positions, sh0, shN, shDegree
 * @param cameraPos - Camera world position [x, y, z]
 * @returns Float32Array (N*3) RGB values [0,1]
 */
export function bakeSHToRGB(cloud, cameraPos) {
    const { count, positions, sh0, shN, shDegree } = cloud;
    const numCoeffs = shDegree > 0 ? (shDegree + 1) * (shDegree + 1) - 1 : 0;
    const result = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const px = positions[i * 3];
        const py = positions[i * 3 + 1];
        const pz = positions[i * 3 + 2];
        // Match Spark/3DGS convention: view direction = normalize(position - camPos).
        let dx = px - cameraPos[0];
        let dy = py - cameraPos[1];
        let dz = pz - cameraPos[2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len > 0) {
            const inv = 1 / len;
            dx *= inv;
            dy *= inv;
            dz *= inv;
        }
        const sh0i = [
            sh0[i * 3], sh0[i * 3 + 1], sh0[i * 3 + 2],
        ];
        const shNi = shN && numCoeffs > 0
            ? shN.subarray(i * numCoeffs * 3, (i + 1) * numCoeffs * 3)
            : null;
        const [r, g, b] = evalSH(sh0i, shNi, shDegree, dx, dy, dz);
        result[i * 3] = r;
        result[i * 3 + 1] = g;
        result[i * 3 + 2] = b;
    }
    return result;
}
function clamp01(x) {
    return Math.max(0, Math.min(1, x));
}
