// SPZ (Splat Packed Zipped) format writer
// Gzip compressed with fixed-point quantization
// Inverse of the SPZ decoder in spz.ts
import pako from 'pako';
import { encodeFixed24, encodeSmallestThree32, encodeSPZLogScale, encodeSPZSigmoidOpacity, encodeSPZColor, } from '../../codecs';
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
export function saveSPZ(cloud) {
    const { count, shDegree } = cloud;
    const numCoeffs = shDegree > 0 ? (shDegree + 1) * (shDegree + 1) - 1 : 0;
    if (shDegree > 0 && !cloud.shN) {
        throw new Error(`saveSPZ: shDegree=${shDegree} but shN is undefined`);
    }
    // SPZ format uses hardcoded posScale=10.0 (not stored in header, decoder also uses 10.0).
    // Positions outside [-10, +10] will be clipped to the 24-bit fixed-point range.
    const posScale = 10.0;
    const posBias = 0.0;
    // Calculate total uncompressed size
    const HEADER_SIZE = 16;
    const posSize = count * 9; // 3 coords × 3 bytes
    const rotSize = count * 4; // 1 × uint32
    const scaleSize = count * 3; // 3 × uint8
    const opacSize = count; // 1 × uint8
    const sh0Size = count * 3; // 3 × uint8
    const shNSize = count * numCoeffs * 3; // numCoeffs × 3 × uint8
    const totalSize = HEADER_SIZE + posSize + rotSize + scaleSize + opacSize + sh0Size + shNSize;
    const data = new Uint8Array(totalSize);
    const view = new DataView(data.buffer);
    // Write header
    // Magic: "SPZ\0"
    data[0] = 0x53; // S
    data[1] = 0x50; // P
    data[2] = 0x5A; // Z
    data[3] = 0x00; // \0
    view.setUint32(4, 2, true); // version = 2
    view.setUint32(8, count, true); // numPoints
    data[12] = shDegree; // shDegree
    data[13] = 0; // flags
    view.setUint16(14, 0, true); // reserved
    // Section offsets
    let offset = HEADER_SIZE;
    // Warn if positions exceed the ±10 range (24-bit fixed point clips at posScale=10)
    let clippedCount = 0;
    for (let i = 0; i < count * 3; i++) {
        if (Math.abs(cloud.positions[i]) > posScale)
            clippedCount++;
    }
    if (clippedCount > 0) {
        console.warn(`[gs-toolbox] SPZ positions clipped: ${clippedCount} values exceed ±${posScale} range`);
    }
    // Positions (fixed24)
    for (let i = 0; i < count; i++) {
        encodeFixed24(data, offset, cloud.positions[i * 3], posScale, posBias);
        encodeFixed24(data, offset + 3, cloud.positions[i * 3 + 1], posScale, posBias);
        encodeFixed24(data, offset + 6, cloud.positions[i * 3 + 2], posScale, posBias);
        offset += 9;
    }
    // Rotations (smallest-three 32-bit)
    for (let i = 0; i < count; i++) {
        const packed = encodeSmallestThree32(cloud.rotations[i * 4], cloud.rotations[i * 4 + 1], cloud.rotations[i * 4 + 2], cloud.rotations[i * 4 + 3]);
        view.setUint32(offset, packed, true);
        offset += 4;
    }
    // Scales (log-encoded uint8)
    for (let i = 0; i < count; i++) {
        data[offset] = encodeSPZLogScale(cloud.scales[i * 3]);
        data[offset + 1] = encodeSPZLogScale(cloud.scales[i * 3 + 1]);
        data[offset + 2] = encodeSPZLogScale(cloud.scales[i * 3 + 2]);
        offset += 3;
    }
    // Opacities (sigmoid-encoded uint8)
    for (let i = 0; i < count; i++) {
        data[offset] = encodeSPZSigmoidOpacity(cloud.opacities[i]);
        offset += 1;
    }
    // SH0 (color-encoded uint8)
    for (let i = 0; i < count; i++) {
        data[offset] = encodeSPZColor(cloud.sh0[i * 3]);
        data[offset + 1] = encodeSPZColor(cloud.sh0[i * 3 + 1]);
        data[offset + 2] = encodeSPZColor(cloud.sh0[i * 3 + 2]);
        offset += 3;
    }
    // SHN (color-encoded uint8, interleaved)
    if (numCoeffs > 0 && cloud.shN) {
        for (let i = 0; i < count; i++) {
            for (let j = 0; j < numCoeffs * 3; j++) {
                data[offset] = encodeSPZColor(cloud.shN[i * numCoeffs * 3 + j]);
                offset += 1;
            }
        }
    }
    // Gzip compress
    const compressed = pako.gzip(data);
    return compressed.buffer;
}
