// SPZ (Splat Packed Zipped) format loader
// Gzip compressed with fixed-point quantization
// Source: Niantic Labs (MIT License)
import pako from 'pako';
import { decodeFixed24, decodeSmallestThree32, decodeSPZLogScale, decodeSPZSigmoidOpacity, decodeSPZColor, fromHalf, } from '../../codecs';
import { SH_C0 } from '../transforms';
const SPARK_SPZ_MAGIC = 0x5053474e; // "NGSP"
const SPARK_SPZ_SH_VECS = { 1: 3, 2: 8, 3: 15 };
const SPARK_SPZ_LOD_FLAG = 0x80;
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
/** Parse Spark/Niantic NGSP SPZ header from decompressed data. */
export function parseSparkSPZHeader(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return {
        magic: view.getUint32(0, true),
        version: view.getUint32(4, true),
        numSplats: view.getUint32(8, true),
        shDegree: data[12],
        fractionalBits: data[13],
        flags: data[14],
        reserved: data[15],
    };
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
/** Decode SPZ higher-order SH from decompressed data.
 * SPZ stores SH in interleaved order [R0,G0,B0, R1,G1,B1, ...] — color is the
 * inner (fastest-varying) axis, matching our GaussianCloud.shN layout.
 * (Confirmed against Niantic's splat-types.h reference implementation.) */
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
    if (header.magic === SPARK_SPZ_MAGIC) {
        return loadSparkSPZFromDecompressed(data);
    }
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
/** Load Spark/Niantic NGSP SPZ from decompressed gzip payload. */
export function loadSparkSPZFromDecompressed(data) {
    const header = parseSparkSPZHeader(data);
    if (header.magic !== SPARK_SPZ_MAGIC) {
        throw new Error(`Invalid Spark SPZ magic: 0x${header.magic.toString(16).padStart(8, '0')}`);
    }
    if (header.version < 1 || header.version > 3) {
        throw new Error(`Unsupported Spark SPZ version: ${header.version}`);
    }
    const count = header.numSplats;
    const shDegree = Math.min(3, header.shDegree);
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const opacities = new Float32Array(count);
    const sh0 = new Float32Array(count * 3);
    const shComponents = SPARK_SPZ_SH_VECS[shDegree] ? SPARK_SPZ_SH_VECS[shDegree] * 3 : 0;
    const shN = shComponents > 0 ? new Float32Array(count * shComponents) : undefined;
    let offset = 16;
    if (header.version === 1) {
        requireBytes(data, offset, count * 6, 'Spark SPZ centers');
        for (let i = 0; i < count; i++) {
            const src = offset + i * 6;
            positions[i * 3] = fromHalf(data[src] | (data[src + 1] << 8));
            positions[i * 3 + 1] = fromHalf(data[src + 2] | (data[src + 3] << 8));
            positions[i * 3 + 2] = fromHalf(data[src + 4] | (data[src + 5] << 8));
        }
        offset += count * 6;
    }
    else {
        requireBytes(data, offset, count * 9, 'Spark SPZ centers');
        const fixed = 1 << header.fractionalBits;
        for (let i = 0; i < count; i++) {
            const src = offset + i * 9;
            positions[i * 3] = readI24LE(data, src) / fixed;
            positions[i * 3 + 1] = readI24LE(data, src + 3) / fixed;
            positions[i * 3 + 2] = readI24LE(data, src + 6) / fixed;
        }
        offset += count * 9;
    }
    requireBytes(data, offset, count, 'Spark SPZ opacities');
    const opacityScale = (header.flags & SPARK_SPZ_LOD_FLAG) !== 0 ? 2 : 1;
    for (let i = 0; i < count; i++)
        opacities[i] = (data[offset + i] / 255) * opacityScale;
    offset += count;
    requireBytes(data, offset, count * 3, 'Spark SPZ RGB');
    const rgbScale = SH_C0 / 0.15;
    for (let i = 0; i < count; i++) {
        const src = offset + i * 3;
        const r = (data[src] / 255 - 0.5) * rgbScale + 0.5;
        const g = (data[src + 1] / 255 - 0.5) * rgbScale + 0.5;
        const b = (data[src + 2] / 255 - 0.5) * rgbScale + 0.5;
        sh0[i * 3] = (r - 0.5) / SH_C0;
        sh0[i * 3 + 1] = (g - 0.5) / SH_C0;
        sh0[i * 3 + 2] = (b - 0.5) / SH_C0;
    }
    offset += count * 3;
    requireBytes(data, offset, count * 3, 'Spark SPZ scales');
    for (let i = 0; i < count; i++) {
        const src = offset + i * 3;
        scales[i * 3] = Math.exp(data[src] / 16 - 10);
        scales[i * 3 + 1] = Math.exp(data[src + 1] / 16 - 10);
        scales[i * 3 + 2] = Math.exp(data[src + 2] / 16 - 10);
    }
    offset += count * 3;
    const quatBytes = header.version === 3 ? 4 : 3;
    requireBytes(data, offset, count * quatBytes, 'Spark SPZ rotations');
    for (let i = 0; i < count; i++) {
        const src = offset + i * quatBytes;
        let x, y, z, w;
        if (header.version === 3) {
            [x, y, z, w] = decodeSparkSPZQuaternion32(data[src] | (data[src + 1] << 8) | (data[src + 2] << 16) | (data[src + 3] << 24));
        }
        else {
            x = data[src] / 127.5 - 1;
            y = data[src + 1] / 127.5 - 1;
            z = data[src + 2] / 127.5 - 1;
            w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
        }
        rotations[i * 4] = w;
        rotations[i * 4 + 1] = x;
        rotations[i * 4 + 2] = y;
        rotations[i * 4 + 3] = z;
    }
    offset += count * quatBytes;
    if (shN && shComponents > 0) {
        requireBytes(data, offset, count * shComponents, 'Spark SPZ SH');
        for (let i = 0; i < count; i++) {
            const src = offset + i * shComponents;
            const dst = i * shComponents;
            for (let j = 0; j < shComponents; j++)
                shN[dst + j] = (data[src + j] - 128) / 128;
        }
        offset += count * shComponents;
    }
    const metadata = {
        format: 'spz',
        provider: 'spark',
        version: header.version,
        fractionalBits: header.fractionalBits,
        flags: header.flags,
    };
    if ((header.flags & SPARK_SPZ_LOD_FLAG) !== 0) {
        requireBytes(data, offset, count * 6, 'Spark SPZ LOD extension');
        metadata.sparkSpz = {
            childCount: readU16Section(data, offset, count),
            childStart: readU32Section(data, offset + count * 2, count),
        };
    }
    return { count, positions, scales, rotations, opacities, sh0, shN, shDegree, metadata };
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
function readI24LE(data, offset) {
    let value = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
    if (value & 0x800000)
        value |= 0xff000000;
    return value;
}
function decodeSparkSPZQuaternion32(packed) {
    const largestIndex = packed >>> 30;
    let remaining = packed;
    const valueMask = (1 << 9) - 1;
    const maxValue = Math.SQRT1_2;
    const q = [0, 0, 0, 0];
    let sumSquares = 0;
    for (let j = 3; j >= 0; j--) {
        if (j === largestIndex)
            continue;
        const value = remaining & valueMask;
        const sign = (remaining >>> 9) & 1;
        remaining >>>= 10;
        const component = maxValue * (value / valueMask) * (sign ? -1 : 1);
        q[j] = component;
        sumSquares += component * component;
    }
    q[largestIndex] = Math.sqrt(Math.max(0, 1 - sumSquares));
    return [q[0], q[1], q[2], q[3]];
}
function readU16Section(data, offset, count) {
    const view = new DataView(data.buffer, data.byteOffset + offset, count * 2);
    const out = new Uint16Array(count);
    for (let i = 0; i < count; i++)
        out[i] = view.getUint16(i * 2, true);
    return out;
}
function readU32Section(data, offset, count) {
    const view = new DataView(data.buffer, data.byteOffset + offset, count * 4);
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++)
        out[i] = view.getUint32(i * 4, true);
    return out;
}
function requireBytes(data, offset, length, label) {
    if (offset + length > data.byteLength) {
        throw new Error(`Incomplete ${label}: expected ${length} bytes at ${offset}, got ${data.byteLength - offset}`);
    }
}
