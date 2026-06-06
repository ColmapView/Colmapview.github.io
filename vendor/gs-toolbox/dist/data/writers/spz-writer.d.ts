import type { GaussianCloud } from '../../types';
/**
 * Write a GaussianCloud to SPZ compressed format.
 *
 * SPZ layout (uncompressed, then gzipped):
 *   Header: 16 bytes (magic, version, numPoints, shDegree, flags, reserved)
 *   Positions: count × 9 bytes (3 × 3-byte fixed24)
 *   Rotations: count × 4 bytes (smallest-three 32-bit)
 *   Scales: count × 3 bytes (log-encoded uint8)
 *   Opacities: count × 1 byte (sigmoid-encoded uint8)
 *   SH0: count × 3 bytes (uint8 per channel)
 *   SHN: count × numCoeffs × 3 bytes (uint8 per coefficient)
 */
export declare function saveSPZ(cloud: GaussianCloud): ArrayBuffer;
