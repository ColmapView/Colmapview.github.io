// GPU-optimized Gaussian packing/unpacking
import { toHalf, fromHalf, encodeLogScale, decodeLogScaleGeneric, encodeQuaternion, decodeQuaternion, } from './codecs';
import { shDCToRGB, SH_C0 } from './transforms';
/**
 * Pack a GaussianCloud into GPU-optimized format.
 *
 * @param cloud - Input Gaussian cloud
 * @param format - 'compact' (16 bytes) or 'balanced' (32 bytes)
 * @returns PackedGaussians
 */
export function packGaussians(cloud, format = 'compact') {
    if (format === 'compact')
        return packCompact(cloud);
    return packBalanced(cloud);
}
/**
 * Unpack PackedGaussians back to a GaussianCloud.
 * Note: higher-order SH coefficients are lost during packing.
 */
export function unpackGaussians(packed) {
    if (packed.format === 'compact')
        return unpackCompact(packed);
    return unpackBalanced(packed);
}
/**
 * Compute 3D covariance matrix from rotations and scales.
 * Σ = R · diag(sx², sy², sz²) · Rᵀ → 6 unique upper-triangle values.
 *
 * @param rotations - (N*4) wxyz quaternions flat
 * @param scales - (N*3) linear scales flat
 * @param count - Number of Gaussians
 * @returns Float32Array(N*6) [cov00, cov01, cov02, cov11, cov12, cov22] per Gaussian
 */
export function computeCovariance3D(rotations, scales, count) {
    const out = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
        const qi = i * 4;
        const si = i * 3;
        const oi = i * 6;
        const w = rotations[qi], x = rotations[qi + 1], y = rotations[qi + 2], z = rotations[qi + 3];
        const sx = scales[si], sy = scales[si + 1], sz = scales[si + 2];
        // Rotation matrix from quaternion (column-major conceptually)
        const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - w * z), r02 = 2 * (x * z + w * y);
        const r10 = 2 * (x * y + w * z), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - w * x);
        const r20 = 2 * (x * z - w * y), r21 = 2 * (y * z + w * x), r22 = 1 - 2 * (x * x + y * y);
        // M = R · diag(sx, sy, sz)
        const m00 = r00 * sx, m01 = r01 * sy, m02 = r02 * sz;
        const m10 = r10 * sx, m11 = r11 * sy, m12 = r12 * sz;
        const m20 = r20 * sx, m21 = r21 * sy, m22 = r22 * sz;
        // Σ = M · Mᵀ (symmetric)
        out[oi + 0] = m00 * m00 + m01 * m01 + m02 * m02; // cov00
        out[oi + 1] = m00 * m10 + m01 * m11 + m02 * m12; // cov01
        out[oi + 2] = m00 * m20 + m01 * m21 + m02 * m22; // cov02
        out[oi + 3] = m10 * m10 + m11 * m11 + m12 * m12; // cov11
        out[oi + 4] = m10 * m20 + m11 * m21 + m12 * m22; // cov12
        out[oi + 5] = m20 * m20 + m21 * m21 + m22 * m22; // cov22
    }
    return out;
}
// --- Compact format (16 bytes / 4 uint32 per Gaussian) ---
/*
 * Word 0: posX_f16 [15:0]  | posY_f16 [31:16]
 * Word 1: posZ_f16 [15:0]  | colorR [23:16] | colorG [31:24]
 * Word 2: opacity [7:0]    | colorB [15:8]  | scaleY [23:16] | scaleX [31:24]
 * Word 3: scaleZ [7:0]     | rotU [15:8]    | rotV [23:16]   | rotAngle [31:24]
 */
