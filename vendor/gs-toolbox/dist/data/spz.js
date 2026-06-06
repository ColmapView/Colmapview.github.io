// SPZ (Splat Packed Zipped) format loader
// Gzip compressed with fixed-point quantization
// Source: Niantic Labs (MIT License)
import pako from 'pako';
import { decodeFixed24, decodeSmallestThree32, decodeSPZLogScale, decodeSPZSigmoidOpacity, decodeSPZColor, } from '../codecs';
/** Parse SPZ header from decompressed data (16 bytes) */
export function parseSPZHeader(data) {
    const view = new DataView(data.buffer, data.byteOffset);
    return {
        magic: view.getUint32(0, true),
        version: view.getUint32(4, true),
        numPoints: view.getUint32(8, true),
        shDegree: view.getUint8(12),
        flags: view.getUint8(13),
        reserved: view.getUint16(14, true),
    };
}
/** Validate SPZ magic bytes ("SPZ\0") */
export function validateSPZMagic(header) {
    const magicStr = String.fromCharCode((header.magic) & 0xFF, (header.magic >> 8) & 0xFF, (header.magic >> 16) & 0xFF, (header.magic >> 24) & 0xFF);
    if (magicStr !== 'SPZ\0') {
        throw new Error(`Invalid SPZ magic: expected "SPZ\\0", got "${magicStr}"`);
    }
}
/** Decode SPZ positions from decompressed data */
export function decodeSPZPositions(data, count, offset, posScale, posBias) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const base = offset + i * 9;
        positions[i * 3] = decodeFixed24(data, base, posScale, posBias);
        positions[i * 3 + 1] = decodeFixed24(data, base + 3, posScale, posBias);
        positions[i * 3 + 2] = decodeFixed24(data, base + 6, posScale, posBias);
    }
    return positions;
}
/** Decode SPZ rotations from decompressed data */
export function decodeSPZRotations(data, count, offset) {
    const view = new DataView(data.buffer, data.byteOffset);
    const rotations = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
        const packed = view.getUint32(offset + i * 4, true);
        const [w, x, y, z] = decodeSmallestThree32(packed);
        rotations[i * 4] = w;
        rotations[i * 4 + 1] = x;
        rotations[i * 4 + 2] = y;
        rotations[i * 4 + 3] = z;
    }
    return rotations;
}
/** Decode SPZ scales from decompressed data */
export function decodeSPZScales(data, count, offset) {
    const scales = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const base = offset + i * 3;
        scales[i * 3] = decodeSPZLogScale(data[base]);
        scales[i * 3 + 1] = decodeSPZLogScale(data[base + 1]);
        scales[i * 3 + 2] = decodeSPZLogScale(data[base + 2]);
    }
    return scales;
}
/** Decode SPZ opacities from decompressed data */
export function decodeSPZOpacities(data, count, offset) {
    const opacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        opacities[i] = decodeSPZSigmoidOpacity(data[offset + i]);
    }
    return opacities;
}
/** Decode SPZ SH0 (DC) from decompressed data */
export function decodeSPZSH0(data, count, offset) {
    const sh0 = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const base = offset + i * 3;
        sh0[i * 3] = decodeSPZColor(data[base]);
        sh0[i * 3 + 1] = decodeSPZColor(data[base + 1]);
        sh0[i * 3 + 2] = decodeSPZColor(data[base + 2]);
    }
    return sh0;
}
/** Decode SPZ higher-order SH from decompressed data */
export function decodeSPZSHN(data, count, offset, shDegree) {
    if (shDegree === 0)
        return undefined;
    const numCoeffs = (shDegree + 1) * (shDegree + 1) - 1;
    const shN = new Float32Array(count * numCoeffs * 3);
    for (let i = 0; i < count; i++) {
        for (let j = 0; j < numCoeffs * 3; j++) {
            const byteOff = offset + i * numCoeffs * 3 + j;
            if (byteOff < data.length) {
                shN[i * numCoeffs * 3 + j] = decodeSPZColor(data[byteOff]);
            }
        }
    }
    return shN;
}
/** Load SPZ from decompressed Uint8Array */
export function loadSPZFromDecompressed(data) {
    const header = parseSPZHeader(data);
    validateSPZMagic(header);
    const count = header.numPoints;
    const shDegree = Math.min(3, header.shDegree);
    const posScale = 10.0;
    const posBias = 0.0;
    // Section offsets (header = 16 bytes)
    const HEADER_SIZE = 16;
    const posOffset = HEADER_SIZE;
    const rotOffset = posOffset + count * 9; // 3 × 3 bytes
    const scaleOffset = rotOffset + count * 4; // 1 × 4 bytes
    const opacOffset = scaleOffset + count * 3; // 3 × 1 byte
    const sh0Offset = opacOffset + count; // 1 × 1 byte
    const shNOffset = sh0Offset + count * 3; // 3 × 1 byte
    const positions = decodeSPZPositions(data, count, posOffset, posScale, posBias);
    const rotations = decodeSPZRotations(data, count, rotOffset);
    const scales = decodeSPZScales(data, count, scaleOffset);
    const opacities = decodeSPZOpacities(data, count, opacOffset);
    const sh0 = decodeSPZSH0(data, count, sh0Offset);
    const shN = decodeSPZSHN(data, count, shNOffset, shDegree);
    return { count, positions, scales, rotations, opacities, sh0, shN, shDegree };
}
/** Load SPZ from gzip-compressed ArrayBuffer */
export function loadSPZFromBuffer(compressed) {
    let data;
    try {
        data = pako.ungzip(new Uint8Array(compressed));
    }
    catch {
        throw new Error('Failed to decompress SPZ file — invalid gzip');
    }
    return loadSPZFromDecompressed(data);
}
/** Load SPZ from File, ArrayBuffer, or URL */
export async function loadSPZ(source) {
    let buffer;
    if (typeof source === 'string') {
        const response = await fetch(source);
        if (!response.ok)
            throw new Error(`Failed to fetch SPZ: ${response.statusText}`);
        buffer = await response.arrayBuffer();
    }
    else if (source instanceof File) {
        buffer = await source.arrayBuffer();
    }
    else {
        buffer = source;
    }
    return loadSPZFromBuffer(buffer);
}
