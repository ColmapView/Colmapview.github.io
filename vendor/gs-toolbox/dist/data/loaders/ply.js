// Standard + Compressed PLY loader
import { PLY_TYPE_SIZES } from '../../types';
import { sigmoid, SH_C0, normalizeQuaternions } from '../transforms';
import { unpack111011, unpack8888, unpackRot2_10_10_10, decodeCompressedSH, } from '../../codecs';
// --- Header parsing ---
/** Parse a PLY header from text. Handles both standard and compressed formats. */
export function parsePLYHeader(buffer) {
    const decoder = new TextDecoder();
    const text = decoder.decode(new Uint8Array(buffer, 0, Math.min(8192, buffer.byteLength)));
    const lines = text.split('\n');
    let format = 'binary_little_endian';
    let vertexCount = 0;
    let chunkCount = 0;
    let headerLength = 0;
    let currentElement = null;
    const properties = [];
    const chunkProperties = [];
    let vertexOffset = 0;
    let chunkOffset = 0;
    for (const line of lines) {
        headerLength += line.length + 1;
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'format') {
            format = parts[1];
        }
        else if (parts[0] === 'element') {
            if (parts[1] === 'vertex') {
                vertexCount = parseInt(parts[2], 10);
                currentElement = 'vertex';
            }
            else if (parts[1] === 'chunk') {
                chunkCount = parseInt(parts[2], 10);
                currentElement = 'chunk';
            }
            else {
                currentElement = null;
            }
        }
        else if (parts[0] === 'property' && currentElement) {
            const type = parts[1];
            const name = parts[2];
            const size = PLY_TYPE_SIZES[type] || 4;
            if (currentElement === 'vertex') {
                properties.push({ name, type, offset: vertexOffset, size });
                vertexOffset += size;
            }
            else if (currentElement === 'chunk') {
                chunkProperties.push({ name, type, offset: chunkOffset, size });
                chunkOffset += size;
            }
        }
        else if (parts[0] === 'end_header') {
            break;
        }
    }
    return {
        format,
        vertexCount,
        properties,
        headerLength,
        chunkCount,
        chunkProperties,
        rowVertexLength: vertexOffset,
        rowChunkLength: chunkOffset,
    };
}
/** Check if a PLY has compressed chunk-based format */
export function isCompressedPLY(header) {
    return header.chunkCount > 0 && header.chunkProperties.length > 0;
}
// --- Chunk reading ---
/** Read compressed PLY chunks from buffer */
export function readPLYChunks(buffer, header) {
    const dataView = new DataView(buffer, header.headerLength);
    const chunks = [];
    // Chunk property name mapping
    const chunkPropMap = new Map();
    for (const p of header.chunkProperties) {
        chunkPropMap.set(p.name, p);
    }
    for (let i = 0; i < header.chunkCount; i++) {
        const base = i * header.rowChunkLength;
        const readF = (name, fallback) => {
            const prop = chunkPropMap.get(name);
            if (!prop)
                return fallback;
            return dataView.getFloat32(base + prop.offset, true);
        };
        chunks.push({
            minX: readF('min_x', 0), minY: readF('min_y', 0), minZ: readF('min_z', 0),
            maxX: readF('max_x', 0), maxY: readF('max_y', 0), maxZ: readF('max_z', 0),
            minScaleX: readF('min_scale_x', 0), minScaleY: readF('min_scale_y', 0), minScaleZ: readF('min_scale_z', 0),
            maxScaleX: readF('max_scale_x', 0), maxScaleY: readF('max_scale_y', 0), maxScaleZ: readF('max_scale_z', 0),
            minColorR: readF('min_color_r', 0), minColorG: readF('min_color_g', 0), minColorB: readF('min_color_b', 0),
            maxColorR: readF('max_color_r', 1), maxColorG: readF('max_color_g', 1), maxColorB: readF('max_color_b', 1),
        });
    }
    return chunks;
}
// --- Standard PLY body ---
function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function readStandardPLYBody(buffer, header) {
    const { vertexCount, properties, headerLength } = header;
    const propMap = new Map();
    for (const p of properties)
        propMap.set(p.name, p);
    const stride = properties.reduce((sum, p) => sum + p.size, 0);
    const dataView = new DataView(buffer, headerLength);
    const positions = new Float32Array(vertexCount * 3);
    const scales = new Float32Array(vertexCount * 3);
    const rotations = new Float32Array(vertexCount * 4);
    const opacities = new Float32Array(vertexCount);
    const sh0 = new Float32Array(vertexCount * 3);
    // Determine SH degree
    let shDegree = 0;
    if (propMap.has('f_rest_0'))
        shDegree = 1;
    if (propMap.has('f_rest_9'))
        shDegree = 2;
    if (propMap.has('f_rest_24'))
        shDegree = 3;
    const shCoeffs = shDegree > 0 ? (shDegree + 1) ** 2 - 1 : 0;
    const shN = shCoeffs > 0 ? new Float32Array(vertexCount * shCoeffs * 3) : undefined;
    const readFloat = (offset, prop) => {
        if (!prop)
            return 0;
        const pos = offset + prop.offset;
        switch (prop.type) {
            case 'float':
            case 'float32': return dataView.getFloat32(pos, true);
            case 'double':
            case 'float64': return dataView.getFloat64(pos, true);
            default: return dataView.getFloat32(pos, true);
        }
    };
    const px = propMap.get('x'), py = propMap.get('y'), pz = propMap.get('z');
    const sx = propMap.get('scale_0'), sy = propMap.get('scale_1'), sz = propMap.get('scale_2');
    const rw = propMap.get('rot_0'), rx = propMap.get('rot_1');
    const ry = propMap.get('rot_2'), rz = propMap.get('rot_3');
    const opac = propMap.get('opacity');
    const dc0 = propMap.get('f_dc_0'), dc1 = propMap.get('f_dc_1'), dc2 = propMap.get('f_dc_2');
    for (let i = 0; i < vertexCount; i++) {
        const offset = i * stride;
        positions[i * 3] = readFloat(offset, px);
        positions[i * 3 + 1] = readFloat(offset, py);
        positions[i * 3 + 2] = readFloat(offset, pz);
        scales[i * 3] = Math.exp(readFloat(offset, sx));
        scales[i * 3 + 1] = Math.exp(readFloat(offset, sy));
        scales[i * 3 + 2] = Math.exp(readFloat(offset, sz));
        let qw = readFloat(offset, rw);
        let qx = readFloat(offset, rx);
        let qy = readFloat(offset, ry);
        let qz = readFloat(offset, rz);
        const qlen = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
        if (qlen > 0) {
            const inv = 1 / qlen;
            qw *= inv;
            qx *= inv;
            qy *= inv;
            qz *= inv;
        }
        rotations[i * 4] = qw;
        rotations[i * 4 + 1] = qx;
        rotations[i * 4 + 2] = qy;
        rotations[i * 4 + 3] = qz;
        opacities[i] = sigmoid(readFloat(offset, opac));
        sh0[i * 3] = readFloat(offset, dc0);
        sh0[i * 3 + 1] = readFloat(offset, dc1);
        sh0[i * 3 + 2] = readFloat(offset, dc2);
        if (shN) {
            for (let j = 0; j < shCoeffs; j++) {
                const rProp = propMap.get(`f_rest_${j}`);
                const gProp = propMap.get(`f_rest_${j + shCoeffs}`);
                const bProp = propMap.get(`f_rest_${j + shCoeffs * 2}`);
                shN[i * shCoeffs * 3 + j * 3] = readFloat(offset, rProp);
                shN[i * shCoeffs * 3 + j * 3 + 1] = readFloat(offset, gProp);
                shN[i * shCoeffs * 3 + j * 3 + 2] = readFloat(offset, bProp);
            }
        }
    }
    return { count: vertexCount, positions, scales, rotations, opacities, sh0, shN, shDegree };
}
// --- Compressed PLY body ---
export function readCompressedPLYBody(buffer, header, chunks) {
    const { vertexCount, properties, headerLength, rowChunkLength, rowVertexLength } = header;
    const count = vertexCount;
    const propMap = new Map();
    for (const p of properties)
        propMap.set(p.name, p);
    // Data starts after header + chunk data
    const chunkDataSize = header.chunkCount * rowChunkLength;
    const vertexDataOffset = headerLength + chunkDataSize;
    const dataView = new DataView(buffer);
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const opacities = new Float32Array(count);
    const sh0 = new Float32Array(count * 3);
    const packedPosProp = propMap.get('packed_position');
    const packedRotProp = propMap.get('packed_rotation');
    const packedScaleProp = propMap.get('packed_scale');
    const packedColorProp = propMap.get('packed_color');
    for (let i = 0; i < count; i++) {
        const chunkIdx = i >> 8; // 256 splats per chunk
        const chunk = chunks[Math.min(chunkIdx, chunks.length - 1)];
        const vertexBase = vertexDataOffset + i * rowVertexLength;
        // Position: unpack 11-10-11
        if (packedPosProp) {
            const packed = dataView.getUint32(vertexBase + packedPosProp.offset, true);
            const [px, py, pz] = unpack111011(packed);
            positions[i * 3] = lerp(chunk.minX, chunk.maxX, px);
            positions[i * 3 + 1] = lerp(chunk.minY, chunk.maxY, py);
            positions[i * 3 + 2] = lerp(chunk.minZ, chunk.maxZ, pz);
        }
        // Rotation: unpack 2-10-10-10 (normalized after loop)
        if (packedRotProp) {
            const packed = dataView.getUint32(vertexBase + packedRotProp.offset, true);
            const [w, x, y, z] = unpackRot2_10_10_10(packed);
            rotations[i * 4] = w;
            rotations[i * 4 + 1] = x;
            rotations[i * 4 + 2] = y;
            rotations[i * 4 + 3] = z;
        }
        // Scale: unpack 11-10-11, then lerp log-space, then exp
        if (packedScaleProp) {
            const packed = dataView.getUint32(vertexBase + packedScaleProp.offset, true);
            const [sx, sy, sz] = unpack111011(packed);
            scales[i * 3] = Math.exp(lerp(chunk.minScaleX, chunk.maxScaleX, sx));
            scales[i * 3 + 1] = Math.exp(lerp(chunk.minScaleY, chunk.maxScaleY, sy));
            scales[i * 3 + 2] = Math.exp(lerp(chunk.minScaleZ, chunk.maxScaleZ, sz));
        }
        // Color: unpack 8-8-8-8, lerp through chunk color bounds, → SH DC
        if (packedColorProp) {
            const packed = dataView.getUint32(vertexBase + packedColorProp.offset, true);
            const [cr, cg, cb, ca] = unpack8888(packed);
            const r = lerp(chunk.minColorR, chunk.maxColorR, cr);
            const g = lerp(chunk.minColorG, chunk.maxColorG, cg);
            const b = lerp(chunk.minColorB, chunk.maxColorB, cb);
            sh0[i * 3] = (r - 0.5) / SH_C0;
            sh0[i * 3 + 1] = (g - 0.5) / SH_C0;
            sh0[i * 3 + 2] = (b - 0.5) / SH_C0;
            opacities[i] = ca;
        }
    }
    // Compressed SH (optional) — decode uint8 f_rest_* properties to float
    let shDegree = 0;
    let shN;
    const restProps = properties.filter(p => p.name.startsWith('f_rest_'));
    const shCoeffs = Math.floor(restProps.length / 3);
    if (shCoeffs > 0) {
        if (shCoeffs >= 15)
            shDegree = 3;
        else if (shCoeffs >= 8)
            shDegree = 2;
        else
            shDegree = 1;
        shN = new Float32Array(count * shCoeffs * 3);
        for (let i = 0; i < count; i++) {
            const vertexBase = vertexDataOffset + i * rowVertexLength;
            // Channel-first -> interleaved reorder (same as standard PLY path).
            // PLY stores f_rest_0..N-1 as R coeffs, then G coeffs, then B coeffs.
            // We interleave to [coeff0_R, coeff0_G, coeff0_B, coeff1_R, ...].
            for (let j = 0; j < shCoeffs; j++) {
                const rProp = restProps[j];
                const gProp = restProps[j + shCoeffs];
                const bProp = restProps[j + shCoeffs * 2];
                shN[i * shCoeffs * 3 + j * 3] = decodeCompressedSH(dataView.getUint8(vertexBase + rProp.offset));
                shN[i * shCoeffs * 3 + j * 3 + 1] = decodeCompressedSH(dataView.getUint8(vertexBase + gProp.offset));
                shN[i * shCoeffs * 3 + j * 3 + 2] = decodeCompressedSH(dataView.getUint8(vertexBase + bProp.offset));
            }
        }
    }
    // Normalize compressed quaternions (quantization may leave them slightly off unit length)
    normalizeQuaternions(rotations);
    return { count, positions, scales, rotations, opacities, sh0, shN, shDegree };
}
// --- High-level loader ---
/** Load a PLY file (standard or compressed) from ArrayBuffer */
export function loadPLYFromBuffer(buffer) {
    const header = parsePLYHeader(buffer);
    if (header.format !== 'binary_little_endian') {
        throw new Error(`Unsupported PLY format: ${header.format}`);
    }
    if (isCompressedPLY(header)) {
        const chunks = readPLYChunks(buffer, header);
        return readCompressedPLYBody(buffer, header, chunks);
    }
    return readStandardPLYBody(buffer, header);
}
/** Load a PLY file from File, ArrayBuffer, or URL string */
export async function loadPLY(source) {
    let buffer;
    if (typeof source === 'string') {
        const response = await fetch(source);
        if (!response.ok)
            throw new Error(`Failed to fetch PLY: ${response.statusText}`);
        buffer = await response.arrayBuffer();
    }
    else if (source instanceof File) {
        buffer = await source.arrayBuffer();
    }
    else {
        buffer = source;
    }
    return loadPLYFromBuffer(buffer);
}