function packCompact(cloud) {
    const { count } = cloud;
    const data = new Uint32Array(count * 4);
    // Convert SH DC to RGB
    const rgb = shDCToRGB(cloud.sh0);
    for (let i = 0; i < count; i++) {
        const pi = i * 3;
        const ri = i * 4;
        const di = i * 4;
        // Positions as f16
        const posXh = toHalf(cloud.positions[pi]);
        const posYh = toHalf(cloud.positions[pi + 1]);
        const posZh = toHalf(cloud.positions[pi + 2]);
        // Color as u8
        const colorR = Math.round(Math.max(0, Math.min(255, rgb[pi] * 255)));
        const colorG = Math.round(Math.max(0, Math.min(255, rgb[pi + 1] * 255)));
        const colorB = Math.round(Math.max(0, Math.min(255, rgb[pi + 2] * 255)));
        // Opacity as u8
        const opacity = Math.round(Math.max(0, Math.min(255, cloud.opacities[i] * 255)));
        // Scales as log-encoded u8
        const scaleX = encodeLogScale(cloud.scales[pi]);
        const scaleY = encodeLogScale(cloud.scales[pi + 1]);
        const scaleZ = encodeLogScale(cloud.scales[pi + 2]);
        // Rotation as 3 bytes
        const [rotU, rotV, rotAngle] = encodeQuaternion(cloud.rotations[ri], cloud.rotations[ri + 1], cloud.rotations[ri + 2], cloud.rotations[ri + 3]);
        data[di + 0] = (posXh & 0xFFFF) | ((posYh & 0xFFFF) << 16);
        data[di + 1] = (posZh & 0xFFFF) | (colorR << 16) | (colorG << 24);
        data[di + 2] = opacity | (colorB << 8) | (scaleY << 16) | (scaleX << 24);
        data[di + 3] = scaleZ | (rotU << 8) | (rotV << 16) | (rotAngle << 24);
    }
    return { format: 'compact', count, data, bytesPerSplat: 16 };
}
function unpackCompact(packed) {
    const { count, data } = packed;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const opacities = new Float32Array(count);
    const sh0 = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const di = i * 4;
        const pi = i * 3;
        const ri = i * 4;
        const w0 = data[di + 0];
        const w1 = data[di + 1];
        const w2 = data[di + 2];
        const w3 = data[di + 3];
        // Positions from f16
        positions[pi] = fromHalf(w0 & 0xFFFF);
        positions[pi + 1] = fromHalf((w0 >>> 16) & 0xFFFF);
        positions[pi + 2] = fromHalf(w1 & 0xFFFF);
        // Color from u8 → RGB [0,1] → SH DC
        const colorR = ((w1 >>> 16) & 0xFF) / 255;
        const colorG = ((w1 >>> 24) & 0xFF) / 255;
        const colorB = ((w2 >>> 8) & 0xFF) / 255;
        sh0[pi] = (colorR - 0.5) / SH_C0;
        sh0[pi + 1] = (colorG - 0.5) / SH_C0;
        sh0[pi + 2] = (colorB - 0.5) / SH_C0;
        // Opacity from u8
        opacities[i] = (w2 & 0xFF) / 255;
        // Scales from log-encoded u8
        scales[pi] = decodeLogScaleGeneric((w2 >>> 24) & 0xFF);
        scales[pi + 1] = decodeLogScaleGeneric((w2 >>> 16) & 0xFF);
        scales[pi + 2] = decodeLogScaleGeneric(w3 & 0xFF);
        // Rotation from 3 bytes
        const rotU = (w3 >>> 8) & 0xFF;
        const rotV = (w3 >>> 16) & 0xFF;
        const rotAngle = (w3 >>> 24) & 0xFF;
        const [qw, qx, qy, qz] = decodeQuaternion(rotU, rotV, rotAngle);
        rotations[ri] = qw;
        rotations[ri + 1] = qx;
        rotations[ri + 2] = qy;
        rotations[ri + 3] = qz;
    }
    return { count, positions, scales, rotations, opacities, sh0, shDegree: 0 };
}
// --- Balanced format (32 bytes / 8 uint32 per Gaussian) ---
/*
 * Words 0-2: posX, posY, posZ as float32 (12 bytes)
 * Word 3:    cov00_f16 [15:0] | cov01_f16 [31:16]
 * Word 4:    cov02_f16 [15:0] | cov11_f16 [31:16]
 * Word 5:    cov12_f16 [15:0] | cov22_f16 [31:16]
 * Word 6:    colorR [7:0] | colorG [15:8] | colorB [23:16] | opacity [31:24]
 * Word 7:    reserved (0)
 */
