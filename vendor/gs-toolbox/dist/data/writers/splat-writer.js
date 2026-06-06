// .splat format writer — 32 bytes per Gaussian
import { SH_C0 } from '../transforms';
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
export function saveSplat(cloud) {
    const STRIDE = 32;
    const buffer = new ArrayBuffer(cloud.count * STRIDE);
    const dataView = new DataView(buffer);
    for (let i = 0; i < cloud.count; i++) {
        const off = i * STRIDE;
        // Position (direct f32)
        dataView.setFloat32(off, cloud.positions[i * 3], true);
        dataView.setFloat32(off + 4, cloud.positions[i * 3 + 1], true);
        dataView.setFloat32(off + 8, cloud.positions[i * 3 + 2], true);
        // Scale (direct f32)
        dataView.setFloat32(off + 12, cloud.scales[i * 3], true);
        dataView.setFloat32(off + 16, cloud.scales[i * 3 + 1], true);
        dataView.setFloat32(off + 20, cloud.scales[i * 3 + 2], true);
        // Color: SH DC → RGB [0,1] → u8
        const r = Math.max(0, Math.min(1, 0.5 + SH_C0 * cloud.sh0[i * 3]));
        const g = Math.max(0, Math.min(1, 0.5 + SH_C0 * cloud.sh0[i * 3 + 1]));
        const b = Math.max(0, Math.min(1, 0.5 + SH_C0 * cloud.sh0[i * 3 + 2]));
        const a = Math.max(0, Math.min(1, cloud.opacities[i]));
        dataView.setUint8(off + 24, Math.round(r * 255));
        dataView.setUint8(off + 25, Math.round(g * 255));
        dataView.setUint8(off + 26, Math.round(b * 255));
        dataView.setUint8(off + 27, Math.round(a * 255));
        // Rotation: wxyz float → u8 [0, 255] via (q * 128 + 128)
        const qw = cloud.rotations[i * 4];
        const qx = cloud.rotations[i * 4 + 1];
        const qy = cloud.rotations[i * 4 + 2];
        const qz = cloud.rotations[i * 4 + 3];
        dataView.setUint8(off + 28, Math.round(Math.max(0, Math.min(255, qw * 128 + 128))));
        dataView.setUint8(off + 29, Math.round(Math.max(0, Math.min(255, qx * 128 + 128))));
        dataView.setUint8(off + 30, Math.round(Math.max(0, Math.min(255, qy * 128 + 128))));
        dataView.setUint8(off + 31, Math.round(Math.max(0, Math.min(255, qz * 128 + 128))));
    }
    return buffer;
}
