// Auto-detect format and load
import { loadPLY, loadPLYFromBuffer } from './ply';
import { loadSplat, loadSplatFromBuffer } from './splat';
import { loadSPZ, loadSPZFromBuffer } from './spz';
import { isSOGMetadata, loadSOG } from './sog';
import { loadSparkRAD } from './spark';
/** Detect format from filename/URL or magic bytes */
export function detectFormat(source) {
    if (typeof source === 'string') {
        // Strip query params before checking extension
        const lower = source.toLowerCase().split('?')[0];
        if (lower.endsWith('.ply'))
            return 'ply';
        if (lower.endsWith('.splat'))
            return 'splat';
        if (lower.endsWith('.spz'))
            return 'spz';
        if (lower.endsWith('.sog'))
            return 'sog';
        if (lower.endsWith('/meta.json') || lower.endsWith('meta.json'))
            return 'sog';
        if (lower.endsWith('.rad') || lower.endsWith('.radc'))
            return 'rad';
        return 'unknown';
    }
    // Check magic bytes
    if (source.byteLength < 4)
        return 'unknown';
    const bytes = new Uint8Array(source, 0, 4);
    // PLY: starts with "ply\n"
    if (bytes[0] === 0x70 && bytes[1] === 0x6C && bytes[2] === 0x79)
        return 'ply';
    // Gzip: starts with 0x1F 0x8B (could be SPZ)
    if (bytes[0] === 0x1F && bytes[1] === 0x8B)
        return 'spz';
    // ZIP (SOG): starts with PK\x03\x04
    if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04)
        return 'sog';
    // Spark RAD/RADC: starts with "RAD0" or "RADC"
    if (bytes[0] === 0x52 && bytes[1] === 0x41 && bytes[2] === 0x44 &&
        (bytes[3] === 0x30 || bytes[3] === 0x43))
        return 'rad';
    if (looksLikeJSON(source) && isSOGMetadata(source))
        return 'sog';
    // .splat has no magic — check if file size is multiple of 32
    if (source.byteLength > 0 && source.byteLength % 32 === 0)
        return 'splat';
    return 'unknown';
}
/** Auto-detect format and load Gaussian data */
export async function load(source, options) {
    // Detect format
    let format;
    if (source instanceof File) {
        format = detectFormat(source.name);
    }
    else {
        format = detectFormat(source);
    }
    if (format === 'rad') {
        return loadSparkRAD(source);
    }
    // If we have a progress callback and source is a URL, use streaming fetch
    if (options?.onProgress && typeof source === 'string') {
        const buffer = await fetchWithProgress(source, options.onProgress);
        switch (format) {
            case 'ply': return loadPLYFromBuffer(buffer);
            case 'splat': return loadSplatFromBuffer(buffer);
            case 'spz': return loadSPZFromBuffer(buffer);
            case 'sog': return loadSOG(buffer);
            default:
                throw new Error(formatErrorMessage());
        }
    }
    switch (format) {
        case 'ply': return loadPLY(source);
        case 'splat': return loadSplat(source);
        case 'spz': return loadSPZ(source);
        case 'sog': return loadSOG(source);
        default:
            throw new Error(formatErrorMessage());
    }
}
function formatErrorMessage() {
    return 'Cannot detect Gaussian format. Provide a file with .ply, .splat, .spz, .sog, .rad/.radc, or PlayCanvas SOG meta.json extension.';
}
function looksLikeJSON(buffer) {
    const bytes = new Uint8Array(buffer);
    for (const byte of bytes.subarray(0, Math.min(bytes.length, 32))) {
        if (byte === 0x20 || byte === 0x09 || byte === 0x0A || byte === 0x0D)
            continue;
        return byte === 0x7B;
    }
    return false;
}
/** Fetch a URL with progress reporting via ReadableStream. */
async function fetchWithProgress(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`Failed to fetch: ${response.statusText}`);
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    // If no body stream available, fall back to regular arrayBuffer()
    if (!response.body) {
        const buffer = await response.arrayBuffer();
        onProgress(buffer.byteLength, buffer.byteLength);
        return buffer;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        chunks.push(value);
        loaded += value.length;
        onProgress(loaded, contentLength);
    }
    // Concatenate into single ArrayBuffer
    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result.buffer;
}