function packBalanced(cloud) {
    const { count } = cloud;
    const data = new Uint32Array(count * 8);
    const posView = new Float32Array(data.buffer);
    // Compute covariance
    const cov = computeCovariance3D(cloud.rotations, cloud.scales, count);
    // Convert SH DC to RGB
    const rgb = shDCToRGB(cloud.sh0);
    for (let i = 0; i < count; i++) {
        const pi = i * 3;
        const ci = i * 6;
        const di = i * 8;
        // Positions as f32
        posView[di + 0] = cloud.positions[pi];
        posView[di + 1] = cloud.positions[pi + 1];
        posView[di + 2] = cloud.positions[pi + 2];
        // Covariance as f16
        const c00h = toHalf(cov[ci + 0]);
        const c01h = toHalf(cov[ci + 1]);
        const c02h = toHalf(cov[ci + 2]);
        const c11h = toHalf(cov[ci + 3]);
        const c12h = toHalf(cov[ci + 4]);
        const c22h = toHalf(cov[ci + 5]);
        data[di + 3] = (c00h & 0xFFFF) | ((c01h & 0xFFFF) << 16);
        data[di + 4] = (c02h & 0xFFFF) | ((c11h & 0xFFFF) << 16);
        data[di + 5] = (c12h & 0xFFFF) | ((c22h & 0xFFFF) << 16);
        // Color + opacity as u8
        const colorR = Math.round(Math.max(0, Math.min(255, rgb[pi] * 255)));
        const colorG = Math.round(Math.max(0, Math.min(255, rgb[pi + 1] * 255)));
        const colorB = Math.round(Math.max(0, Math.min(255, rgb[pi + 2] * 255)));
        const opacity = Math.round(Math.max(0, Math.min(255, cloud.opacities[i] * 255)));
        data[di + 6] = colorR | (colorG << 8) | (colorB << 16) | (opacity << 24);
        data[di + 7] = 0; // reserved
    }
    return { format: 'balanced', count, data, bytesPerSplat: 32 };
}
function unpackBalanced(packed) {
    const { count, data } = packed;
    const posView = new Float32Array(data.buffer);
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const opacities = new Float32Array(count);
    const sh0 = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const di = i * 8;
        const pi = i * 3;
        const ri = i * 4;
        // Positions from f32
        positions[pi] = posView[di + 0];
        positions[pi + 1] = posView[di + 1];
        positions[pi + 2] = posView[di + 2];
        // Covariance from f16
        const w3 = data[di + 3];
        const w4 = data[di + 4];
        const w5 = data[di + 5];
        const cov00 = fromHalf(w3 & 0xFFFF);
        const cov01 = fromHalf((w3 >>> 16) & 0xFFFF);
        const cov02 = fromHalf(w4 & 0xFFFF);
        const cov11 = fromHalf((w4 >>> 16) & 0xFFFF);
        const cov12 = fromHalf(w5 & 0xFFFF);
        const cov22 = fromHalf((w5 >>> 16) & 0xFFFF);
        // Eigendecompose covariance to recover scales + rotation
        const { eigenvalues, eigenvectors } = eigendecompose3x3Symmetric(cov00, cov01, cov02, cov11, cov12, cov22);
        // Scales = sqrt(eigenvalues)
        scales[pi] = Math.sqrt(Math.max(0, eigenvalues[0]));
        scales[pi + 1] = Math.sqrt(Math.max(0, eigenvalues[1]));
        scales[pi + 2] = Math.sqrt(Math.max(0, eigenvalues[2]));
        // Rotation matrix → quaternion
        const [qw, qx, qy, qz] = rotationMatrixToQuaternion(eigenvectors);
        rotations[ri] = qw;
        rotations[ri + 1] = qx;
        rotations[ri + 2] = qy;
        rotations[ri + 3] = qz;
        // Color + opacity
        const w6 = data[di + 6];
        const colorR = (w6 & 0xFF) / 255;
        const colorG = ((w6 >>> 8) & 0xFF) / 255;
        const colorB = ((w6 >>> 16) & 0xFF) / 255;
        opacities[i] = ((w6 >>> 24) & 0xFF) / 255;
        sh0[pi] = (colorR - 0.5) / SH_C0;
        sh0[pi + 1] = (colorG - 0.5) / SH_C0;
        sh0[pi + 2] = (colorB - 0.5) / SH_C0;
    }
    return { count, positions, scales, rotations, opacities, sh0, shDegree: 0 };
}
// --- 3×3 symmetric eigendecomposition (Jacobi iteration) ---
function eigendecompose3x3Symmetric(a00, a01, a02, a11, a12, a22) {
    // Jacobi eigenvalue algorithm for 3x3 symmetric matrices
    // Matrix stored as flat row-major: [a00, a01, a02, a10, a11, a12, a20, a21, a22]
    const A = [a00, a01, a02, a01, a11, a12, a02, a12, a22];
    // Eigenvector matrix (starts as identity)
    const V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let iter = 0; iter < 20; iter++) {
        // Find largest off-diagonal element
        let maxVal = 0;
        let p = 0, q = 1;
        const offDiag = [
            [0, 1, Math.abs(A[1])],
            [0, 2, Math.abs(A[2])],
            [1, 2, Math.abs(A[5])],
        ];
        for (const [pp, qq, val] of offDiag) {
            if (val > maxVal) {
                maxVal = val;
                p = pp;
                q = qq;
            }
        }
        if (maxVal < 1e-10)
            break;
        // Compute rotation
        const app = A[p * 3 + p], aqq = A[q * 3 + q], apq = A[p * 3 + q];
        const tau = (aqq - app) / (2 * apq);
        const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        // Apply Jacobi rotation to A
        const newA = [...A];
        newA[p * 3 + p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        newA[q * 3 + q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        newA[p * 3 + q] = 0;
        newA[q * 3 + p] = 0;
        for (let r = 0; r < 3; r++) {
            if (r === p || r === q)
                continue;
            const arp = A[r * 3 + p];
            const arq = A[r * 3 + q];
            newA[r * 3 + p] = c * arp - s * arq;
            newA[p * 3 + r] = newA[r * 3 + p];
            newA[r * 3 + q] = s * arp + c * arq;
            newA[q * 3 + r] = newA[r * 3 + q];
        }
        A[0] = newA[0];
        A[1] = newA[1];
        A[2] = newA[2];
        A[3] = newA[3];
        A[4] = newA[4];
        A[5] = newA[5];
        A[6] = newA[6];
        A[7] = newA[7];
        A[8] = newA[8];
        // Apply rotation to V
        for (let r = 0; r < 3; r++) {
            const vrp = V[r * 3 + p];
            const vrq = V[r * 3 + q];
            V[r * 3 + p] = c * vrp - s * vrq;
            V[r * 3 + q] = s * vrp + c * vrq;
        }
    }
    // Sort eigenvalues descending and reorder eigenvectors
    const eigs = [[A[0], 0], [A[4], 1], [A[8], 2]];
    eigs.sort((a, b) => b[0] - a[0]);
    const eigenvalues = [eigs[0][0], eigs[1][0], eigs[2][0]];
    const sorted = new Array(9);
    for (let col = 0; col < 3; col++) {
        const srcCol = eigs[col][1];
        for (let row = 0; row < 3; row++) {
            sorted[row * 3 + col] = V[row * 3 + srcCol];
        }
    }
    return { eigenvalues, eigenvectors: sorted };
}
function rotationMatrixToQuaternion(m) {
    // m is row-major 3×3
    const m00 = m[0], m01 = m[1], m02 = m[2];
    const m10 = m[3], m11 = m[4], m12 = m[5];
    const m20 = m[6], m21 = m[7], m22 = m[8];
    const trace = m00 + m11 + m22;
    let w, x, y, z;
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1.0);
        w = 0.25 / s;
        x = (m21 - m12) * s;
        y = (m02 - m20) * s;
        z = (m10 - m01) * s;
    }
    else if (m00 > m11 && m00 > m22) {
        const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
        w = (m21 - m12) / s;
        x = 0.25 * s;
        y = (m01 + m10) / s;
        z = (m02 + m20) / s;
    }
    else if (m11 > m22) {
        const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
        w = (m02 - m20) / s;
        x = (m01 + m10) / s;
        y = 0.25 * s;
        z = (m12 + m21) / s;
    }
    else {
        const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
        w = (m10 - m01) / s;
        x = (m02 + m20) / s;
        y = (m12 + m21) / s;
        z = 0.25 * s;
    }
    // Ensure determinant is positive (proper rotation, not reflection)
    const det = m00 * (m11 * m22 - m12 * m21)
        - m01 * (m10 * m22 - m12 * m20)
        + m02 * (m10 * m21 - m11 * m20);
    if (det < 0) {
        w = -w;
        x = -x;
        y = -y;
        z = -z;
    }
    // Normalize and ensure w >= 0
    const len = Math.sqrt(w * w + x * x + y * y + z * z);
    if (len > 0) {
        const inv = 1 / len;
        w *= inv;
        x *= inv;
        y *= inv;
        z *= inv;
    }
    if (w < 0) {
        w = -w;
        x = -x;
        y = -y;
        z = -z;
    }
    return [w, x, y, z];
}
