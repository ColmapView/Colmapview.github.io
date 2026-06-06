// .splat 32-byte binary format loader
import { SH_C0 } from './transforms';
/**
 * Load a .splat file from ArrayBuffer.
 *
 * 32 bytes per Gaussian, little-endian:
 *   0-11:  Position (3×f32) — already linear
 *  12-23:  Scale (3×f32) — already linear
 *  24-27:  Color (RGBA u8) — converted to SH DC + opacity
 *  28-31:  Rotation (4×u8) — decoded and normalized
 */
export function loadSplatFromBuffer(buffer) {
    const STRIDE = 32;
    const count = Math.floor(buffer.byteLength / STRIDE);
    const dataView = new DataView(buffer);
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const opacities = new Float32Array(count);
    const sh0 = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const off = i * STRIDE;
        // Position (direct)
        positions[i * 3] = dataView.getFloat32(off, true);
        positions[i * 3 + 1] = dataView.getFloat32(off + 4, true);
        positions[i * 3 + 2] = dataView.getFloat32(off + 8, true);
        // Scale (already linear)
        scales[i * 3] = dataView.getFloat32(off + 12, true);
        scales[i * 3 + 1] = dataView.getFloat32(off + 16, true);
        scales[i * 3 + 2] = dataView.getFloat32(off + 20, true);
        // Color → SH DC + opacity
        const r = dataView.getUint8(off + 24) / 255;
        const g = dataView.getUint8(off + 25) / 255;
        const b = dataView.getUint8(off + 26) / 255;
        const a = dataView.getUint8(off + 27) / 255;
        sh0[i * 3] = (r - 0.5) / SH_C0;
        sh0[i * 3 + 1] = (g - 0.5) / SH_C0;
        sh0[i * 3 + 2] = (b - 0.5) / SH_C0;
        opacities[i] = a;
        // Rotation: u8 → [-1,1], normalize
        const qw = (dataView.getUint8(off + 28) - 128) / 128;
        const qx = (dataView.getUint8(off + 29) - 128) / 128;
        const qy = (dataView.getUint8(off + 30) - 128) / 128;
        const qz = (dataView.getUint8(off + 31) - 128) / 128;
        const qlen = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
        const inv = qlen > 0 ? 1 / qlen : 0;
        rotations[i * 4] = qw * inv;
        rotations[i * 4 + 1] = qx * inv;
        rotations[i * 4 + 2] = qy * inv;
        rotations[i * 4 + 3] = qz * inv;
    }
    return { count, positions, scales, rotations, opacities, sh0, shDegree: 0 };
}
/** Load a .splat file from File, ArrayBuffer, or URL */
export async function loadSplat(source) {
    let buffer;
    if (typeof source === 'string') {
        const response = await fetch(source);
        if (!response.ok)
            throw new Error(`Failed to fetch splat: ${response.statusText}`);
        buffer = await response.arrayBuffer();
    }
    else if (source instanceof File) {
        buffer = await source.arrayBuffer();
    }
    else {
        buffer = source;
    }
    return loadSplatFromBuffer(buffer);
}
