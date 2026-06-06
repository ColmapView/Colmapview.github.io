// Streaming PLY loader with progressive loading support
import { parsePLYHeader, isCompressedPLY } from './ply';
import { sigmoid } from '../transforms';
/**
 * Load PLY with streaming — calls onChunk as data arrives.
 *
 * Only supports URL sources (File/ArrayBuffer are already in memory).
 * Only supports standard (non-compressed) PLY format for streaming.
 *
 * @param source - URL to fetch
 * @param options - Streaming options with onChunk callback
 * @returns Complete GaussianCloud when done
 */
export async function loadPLYStreaming(source, options) {
    const chunkSize = options?.chunkSize ?? 10000;
    const response = await fetch(source);
    if (!response.ok)
        throw new Error(`Failed to fetch PLY: ${response.statusText}`);
    if (!response.body) {
        throw new Error('ReadableStream not available — cannot stream');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    // Phase 1: Read enough data to parse the header
    let header = null;
    let headerBuffer = null;
    while (!header) {
        const { done, value } = await reader.read();
        if (done)
            throw new Error('Unexpected end of stream before PLY header');
        chunks.push(value);
        totalBytes += value.length;
        // Try to parse header from accumulated bytes
        const accumulated = concatChunks(chunks, totalBytes);
        try {
            // Check if we have "end_header\n" in the data
            const text = new TextDecoder().decode(accumulated.subarray(0, Math.min(16384, accumulated.length)));
            if (text.includes('end_header')) {
                const tempBuffer = accumulated.buffer.slice(accumulated.byteOffset, accumulated.byteOffset + accumulated.byteLength);
                header = parsePLYHeader(tempBuffer);
                headerBuffer = accumulated;
            }
        }
        catch {
            // Header not complete yet, continue reading
        }
    }
    if (isCompressedPLY(header)) {
        throw new Error('Streaming not supported for compressed PLY. Use loadPLY() instead.');
    }
    const { vertexCount, properties, headerLength } = header;
    const propMap = new Map();
    for (const p of properties)
        propMap.set(p.name, p);
    const stride = properties.reduce((sum, p) => sum + p.size, 0);
    // Determine SH degree
    let shDegree = 0;
    if (propMap.has('f_rest_0'))
        shDegree = 1;
    if (propMap.has('f_rest_9'))
        shDegree = 2;
    if (propMap.has('f_rest_24'))
        shDegree = 3;
    const numSHCoeffs = shDegree > 0 ? (shDegree + 1) ** 2 - 1 : 0;
    // Pre-allocate full-size typed arrays
    const positions = new Float32Array(vertexCount * 3);
    const scales = new Float32Array(vertexCount * 3);
    const rotations = new Float32Array(vertexCount * 4);
    const opacities = new Float32Array(vertexCount);
    const sh0 = new Float32Array(vertexCount * 3);
    const shN = numSHCoeffs > 0 ? new Float32Array(vertexCount * numSHCoeffs * 3) : undefined;
    // Property references
    const px = propMap.get('x'), py = propMap.get('y'), pz = propMap.get('z');
    const sx = propMap.get('scale_0'), sy = propMap.get('scale_1'), sz = propMap.get('scale_2');
    const rw = propMap.get('rot_0'), rx = propMap.get('rot_1');
    const ry = propMap.get('rot_2'), rz = propMap.get('rot_3');
    const opac = propMap.get('opacity');
    const dc0 = propMap.get('f_dc_0'), dc1 = propMap.get('f_dc_1'), dc2 = propMap.get('f_dc_2');
    // The cloud object is returned to onChunk callbacks with increasing count
    const cloud = {
        count: 0,
        positions, scales, rotations, opacities, sh0, shN, shDegree,
    };
    // Phase 2: Stream vertex data
    let loadedVertices = 0;
    let lastChunkNotify = 0;
    // We already have some data in headerBuffer
    let pendingBytes = headerBuffer.subarray(headerLength);
    let reading = true;
    while (reading) {
        // Decode as many vertices as we can from pendingBytes
        const dataView = new DataView(pendingBytes.buffer, pendingBytes.byteOffset, pendingBytes.byteLength);
        const availableVertices = Math.min(Math.floor(pendingBytes.length / stride), vertexCount - loadedVertices);
        for (let v = 0; v < availableVertices; v++) {
            const i = loadedVertices + v;
            const offset = v * stride;
            positions[i * 3] = readFloat(dataView, offset, px);
            positions[i * 3 + 1] = readFloat(dataView, offset, py);
            positions[i * 3 + 2] = readFloat(dataView, offset, pz);
            scales[i * 3] = Math.exp(readFloat(dataView, offset, sx));
            scales[i * 3 + 1] = Math.exp(readFloat(dataView, offset, sy));
            scales[i * 3 + 2] = Math.exp(readFloat(dataView, offset, sz));
            let qw = readFloat(dataView, offset, rw);
            let qx = readFloat(dataView, offset, rx);
            let qy = readFloat(dataView, offset, ry);
            let qz = readFloat(dataView, offset, rz);
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
            opacities[i] = sigmoid(readFloat(dataView, offset, opac));
            sh0[i * 3] = readFloat(dataView, offset, dc0);
            sh0[i * 3 + 1] = readFloat(dataView, offset, dc1);
            sh0[i * 3 + 2] = readFloat(dataView, offset, dc2);
            if (shN && numSHCoeffs > 0) {
                for (let j = 0; j < numSHCoeffs; j++) {
                    const rProp = propMap.get(`f_rest_${j}`);
                    const gProp = propMap.get(`f_rest_${j + numSHCoeffs}`);
                    const bProp = propMap.get(`f_rest_${j + numSHCoeffs * 2}`);
                    shN[i * numSHCoeffs * 3 + j * 3] = readFloat(dataView, offset, rProp);
                    shN[i * numSHCoeffs * 3 + j * 3 + 1] = readFloat(dataView, offset, gProp);
                    shN[i * numSHCoeffs * 3 + j * 3 + 2] = readFloat(dataView, offset, bProp);
                }
            }
        }
        loadedVertices += availableVertices;
        const consumedBytes = availableVertices * stride;
        pendingBytes = pendingBytes.subarray(consumedBytes);
        // Notify if we've loaded enough new vertices
        if (options?.onChunk && loadedVertices - lastChunkNotify >= chunkSize) {
            cloud.count = loadedVertices;
            options.onChunk(cloud, loadedVertices, vertexCount);
            lastChunkNotify = loadedVertices;
        }
        // Check if we're done
        if (loadedVertices >= vertexCount) {
            reading = false;
            break;
        }
        // Read more data
        const { done, value } = await reader.read();
        if (done) {
            reading = false;
            break;
        }
        // Append new data to pending
        if (pendingBytes.length > 0) {
            const combined = new Uint8Array(pendingBytes.length + value.length);
            combined.set(pendingBytes);
            combined.set(value, pendingBytes.length);
            pendingBytes = combined;
        }
        else {
            pendingBytes = value;
        }
    }
    // Final notification
    cloud.count = loadedVertices;
    if (options?.onChunk && loadedVertices !== lastChunkNotify) {
        options.onChunk(cloud, loadedVertices, vertexCount);
    }
    return cloud;
}
function concatChunks(chunks, totalLength) {
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}
function readFloat(dataView, offset, prop) {
    if (!prop)
        return 0;
    const pos = offset + prop.offset;
    const size = (prop.type === 'double' || prop.type === 'float64') ? 8 : 4;
    if (pos + size > dataView.byteLength)
        return 0;
    switch (prop.type) {
        case 'float':
        case 'float32': return dataView.getFloat32(pos, true);
        case 'double':
        case 'float64': return dataView.getFloat64(pos, true);
        default: return dataView.getFloat32(pos, true);
    }
}
