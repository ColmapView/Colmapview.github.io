// Scene editing operations — pure functions, never mutate inputs
/** Deep clone a GaussianCloud. */
export function cloneCloud(cloud) {
    return {
        count: cloud.count,
        positions: new Float32Array(cloud.positions),
        scales: new Float32Array(cloud.scales),
        rotations: new Float32Array(cloud.rotations),
        opacities: new Float32Array(cloud.opacities),
        sh0: new Float32Array(cloud.sh0),
        shN: cloud.shN ? new Float32Array(cloud.shN) : undefined,
        shDegree: cloud.shDegree,
    };
}
/** Filter Gaussians by predicate. Returns new cloud with only matching Gaussians. */
export function filterCloud(cloud, predicate) {
    // First pass: count matches
    const indices = [];
    for (let i = 0; i < cloud.count; i++) {
        if (predicate(i))
            indices.push(i);
    }
    return extractIndices(cloud, indices);
}
/** Keep only Gaussians inside an axis-aligned bounding box. */
export function cropCloud(cloud, min, max) {
    return filterCloud(cloud, (i) => {
        const x = cloud.positions[i * 3];
        const y = cloud.positions[i * 3 + 1];
        const z = cloud.positions[i * 3 + 2];
        return x >= min[0] && x <= max[0] &&
            y >= min[1] && y <= max[1] &&
            z >= min[2] && z <= max[2];
    });
}
/** Merge multiple GaussianClouds into one. SH degree = min of all inputs. */
export function mergeClouds(clouds) {
    if (clouds.length === 0)
        return emptyCloud(0);
    if (clouds.length === 1)
        return cloneCloud(clouds[0]);
    const totalCount = clouds.reduce((sum, c) => sum + c.count, 0);
    const minDegree = Math.min(...clouds.map(c => c.shDegree));
    const numCoeffs = minDegree > 0 ? (minDegree + 1) * (minDegree + 1) - 1 : 0;
    const positions = new Float32Array(totalCount * 3);
    const scales = new Float32Array(totalCount * 3);
    const rotations = new Float32Array(totalCount * 4);
    const opacities = new Float32Array(totalCount);
    const sh0 = new Float32Array(totalCount * 3);
    const shN = numCoeffs > 0 ? new Float32Array(totalCount * numCoeffs * 3) : undefined;
    let offset = 0;
    for (const cloud of clouds) {
        const n = cloud.count;
        positions.set(cloud.positions.subarray(0, n * 3), offset * 3);
        scales.set(cloud.scales.subarray(0, n * 3), offset * 3);
        rotations.set(cloud.rotations.subarray(0, n * 4), offset * 4);
        opacities.set(cloud.opacities.subarray(0, n), offset);
        sh0.set(cloud.sh0.subarray(0, n * 3), offset * 3);
        if (shN && numCoeffs > 0) {
            const srcCoeffs = cloud.shDegree > 0 ? (cloud.shDegree + 1) * (cloud.shDegree + 1) - 1 : 0;
            if (cloud.shN && srcCoeffs >= numCoeffs) {
                // Copy only the coefficients up to minDegree
                for (let i = 0; i < n; i++) {
                    const srcBase = i * srcCoeffs * 3;
                    const dstBase = (offset + i) * numCoeffs * 3;
                    shN.set(cloud.shN.subarray(srcBase, srcBase + numCoeffs * 3), dstBase);
                }
            }
            // If cloud has fewer coefficients or no shN, zeros are already in place
        }
        offset += n;
    }
    return { count: totalCount, positions, scales, rotations, opacities, sh0, shN, shDegree: minDegree };
}
/**
 * Apply a 4x4 affine transform (column-major) to positions and rotations.
 * Handles uniform scaling. For non-uniform scale, only the uniform component is applied.
 */
