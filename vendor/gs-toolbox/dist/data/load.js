// Auto-detect format and load
import { loadPLY } from './ply';
import { loadSplat } from './splat';
import { loadSPZ } from './spz';
import { loadSOG } from './sog';
/** Detect format from filename/URL or magic bytes */
export function detectFormat(source) {
    if (typeof source === 'string') {
        const lower = source.toLowerCase();
        if (lower.endsWith('.ply'))
            return 'ply';
        if (lower.endsWith('.splat'))
            return 'splat';
        if (lower.endsWith('.spz'))
            return 'spz';
        if (lower.endsWith('.sog'))
            return 'sog';
        // Check URL query params
        const url = lower.split('?')[0];
        if (url.endsWith('.ply'))
            return 'ply';
        if (url.endsWith('.splat'))
            return 'splat';
        if (url.endsWith('.spz'))
            return 'spz';
        if (url.endsWith('.sog'))
            return 'sog';
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
    // .splat has no magic — check if file size is multiple of 32
    if (source.byteLength > 0 && source.byteLength % 32 === 0)
        return 'splat';
    return 'unknown';
}
/** Auto-detect format and load Gaussian data */
export async function load(source) {
    // Detect format
    let format;
    if (typeof source === 'string') {
        format = detectFormat(source);
    }
    else if (source instanceof File) {
        format = detectFormat(source.name);
    }
    else {
        format = detectFormat(source);
    }
    switch (format) {
        case 'ply': return loadPLY(source);
        case 'splat': return loadSplat(source);
        case 'spz': return loadSPZ(source);
        case 'sog': return loadSOG(source);
        default:
            throw new Error(`Cannot detect Gaussian format. Provide a file with .ply, .splat, .spz, or .sog extension.`);
    }
}
