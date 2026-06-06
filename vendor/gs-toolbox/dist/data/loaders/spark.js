import pako from 'pako';
import { fromHalf } from '../../codecs';
import { SH_C0 } from '../transforms';
// Spark RAD and packed-splat mappings follow sparkjsdev/spark. See THIRD_PARTY_NOTICES.md.
const RAD_MAGIC = 0x30444152; // "RAD0", little-endian
const RAD_CHUNK_MAGIC = 0x43444152; // "RADC", little-endian
const DEFAULT_RGB_MIN = 0;
const DEFAULT_RGB_MAX = 1;
const DEFAULT_LN_SCALE_MIN = -12;
const DEFAULT_LN_SCALE_MAX = 9;
/** Load Spark RAD or RADC data into this repository's GaussianCloud representation. */
export async function loadSparkRAD(source) {
    if (typeof source === 'string') {
        const response = await fetch(source);
        if (!response.ok)
            throw new Error(`Failed to fetch Spark RAD: ${response.statusText}`);
        return loadSparkRADFromBuffer(await response.arrayBuffer(), source);
    }
    const buffer = source instanceof File ? await source.arrayBuffer() : source;
    return loadSparkRADFromBuffer(buffer);
}
/** Decode a complete Spark RAD file or a single RADC chunk from an ArrayBuffer. */
export async function loadSparkRADFromBuffer(buffer, baseUrl) {
    const bytes = new Uint8Array(buffer);
    const magic = readUint32LE(bytes, 0);
    if (magic === RAD_CHUNK_MAGIC) {
        const chunk = parseRADChunkHeader(bytes);
        const state = createRADDecodeState(chunk.meta.count, Math.min(3, chunk.meta.maxSh ?? 0), {
            format: 'radc',
            provider: 'spark',
            version: chunk.meta.version,
            maxSh: chunk.meta.maxSh ?? 0,
            hasLODTree: !!chunk.meta.lodTree,
        });
        decodeRADChunkInto(bytes, state, 0);
        finalizeRADState(state);
        return state.cloud;
    }
    const { meta, chunksStart } = parseRADHeader(bytes);
    validateRADMeta(meta);
    const shDegree = Math.min(3, meta.maxSh ?? 0);
    const state = createRADDecodeState(meta.count, shDegree, {
        format: 'rad',
        provider: 'spark',
        version: meta.version,
        count: meta.count,
        chunkCount: meta.chunks.length,
        maxSh: meta.maxSh ?? 0,
        hasLODTree: !!meta.lodTree,
        allChunkBytes: meta.allChunkBytes,
        shCodeCount: meta.shCodeCount,
    });
    for (let chunkIndex = 0; chunkIndex < meta.chunks.length; chunkIndex++) {
        const range = meta.chunks[chunkIndex];
        const chunkBytes = range.filename
            ? await fetchExternalRADChunk(range.filename, baseUrl)
            : sliceInlineRADChunk(bytes, chunksStart, range, chunkIndex);
        decodeRADChunkInto(chunkBytes, state);
    }
    finalizeRADState(state);
    return state.cloud;
}
/** Parse a Spark RAD file header from the beginning of a byte buffer. */
export function parseRADHeader(bytes) {
    if (bytes.byteLength < 8)
        throw new Error('Incomplete Spark RAD header');
    const magic = readUint32LE(bytes, 0);
    if (magic !== RAD_MAGIC) {
        throw new Error(`Invalid Spark RAD magic: 0x${magic.toString(16).padStart(8, '0')}`);
    }
    const jsonLength = readUint32LE(bytes, 4);
    if (bytes.byteLength < 8 + jsonLength)
        throw new Error('Incomplete Spark RAD metadata');
    const meta = parseJSONBytes(bytes.subarray(8, 8 + jsonLength), 'Spark RAD metadata');
    return { meta, chunksStart: 8 + roundup8(jsonLength) };
}
/** Parse a Spark RADC chunk header from the beginning of a byte buffer. */
export function parseRADChunkHeader(bytes) {
    if (bytes.byteLength < 16)
        throw new Error('Incomplete Spark RADC header');
    const magic = readUint32LE(bytes, 0);
    if (magic !== RAD_CHUNK_MAGIC) {
        throw new Error(`Invalid Spark RADC magic: 0x${magic.toString(16).padStart(8, '0')}`);
    }
    const jsonLength = readUint32LE(bytes, 4);
    const metaEnd = 8 + roundup8(jsonLength);
    if (bytes.byteLength < metaEnd + 8)
        throw new Error('Incomplete Spark RADC metadata');
    const meta = parseJSONBytes(bytes.subarray(8, 8 + jsonLength), 'Spark RADC metadata');
    const payloadBytes = readUint64LEAsNumber(bytes, metaEnd);
    const payloadStart = metaEnd + 8;
    const payloadEnd = payloadStart + payloadBytes;
    if (bytes.byteLength < payloadEnd)
        throw new Error('Incomplete Spark RADC payload');
    return { meta: { ...meta, payloadBytes }, payloadStart, payloadEnd };
}
export function sparkPackedResultToCloud(result, sparkOrChunkIndex, maybeChunkIndex = 0) {
    const chunkIndex = typeof sparkOrChunkIndex === 'number' ? sparkOrChunkIndex : maybeChunkIndex;
    const count = result.numSplats;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const sh0 = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const splat = unpackSparkPackedSplat(result.packedArray, i, result.splatEncoding);
        positions[i * 3] = splat.center[0];
        positions[i * 3 + 1] = splat.center[1];
        positions[i * 3 + 2] = splat.center[2];
        scales[i * 3] = splat.scales[0];
        scales[i * 3 + 1] = splat.scales[1];
        scales[i * 3 + 2] = splat.scales[2];
        rotations[i * 4] = splat.quaternion[3];
        rotations[i * 4 + 1] = splat.quaternion[0];
        rotations[i * 4 + 2] = splat.quaternion[1];
        rotations[i * 4 + 3] = splat.quaternion[2];
        sh0[i * 3] = (splat.color[0] - 0.5) / SH_C0;
        sh0[i * 3 + 1] = (splat.color[1] - 0.5) / SH_C0;
        sh0[i * 3 + 2] = (splat.color[2] - 0.5) / SH_C0;
        opacities[i] = splat.opacity;
    }
    return {
        count,
        positions,
        scales,
        rotations,
        sh0,
        opacities,
        shDegree: 0,
        metadata: {
            format: 'rad',
            provider: 'spark',
            chunkIndex,
        },
    };
}
/** Unpack Spark's 4-word PackedSplat layout without importing Spark or Three.js. */
export function unpackSparkPackedSplat(packedSplats, index, encoding) {
    const i4 = index * 4;
    if (i4 + 3 >= packedSplats.length) {
        throw new Error(`Packed splat index out of range: ${index}`);
    }
    const word0 = packedSplats[i4];
    const word1 = packedSplats[i4 + 1];
    const word2 = packedSplats[i4 + 2];
    const word3 = packedSplats[i4 + 3];
    const rgbMin = encoding?.rgbMin ?? DEFAULT_RGB_MIN;
    const rgbMax = encoding?.rgbMax ?? DEFAULT_RGB_MAX;
    const rgbRange = rgbMax - rgbMin;
    const color = [
        rgbMin + ((word0 & 0xff) / 255) * rgbRange,
        rgbMin + (((word0 >>> 8) & 0xff) / 255) * rgbRange,
        rgbMin + (((word0 >>> 16) & 0xff) / 255) * rgbRange,
    ];
    const opacityScale = encoding?.lodOpacity ? 2 : 1;
    const opacity = (((word0 >>> 24) & 0xff) / 255) * opacityScale;
    const center = [
        fromHalf(word1 & 0xffff),
        fromHalf((word1 >>> 16) & 0xffff),
        fromHalf(word2 & 0xffff),
    ];
    const lnScaleMin = encoding?.lnScaleMin ?? DEFAULT_LN_SCALE_MIN;
    const lnScaleMax = encoding?.lnScaleMax ?? DEFAULT_LN_SCALE_MAX;
    const scales = [
        decodeScale8(word3 & 0xff, lnScaleMin, lnScaleMax),
        decodeScale8((word3 >>> 8) & 0xff, lnScaleMin, lnScaleMax),
        decodeScale8((word3 >>> 16) & 0xff, lnScaleMin, lnScaleMax),
    ];
    const encodedQuat = ((word2 >>> 16) & 0xffff) | ((word3 >>> 8) & 0xff0000);
    const quaternion = decodeQuatOct88R8(encodedQuat);
    return { center, scales, quaternion, color, opacity };
}
function decodeRADChunkInto(bytes, state, baseOverride) {
    const { meta, payloadStart, payloadEnd } = parseRADChunkHeader(bytes);
    validateRADChunkMeta(meta);
    const base = baseOverride ?? meta.base;
    const count = meta.count;
    if (base < 0 || base + count > state.cloud.count) {
        throw new Error(`Spark RADC chunk range ${base}+${count} exceeds cloud count ${state.cloud.count}`);
    }
    const payload = bytes.subarray(payloadStart, payloadEnd);
    for (const prop of meta.properties) {
        validateRADProperty(prop, payload.byteLength);
        const encoded = payload.subarray(prop.offset, prop.offset + prop.bytes);
        const data = decompressRADProperty(encoded, prop);
        decodeRADProperty(prop, data, state, base, count);
    }
}
function decodeRADProperty(prop, data, state, base, count) {
    switch (prop.property) {
        case 'center':
            writeVec3(state.cloud.positions, base, count, decodeFloatProperty(prop, data, 3, count, ['f32', 'f16', 'f32_lebytes', 'f16_lebytes']));
            break;
        case 'alpha':
            writeScalar(state.cloud.opacities, base, count, decodeFloatProperty(prop, data, 1, count, ['f32', 'f16', 'r8']));
            break;
        case 'rgb':
            writeRGBToSH0(state.cloud.sh0, base, count, decodeFloatProperty(prop, data, 3, count, ['f32', 'f16', 'r8', 'r8_delta']));
            break;
        case 'scales':
            writeVec3(state.cloud.scales, base, count, decodeFloatProperty(prop, data, 3, count, ['f32', 'ln_f16', 'ln_0r8']));
            break;
        case 'orientation':
            writeRotations(state.cloud.rotations, base, count, decodeOrientationProperty(prop, data, count));
            break;
        case 'sh1':
            writeSHBand(state, base, count, 0, 9, decodeSHProperty(prop, data, 9, count));
            break;
        case 'sh2':
            writeSHBand(state, base, count, 9, 15, decodeSHProperty(prop, data, 15, count));
            break;
        case 'sh3':
            writeSHBand(state, base, count, 24, 21, decodeSHProperty(prop, data, 21, count));
            break;
        case 'sh1_code':
            state.shCodebooks.sh1 = decodeSHProperty(prop, data, 9, inferFloatPropertyCount(prop, data, 9));
            break;
        case 'sh2_code':
            state.shCodebooks.sh2 = decodeSHProperty(prop, data, 15, inferFloatPropertyCount(prop, data, 15));
            break;
        case 'sh3_code':
            state.shCodebooks.sh3 = decodeSHProperty(prop, data, 21, inferFloatPropertyCount(prop, data, 21));
            break;
        case 'sh_label':
            state.shLabels = ensureU32Array(state.shLabels, state.cloud.count);
            state.shLabels.set(decodeIntegerProperty(prop, data, 1, count), base);
            break;
        case 'child_count':
            state.childCount = ensureU16Array(state.childCount, state.cloud.count);
            state.childCount.set(decodeU16(data, 1, count), base);
            break;
        case 'child_start':
            state.childStart = ensureU32Array(state.childStart, state.cloud.count);
            state.childStart.set(decodeIntegerProperty(prop, data, 1, count), base);
            break;
        default:
            throw new Error(`Unsupported Spark RAD property: ${prop.property}`);
    }
}
function createRADDecodeState(count, shDegree, metadata) {
    const rotations = new Float32Array(count * 4);
    for (let i = 0; i < count; i++)
        rotations[i * 4] = 1;
    const numSH = shDegree > 0 ? (shDegree + 1) * (shDegree + 1) - 1 : 0;
    const cloud = {
        count,
        positions: new Float32Array(count * 3),
        scales: new Float32Array(count * 3),
        rotations,
        opacities: new Float32Array(count),
        sh0: new Float32Array(count * 3),
        shN: numSH > 0 ? new Float32Array(count * numSH * 3) : undefined,
        shDegree,
        metadata,
    };
    return { cloud, shDegree, shCodebooks: {} };
}
function finalizeRADState(state) {
    if (state.cloud.shN && state.shLabels) {
        expandSHCodebook(state, 'sh1', 0, 9);
        expandSHCodebook(state, 'sh2', 9, 15);
        expandSHCodebook(state, 'sh3', 24, 21);
    }
    if (state.childCount || state.childStart || state.shLabels) {
        state.cloud.metadata = {
            ...state.cloud.metadata,
            sparkRad: {
                childCount: state.childCount,
                childStart: state.childStart,
                shLabels: state.shLabels,
            },
        };
    }
}
function expandSHCodebook(state, key, shOffset, elements) {
    const codebook = state.shCodebooks[key];
    if (!state.cloud.shN || !state.shLabels || !codebook)
        return;
    const stride = (((state.shDegree + 1) * (state.shDegree + 1)) - 1) * 3;
    if (shOffset + elements > stride)
        return;
    const codes = Math.floor(codebook.length / elements);
    for (let i = 0; i < state.cloud.count; i++) {
        const label = state.shLabels[i];
        if (label >= codes)
            continue;
        const src = label * elements;
        const dst = i * stride + shOffset;
        state.cloud.shN.set(codebook.subarray(src, src + elements), dst);
    }
}
function decodeFloatProperty(prop, data, dims, count, allowed) {
    if (!allowed.includes(prop.encoding)) {
        throw new Error(`Unsupported Spark RAD ${prop.property} encoding: ${prop.encoding}`);
    }
    switch (prop.encoding) {
        case 'f32': return decodeF32(data, dims, count);
        case 'f16': return decodeF16(data, dims, count);
        case 'f32_lebytes': return decodeF32LeBytes(data, dims, count);
        case 'f16_lebytes': return decodeF16LeBytes(data, dims, count);
        case 'r8': return decodeR8(data, dims, count, requiredNumber(prop.min, prop, 'min'), requiredNumber(prop.max, prop, 'max'));
        case 'r8_delta': return decodeR8Delta(data, dims, count, requiredNumber(prop.min, prop, 'min'), requiredNumber(prop.max, prop, 'max'));
        case 'ln_0r8': return decodeLn0R8(data, dims, count, requiredNumber(prop.min, prop, 'min'), requiredNumber(prop.max, prop, 'max'));
        case 'ln_f16': return decodeLnF16(data, dims, count);
        default:
            throw new Error(`Unsupported Spark RAD ${prop.property} encoding: ${prop.encoding}`);
    }
}
function decodeSHProperty(prop, data, elements, count) {
    switch (prop.encoding) {
        case 'f32': return decodeF32(data, elements, count);
        case 'f16': return decodeF16(data, elements, count);
        case 'r8': return decodeR8(data, elements, count, requiredNumber(prop.min, prop, 'min'), requiredNumber(prop.max, prop, 'max'));
        case 'r8_delta': return decodeR8Delta(data, elements, count, requiredNumber(prop.min, prop, 'min'), requiredNumber(prop.max, prop, 'max'));
        case 's8': return decodeS8(data, elements, count, requiredNumber(prop.max, prop, 'max'));
        case 's8_delta': return decodeS8Delta(data, elements, count, requiredNumber(prop.max, prop, 'max'));
        default:
            throw new Error(`Unsupported Spark RAD ${prop.property} encoding: ${prop.encoding}`);
    }
}
function decodeOrientationProperty(prop, data, count) {
    if (prop.encoding === 'oct88r8')
        return decodeQuatOct88R8Data(data, count);
    const xyz = decodeFloatProperty(prop, data, 3, count, ['f32', 'f16']);
    const out = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
        const x = xyz[i * 3];
        const y = xyz[i * 3 + 1];
        const z = xyz[i * 3 + 2];
        const w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
        out[i * 4] = x;
        out[i * 4 + 1] = y;
        out[i * 4 + 2] = z;
        out[i * 4 + 3] = w;
    }
    return out;
}
function decodeIntegerProperty(prop, data, dims, count) {
    switch (prop.encoding) {
        case 'u16': return u16ToU32(decodeU16(data, dims, count));
        case 'u32': return decodeU32(data, dims, count);
        default:
            throw new Error(`Unsupported Spark RAD ${prop.property} encoding: ${prop.encoding}`);
    }
}
function inferFloatPropertyCount(prop, data, elements) {
    const bytesPerElement = prop.encoding === 'f32' ? 4 :
        prop.encoding === 'f16' ? 2 :
            (prop.encoding === 'r8' || prop.encoding === 'r8_delta' || prop.encoding === 's8' || prop.encoding === 's8_delta') ? 1 :
                0;
    if (bytesPerElement === 0) {
        throw new Error(`Cannot infer Spark RAD ${prop.property} count for ${prop.encoding}`);
    }
    return Math.floor(data.byteLength / (bytesPerElement * elements));
}
function writeVec3(target, base, count, values) {
    for (let i = 0; i < count; i++) {
        target[(base + i) * 3] = values[i * 3];
        target[(base + i) * 3 + 1] = values[i * 3 + 1];
        target[(base + i) * 3 + 2] = values[i * 3 + 2];
    }
}
function writeScalar(target, base, count, values) {
    target.set(values.subarray(0, count), base);
}
function writeRGBToSH0(target, base, count, values) {
    for (let i = 0; i < count; i++) {
        target[(base + i) * 3] = (values[i * 3] - 0.5) / SH_C0;
        target[(base + i) * 3 + 1] = (values[i * 3 + 1] - 0.5) / SH_C0;
        target[(base + i) * 3 + 2] = (values[i * 3 + 2] - 0.5) / SH_C0;
    }
}
function writeRotations(target, base, count, xyzw) {
    for (let i = 0; i < count; i++) {
        target[(base + i) * 4] = xyzw[i * 4 + 3];
        target[(base + i) * 4 + 1] = xyzw[i * 4];
        target[(base + i) * 4 + 2] = xyzw[i * 4 + 1];
        target[(base + i) * 4 + 3] = xyzw[i * 4 + 2];
    }
}
function writeSHBand(state, base, count, shOffset, elements, values) {
    if (!state.cloud.shN)
        return;
    const stride = (((state.shDegree + 1) * (state.shDegree + 1)) - 1) * 3;
    if (shOffset + elements > stride)
        return;
    for (let i = 0; i < count; i++) {
        const dst = (base + i) * stride + shOffset;
        state.cloud.shN.set(values.subarray(i * elements, i * elements + elements), dst);
    }
}
function decodeF32(data, dims, count) {
    assertByteLength(data, dims * count * 4, 'f32');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const out = new Float32Array(dims * count);
    for (let i = 0; i < count; i++) {
        let byteIndex = i * 4;
        for (let d = 0; d < dims; d++) {
            out[i * dims + d] = view.getFloat32(byteIndex, true);
            byteIndex += count * 4;
        }
    }
    return out;
}
function decodeF16(data, dims, count) {
    assertByteLength(data, dims * count * 2, 'f16');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const out = new Float32Array(dims * count);
    for (let i = 0; i < count; i++) {
        let byteIndex = i * 2;
        for (let d = 0; d < dims; d++) {
            out[i * dims + d] = fromHalf(view.getUint16(byteIndex, true));
            byteIndex += count * 2;
        }
    }
    return out;
}
function decodeF32LeBytes(data, dims, count) {
    assertByteLength(data, dims * count * 4, 'f32_lebytes');
    const stride = count * dims;
    const tmp = new Uint8Array(4);
    const view = new DataView(tmp.buffer);
    const out = new Float32Array(dims * count);
    for (let i = 0; i < count; i++) {
        for (let d = 0; d < dims; d++) {
            const index = count * d + i;
            for (let b = 0; b < 4; b++)
                tmp[b] = data[index + stride * b];
            out[i * dims + d] = view.getFloat32(0, true);
        }
    }
    return out;
}
function decodeF16LeBytes(data, dims, count) {
    assertByteLength(data, dims * count * 2, 'f16_lebytes');
    const stride = count * dims;
    const out = new Float32Array(dims * count);
    for (let i = 0; i < count; i++) {
        for (let d = 0; d < dims; d++) {
            const index = count * d + i;
            out[i * dims + d] = fromHalf(data[index] | (data[index + stride] << 8));
        }
    }
    return out;
}
function decodeR8(data, dims, count, min, max) {
    assertByteLength(data, dims * count, 'r8');
    const out = new Float32Array(dims * count);
    for (let i = 0; i < count; i++) {
        let index = i;
        for (let d = 0; d < dims; d++) {
            out[i * dims + d] = min + (data[index] / 255) * (max - min);
            index += count;
        }
    }
    return out;
}
function decodeR8Delta(data, dims, count, min, max) {
    assertByteLength(data, dims * count, 'r8_delta');
    const out = new Float32Array(dims * count);
    const last = new Uint8Array(dims);
    for (let i = 0; i < count; i++) {
        let index = i;
        for (let d = 0; d < dims; d++) {
            const value = (last[d] + data[index]) & 0xff;
            last[d] = value;
            out[i * dims + d] = min + (value / 255) * (max - min);
            index += count;
        }
    }
    return out;
}
function decodeS8(data, dims, count, max) {
    assertByteLength(data, dims * count, 's8');
    const out = new Float32Array(dims * count);
    for (let i = 0; i < count; i++) {
        let index = i;
        for (let d = 0; d < dims; d++) {
            out[i * dims + d] = signedByte(data[index]) / 127 * max;
            index += count;
        }
    }
    return out;
}
function decodeS8Delta(data, dims, count, max) {
    assertByteLength(data, dims * count, 's8_delta');
    const out = new Float32Array(dims * count);
    const last = new Uint8Array(dims);
    for (let i = 0; i < count; i++) {
        let index = i;
        for (let d = 0; d < dims; d++) {
            const value = (last[d] + data[index]) & 0xff;
            last[d] = value;
            out[i * dims + d] = signedByte(value) / 127 * max;
            index += count;
        }
    }
    return out;
}
function decodeLn0R8(data, dims, count, min, max) {
    assertByteLength(data, dims * count, 'ln_0r8');
    const out = new Float32Array(dims * count);
    for (let i = 0; i < count; i++) {
        let index = i;
        for (let d = 0; d < dims; d++) {
            out[i * dims + d] = decodeScale8(data[index], min, max);
            index += count;
        }
    }
    return out;
}
function decodeLnF16(data, dims, count) {
    assertByteLength(data, dims * count * 2, 'ln_f16');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const out = new Float32Array(dims * count);
    for (let i = 0; i < count; i++) {
        let byteIndex = i * 2;
        for (let d = 0; d < dims; d++) {
            out[i * dims + d] = Math.exp(fromHalf(view.getUint16(byteIndex, true)));
            byteIndex += count * 2;
        }
    }
    return out;
}
function decodeU16(data, dims, count) {
    assertByteLength(data, dims * count * 2, 'u16');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const out = new Uint16Array(dims * count);
    for (let i = 0; i < count; i++) {
        let byteIndex = i * 2;
        for (let d = 0; d < dims; d++) {
            out[i * dims + d] = view.getUint16(byteIndex, true);
            byteIndex += count * 2;
        }
    }
    return out;
}
function decodeU32(data, dims, count) {
    assertByteLength(data, dims * count * 4, 'u32');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const out = new Uint32Array(dims * count);
    for (let i = 0; i < count; i++) {
        let byteIndex = i * 4;
        for (let d = 0; d < dims; d++) {
            out[i * dims + d] = view.getUint32(byteIndex, true);
            byteIndex += count * 4;
        }
    }
    return out;
}
function decodeQuatOct88R8Data(data, count) {
    assertByteLength(data, count * 3, 'oct88r8');
    const out = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
        const [x, y, z, w] = decodeQuatOct888Bytes(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
        out[i * 4] = x;
        out[i * 4 + 1] = y;
        out[i * 4 + 2] = z;
        out[i * 4 + 3] = w;
    }
    return out;
}
function decodeQuatOct88R8(encoded) {
    return decodeQuatOct888Bytes(encoded & 0xff, (encoded >>> 8) & 0xff, (encoded >>> 16) & 0xff);
}
function decodeQuatOct888Bytes(u, v, r) {
    let x = u / 255 * 2 - 1;
    let y = v / 255 * 2 - 1;
    const z = 1 - Math.abs(x) - Math.abs(y);
    const t = Math.max(-z, 0);
    x = x >= 0 ? x - t : x + t;
    y = y >= 0 ? y - t : y + t;
    const length = Math.sqrt(x * x + y * y + z * z);
    const inv = length > 1e-20 ? 1 / length : 0;
    const halfTheta = r / 255 * 0.5 * Math.PI;
    const s = Math.sin(halfTheta);
    const w = Math.cos(halfTheta);
    return [x * inv * s, y * inv * s, z * inv * s, w];
}
function decodeScale8(scale, lnScaleMin, lnScaleMax) {
    if (scale === 0)
        return 0;
    const lnScaleScale = (lnScaleMax - lnScaleMin) / 254;
    return Math.exp(lnScaleMin + (scale - 1) * lnScaleScale);
}
function decompressRADProperty(data, prop) {
    if (!prop.compression)
        return data;
    if (prop.compression !== 'gz') {
        throw new Error(`Unsupported Spark RAD compression: ${prop.compression}`);
    }
    try {
        return pako.inflate(data);
    }
    catch {
        try {
            return pako.inflateRaw(data);
        }
        catch {
            throw new Error(`Failed to decompress Spark RAD ${prop.property} property`);
        }
    }
}
function sliceInlineRADChunk(bytes, chunksStart, range, chunkIndex) {
    const offset = chunksStart + range.offset;
    const end = offset + range.bytes;
    if (offset < chunksStart || end > bytes.byteLength) {
        throw new Error(`Invalid Spark RAD chunk ${chunkIndex} byte range`);
    }
    return bytes.subarray(offset, end);
}
async function fetchExternalRADChunk(filename, baseUrl) {
    if (!baseUrl)
        throw new Error(`Spark RAD external chunk "${filename}" requires a base URL`);
    const url = new URL(filename, baseUrl).toString();
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`Failed to fetch Spark RAD chunk: ${response.statusText}`);
    return new Uint8Array(await response.arrayBuffer());
}
function validateRADMeta(meta) {
    if (meta.version !== 1)
        throw new Error(`Unsupported Spark RAD version: ${meta.version}`);
    if (meta.type !== 'gsplat')
        throw new Error(`Unsupported Spark RAD type: ${meta.type}`);
    if (!Number.isInteger(meta.count) || meta.count < 0)
        throw new Error('Invalid Spark RAD count');
    if (!Array.isArray(meta.chunks))
        throw new Error('Spark RAD metadata missing chunks');
    if (meta.chunkSize && meta.chunks.length !== Math.ceil(meta.count / meta.chunkSize)) {
        throw new Error(`Invalid Spark RAD chunk count: expected ${Math.ceil(meta.count / meta.chunkSize)}, got ${meta.chunks.length}`);
    }
}
function validateRADChunkMeta(meta) {
    if (meta.version !== 1)
        throw new Error(`Unsupported Spark RADC version: ${meta.version}`);
    if (!Number.isInteger(meta.base) || meta.base < 0)
        throw new Error('Invalid Spark RADC base');
    if (!Number.isInteger(meta.count) || meta.count < 0)
        throw new Error('Invalid Spark RADC count');
    if (!Array.isArray(meta.properties))
        throw new Error('Spark RADC metadata missing properties');
}
function validateRADProperty(prop, payloadLength) {
    if (!Number.isInteger(prop.offset) || !Number.isInteger(prop.bytes) || prop.offset < 0 || prop.bytes < 0) {
        throw new Error(`Invalid Spark RAD property range for ${prop.property}`);
    }
    if (prop.offset + prop.bytes > payloadLength) {
        throw new Error(`Spark RAD property ${prop.property} exceeds payload`);
    }
}
function parseJSONBytes(bytes, label) {
    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    }
    catch (error) {
        throw new Error(`Invalid ${label}: ${error.message}`);
    }
}
function readUint32LE(bytes, offset) {
    if (offset + 4 > bytes.byteLength)
        throw new Error('Unexpected EOF while reading u32');
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}
function readUint64LEAsNumber(bytes, offset) {
    if (offset + 8 > bytes.byteLength)
        throw new Error('Unexpected EOF while reading u64');
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const value = view.getBigUint64(0, true);
    if (value > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('Spark RAD byte length exceeds safe integer range');
    return Number(value);
}
function roundup8(size) {
    return (size + 7) & ~7;
}
function assertByteLength(data, expected, encoding) {
    if (data.byteLength < expected) {
        throw new Error(`Incomplete Spark RAD ${encoding} data: expected ${expected} bytes, got ${data.byteLength}`);
    }
}
function requiredNumber(value, prop, field) {
    if (typeof value !== 'number') {
        throw new Error(`Spark RAD ${prop.property} ${prop.encoding} property missing ${field}`);
    }
    return value;
}
function signedByte(value) {
    return (value << 24) >> 24;
}
function ensureU16Array(value, count) {
    return value && value.length >= count ? value : new Uint16Array(count);
}
function ensureU32Array(value, count) {
    return value && value.length >= count ? value : new Uint32Array(count);
}
function u16ToU32(values) {
    const out = new Uint32Array(values.length);
    out.set(values);
    return out;
}
