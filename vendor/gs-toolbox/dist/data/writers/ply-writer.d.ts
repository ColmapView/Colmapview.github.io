import type { GaussianCloud } from '../../types';
/**
 * Write a GaussianCloud to standard PLY binary format (little-endian).
 *
 * Outputs in the canonical PLY format used by 3DGS training tools:
 * - Positions: x, y, z (float32)
 * - Normals: nx, ny, nz (float32, zeros)
 * - SH DC: f_dc_0, f_dc_1, f_dc_2 (float32, raw SH coefficients)
 * - SH rest: f_rest_0..N (float32, channel-first: all R, then G, then B)
 * - Opacity: opacity (float32, logit space)
 * - Scales: scale_0, scale_1, scale_2 (float32, log space)
 * - Rotations: rot_0, rot_1, rot_2, rot_3 (float32, wxyz)
 */
export declare function savePLY(cloud: GaussianCloud): ArrayBuffer;