export function transformCloud(cloud, matrix) {
    const result = cloneCloud(cloud);
    const n = result.count;
    // Extract upper-left 3×3 (column-major)
    const m00 = matrix[0], m10 = matrix[1], m20 = matrix[2];
    const m01 = matrix[4], m11 = matrix[5], m21 = matrix[6];
    const m02 = matrix[8], m12 = matrix[9], m22 = matrix[10];
    const tx = matrix[12], ty = matrix[13], tz = matrix[14];
    // Compute determinant for scale factor
    const det = m00 * (m11 * m22 - m12 * m21)
        - m01 * (m10 * m22 - m12 * m20)
        + m02 * (m10 * m21 - m11 * m20);
    const scaleFactor = Math.cbrt(Math.abs(det));
    // Extract rotation matrix (remove scale)
    const invScale = scaleFactor > 1e-10 ? 1 / scaleFactor : 1;
    const r00 = m00 * invScale, r10 = m10 * invScale, r20 = m20 * invScale;
    const r01 = m01 * invScale, r11 = m11 * invScale, r21 = m21 * invScale;
    const r02 = m02 * invScale, r12 = m12 * invScale, r22 = m22 * invScale;
    // Convert rotation matrix to quaternion
    const matQuat = mat3ToQuat(r00, r01, r02, r10, r11, r12, r20, r21, r22);
    for (let i = 0; i < n; i++) {
        const pi = i * 3;
        const ri = i * 4;
        // Transform position: p' = M * p + t
        const px = cloud.positions[pi];
        const py = cloud.positions[pi + 1];
        const pz = cloud.positions[pi + 2];
        result.positions[pi] = m00 * px + m01 * py + m02 * pz + tx;
        result.positions[pi + 1] = m10 * px + m11 * py + m12 * pz + ty;
        result.positions[pi + 2] = m20 * px + m21 * py + m22 * pz + tz;
        // Scale: uniform scaling
        result.scales[pi] = cloud.scales[pi] * scaleFactor;
        result.scales[pi + 1] = cloud.scales[pi + 1] * scaleFactor;
        result.scales[pi + 2] = cloud.scales[pi + 2] * scaleFactor;
        // Rotation: compose matQuat * oldQuat
        const ow = cloud.rotations[ri];
        const ox = cloud.rotations[ri + 1];
        const oy = cloud.rotations[ri + 2];
        const oz = cloud.rotations[ri + 3];
        const [nw, nx, ny, nz] = quatMultiply(matQuat, [ow, ox, oy, oz]);
        result.rotations[ri] = nw;
        result.rotations[ri + 1] = nx;
        result.rotations[ri + 2] = ny;
        result.rotations[ri + 3] = nz;
    }
    return result;
}
/** Random subsample by ratio (0-1). Returns ~ratio * count Gaussians. */
export function subsampleCloud(cloud, ratio, seed) {
    const targetCount = Math.round(cloud.count * Math.max(0, Math.min(1, ratio)));
    if (targetCount >= cloud.count)
        return cloneCloud(cloud);
    if (targetCount === 0)
        return emptyCloud(cloud.shDegree);
    // Fisher-Yates partial shuffle to pick targetCount indices
    const allIndices = new Uint32Array(cloud.count);
    for (let i = 0; i < cloud.count; i++)
        allIndices[i] = i;
    let rng = seed !== undefined ? (seed || 1) : ((Math.random() * 0xFFFFFFFF) >>> 0);
    for (let i = 0; i < targetCount; i++) {
        // Simple xorshift32 PRNG
        rng ^= rng << 13;
        rng ^= rng >>> 17;
        rng ^= rng << 5;
        const j = i + ((rng >>> 0) % (cloud.count - i));
        const tmp = allIndices[i];
        allIndices[i] = allIndices[j];
        allIndices[j] = tmp;
    }
    const selected = Array.from(allIndices.subarray(0, targetCount));
    selected.sort((a, b) => a - b); // keep original order
    return extractIndices(cloud, selected);
}
/** Remove Gaussians with opacity below threshold. */
export function pruneByOpacity(cloud, minOpacity) {
    return filterCloud(cloud, (i) => cloud.opacities[i] >= minOpacity);
}
/** Remove Gaussians with scale magnitude above threshold (outlier removal). */
export function pruneByScale(cloud, maxScale) {
    return filterCloud(cloud, (i) => {
        const sx = cloud.scales[i * 3];
        const sy = cloud.scales[i * 3 + 1];
        const sz = cloud.scales[i * 3 + 2];
        const mag = Math.sqrt(sx * sx + sy * sy + sz * sz);
        return mag <= maxScale;
    });
}
// --- Internal helpers ---
function extractIndices(cloud, indices) {
    const n = indices.length;
    const numCoeffs = cloud.shDegree > 0 ? (cloud.shDegree + 1) * (cloud.shDegree + 1) - 1 : 0;
    const positions = new Float32Array(n * 3);
    const scales = new Float32Array(n * 3);
    const rotations = new Float32Array(n * 4);
    const opacities = new Float32Array(n);
    const sh0 = new Float32Array(n * 3);
    const shN = numCoeffs > 0 && cloud.shN ? new Float32Array(n * numCoeffs * 3) : undefined;
    for (let j = 0; j < n; j++) {
        const i = indices[j];
        positions[j * 3] = cloud.positions[i * 3];
        positions[j * 3 + 1] = cloud.positions[i * 3 + 1];
        positions[j * 3 + 2] = cloud.positions[i * 3 + 2];
        scales[j * 3] = cloud.scales[i * 3];
        scales[j * 3 + 1] = cloud.scales[i * 3 + 1];
        scales[j * 3 + 2] = cloud.scales[i * 3 + 2];
        rotations[j * 4] = cloud.rotations[i * 4];
        rotations[j * 4 + 1] = cloud.rotations[i * 4 + 1];
        rotations[j * 4 + 2] = cloud.rotations[i * 4 + 2];
        rotations[j * 4 + 3] = cloud.rotations[i * 4 + 3];
        opacities[j] = cloud.opacities[i];
        sh0[j * 3] = cloud.sh0[i * 3];
        sh0[j * 3 + 1] = cloud.sh0[i * 3 + 1];
        sh0[j * 3 + 2] = cloud.sh0[i * 3 + 2];
        if (shN && cloud.shN) {
            const srcBase = i * numCoeffs * 3;
            const dstBase = j * numCoeffs * 3;
            shN.set(cloud.shN.subarray(srcBase, srcBase + numCoeffs * 3), dstBase);
        }
    }
    return { count: n, positions, scales, rotations, opacities, sh0, shN, shDegree: cloud.shDegree };
}
function emptyCloud(shDegree) {
    return {
        count: 0,
        positions: new Float32Array(0),
        scales: new Float32Array(0),
        rotations: new Float32Array(0),
        opacities: new Float32Array(0),
        sh0: new Float32Array(0),
        shDegree,
    };
}
function mat3ToQuat(r00, r01, r02, r10, r11, r12, r20, r21, r22) {
    const trace = r00 + r11 + r22;
    let w, x, y, z;
    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1.0);
        w = 0.25 / s;
        x = (r21 - r12) * s;
        y = (r02 - r20) * s;
        z = (r10 - r01) * s;
    }
    else if (r00 > r11 && r00 > r22) {
        const s = 2.0 * Math.sqrt(1.0 + r00 - r11 - r22);
        w = (r21 - r12) / s;
        x = 0.25 * s;
        y = (r01 + r10) / s;
        z = (r02 + r20) / s;
    }
    else if (r11 > r22) {
        const s = 2.0 * Math.sqrt(1.0 + r11 - r00 - r22);
        w = (r02 - r20) / s;
        x = (r01 + r10) / s;
        y = 0.25 * s;
        z = (r12 + r21) / s;
    }
    else {
        const s = 2.0 * Math.sqrt(1.0 + r22 - r00 - r11);
        w = (r10 - r01) / s;
        x = (r02 + r20) / s;
        y = (r12 + r21) / s;
        z = 0.25 * s;
    }
    // Normalize
    const len = Math.sqrt(w * w + x * x + y * y + z * z);
    if (len > 0) {
        const inv = 1 / len;
        w *= inv;
        x *= inv;
        y *= inv;
        z *= inv;
    }
    // Canonical form: w >= 0
    if (w < 0) {
        w = -w;
        x = -x;
        y = -y;
        z = -z;
    }
    return [w, x, y, z];
}
function quatMultiply(a, b) {
    const [aw, ax, ay, az] = a;
    const [bw, bx, by, bz] = b;
    let w = aw * bw - ax * bx - ay * by - az * bz;
    let x = aw * bx + ax * bw + ay * bz - az * by;
    let y = aw * by - ax * bz + ay * bw + az * bx;
    let z = aw * bz + ax * by - ay * bx + az * bw;
    // Normalize
    const len = Math.sqrt(w * w + x * x + y * y + z * z);
    if (len > 0) {
        const inv = 1 / len;
        w *= inv;
        x *= inv;
        y *= inv;
        z *= inv;
    }
    return [w, x, y, z];
}
