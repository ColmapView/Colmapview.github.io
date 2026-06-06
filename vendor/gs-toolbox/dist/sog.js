// SOG (Splat Optimized Gaussian) format loader
// ZIP archive with WebP tiles + JSON metadata
// Source: PlayCanvas SuperSplat (MIT License)
import { decodeSmallestThree888 } from './codecs';
/** Parse SOG metadata from JSON string */
export function parseSOGMetadata(json) {
    return JSON.parse(json);
}
/** Get pixel at index from RGBA image data */
function getPixel(img, index) {
    const off = index * 4;
    return {
        r: img.data[off],
        g: img.data[off + 1],
        b: img.data[off + 2],
        a: img.data[off + 3],
    };
}
/** Decode SOG positions from low + high byte images */
export function decodeSOGPositions(meansL, meansU, meta, count) {
    const positions = new Float32Array(count * 3);
    const [minX, minY, minZ] = meta.means.min;
    const rangeX = meta.means.max[0] - minX;
    const rangeY = meta.means.max[1] - minY;
    const rangeZ = meta.means.max[2] - minZ;
    for (let i = 0; i < count; i++) {
        const lp = getPixel(meansL, i);
        const up = getPixel(meansU, i);
        const x16 = lp.r | (up.r << 8);
        const y16 = lp.g | (up.g << 8);
        const z16 = lp.b | (up.b << 8);
        positions[i * 3] = minX + (x16 / 65535) * rangeX;
        positions[i * 3 + 1] = minY + (y16 / 65535) * rangeY;
        positions[i * 3 + 2] = minZ + (z16 / 65535) * rangeZ;
    }
    return positions;
}
/** Decode SOG rotations from quaternion image */
export function decodeSOGRotations(quats, count) {
    const rotations = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
        const p = getPixel(quats, i);
        const mode = Math.max(0, Math.min(3, p.a - 252));
        const [w, x, y, z] = decodeSmallestThree888(p.r, p.g, p.b, mode);
        rotations[i * 4] = w;
        rotations[i * 4 + 1] = x;
        rotations[i * 4 + 2] = y;
        rotations[i * 4 + 3] = z;
    }
    return rotations;
}
/** Decode SOG scales from codebook image */
export function decodeSOGScales(scalesImg, codebook, count) {
    const scales = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const p = getPixel(scalesImg, i);
        scales[i * 3] = codebook[p.r] ?? 0.001;
        scales[i * 3 + 1] = codebook[p.g] ?? 0.001;
        scales[i * 3 + 2] = codebook[p.b] ?? 0.001;
    }
    return scales;
}
/** Decode SOG colors from codebook image */
export function decodeSOGColors(sh0Img, codebook, count) {
    const sh0 = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const p = getPixel(sh0Img, i);
        sh0[i * 3] = codebook[p.r] ?? 0;
        sh0[i * 3 + 1] = codebook[p.g] ?? 0;
        sh0[i * 3 + 2] = codebook[p.b] ?? 0;
        opacities[i] = p.a / 255;
    }
    return { sh0, opacities };
}
/**
 * Load a WebP image from a ZIP file entry and decode to pixel data.
 * This is a browser-only helper using OffscreenCanvas.
 */
async function decodeWebPBlob(blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
        width: bitmap.width,
        height: bitmap.height,
        data: imageData.data,
    };
}
/**
 * Load SOG from a caller-provided zip-like instance.
 * Browser-only (uses OffscreenCanvas for WebP decoding).
 */
export async function loadSOGFromZip(zip) {
    // Parse metadata
    const metaFile = zip.file('meta.json');
    if (!metaFile)
        throw new Error('Missing meta.json in SOG archive');
    const metaStr = await metaFile.async('string');
    const meta = parseSOGMetadata(metaStr);
    const count = meta.count;
    // Load WebP images in parallel
    const loadImg = async (name) => {
        const file = zip.file(name);
        if (!file)
            throw new Error(`Missing ${name} in SOG archive`);
        const blob = await file.async('blob');
        return decodeWebPBlob(blob);
    };
    const [meansL, meansU, quatsImg, scalesImg, sh0Img] = await Promise.all([
        loadImg('means_l.webp'),
        loadImg('means_u.webp'),
        loadImg('quats.webp'),
        loadImg('scales.webp'),
        loadImg('sh0.webp'),
    ]);
    const positions = decodeSOGPositions(meansL, meansU, meta, count);
    const rotations = decodeSOGRotations(quatsImg, count);
    const scales = decodeSOGScales(scalesImg, meta.scales.codebook, count);
    const { sh0, opacities } = decodeSOGColors(sh0Img, meta.sh0.codebook, count);
    return {
        count,
        positions,
        rotations,
        scales,
        sh0,
        opacities,
        shDegree: 0,
    };
}
/** Load SOG from File, ArrayBuffer, or URL. Bundled .sog loading is unavailable in this vendored build. */
export async function loadSOG(source) {
    let buffer;
    if (typeof source === 'string') {
        const response = await fetch(source);
        if (!response.ok)
            throw new Error(`Failed to fetch SOG: ${response.statusText}`);
        buffer = await response.arrayBuffer();
    }
    else if (source instanceof File) {
        buffer = await source.arrayBuffer();
    }
    else {
        buffer = source;
    }
    void buffer;
    throw new Error('Bundled SOG loading is unavailable in colmapview vendored gs-toolbox');
}
