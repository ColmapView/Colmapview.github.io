// SOG (Splat Optimized Gaussian) format loader
// ZIP archive or unbundled PlayCanvas SuperSplat/SOG meta.json + WebP textures
// Format mapping follows @playcanvas/splat-transform SOG metadata. See THIRD_PARTY_NOTICES.md.
import { decodeSmallestThree888 } from '../../codecs';
const SOG_SH_COEFFS_BY_BAND = [0, 3, 8, 15];
/** Parse SOG metadata from JSON string */
export function parseSOGMetadata(json) {
    const meta = JSON.parse(json);
    if (!meta || typeof meta !== 'object') {
        throw new Error('Invalid SOG metadata: expected object');
    }
    if (!meta.means || !meta.scales || !meta.sh0) {
        throw new Error('Invalid SOG metadata: missing means, scales, or sh0');
    }
    if (!Number.isFinite(resolveSOGCount(meta))) {
        throw new Error('Invalid SOG metadata: missing count');
    }
    return meta;
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
    const legacyMin = meta.means.min;
    const legacyMax = meta.means.max;
    const mins = meta.means.mins ?? legacyMin;
    const maxs = meta.means.maxs ?? legacyMax;
    if (!mins || !maxs) {
        throw new Error('Invalid SOG metadata: means min/max bounds are missing');
    }
    const decodeLogSpace = !!meta.means.mins || meta.version === 2;
    const minX = mins[0];
    const minY = mins[1];
    const minZ = mins[2];
    const rangeX = maxs[0] - minX;
    const rangeY = maxs[1] - minY;
    const rangeZ = maxs[2] - minZ;
    for (let i = 0; i < count; i++) {
        const lp = getPixel(meansL, i);
        const up = getPixel(meansU, i);
        const x16 = lp.r | (up.r << 8);
        const y16 = lp.g | (up.g << 8);
        const z16 = lp.b | (up.b << 8);
        const x = minX + (x16 / 65535) * rangeX;
        const y = minY + (y16 / 65535) * rangeY;
        const z = minZ + (z16 / 65535) * rangeZ;
        positions[i * 3] = decodeLogSpace ? invLogTransform(x) : x;
        positions[i * 3 + 1] = decodeLogSpace ? invLogTransform(y) : y;
        positions[i * 3 + 2] = decodeLogSpace ? invLogTransform(z) : z;
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
export function decodeSOGScales(scalesImg, codebook, count, options = {}) {
    const scales = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const p = getPixel(scalesImg, i);
        scales[i * 3] = decodeScaleValue(codebook[p.r], options.encodedLogScale);
        scales[i * 3 + 1] = decodeScaleValue(codebook[p.g], options.encodedLogScale);
        scales[i * 3 + 2] = decodeScaleValue(codebook[p.b], options.encodedLogScale);
    }
    return scales;
}
/** Decode legacy SOG V1 per-axis scale ranges. */
export function decodeSOGRangeScales(scalesImg, mins, maxs, count) {
    const scales = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const p = getPixel(scalesImg, i);
        scales[i * 3] = Math.exp(mins[0] + (maxs[0] - mins[0]) * (p.r / 255));
        scales[i * 3 + 1] = Math.exp(mins[1] + (maxs[1] - mins[1]) * (p.g / 255));
        scales[i * 3 + 2] = Math.exp(mins[2] + (maxs[2] - mins[2]) * (p.b / 255));
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
/** Decode legacy SOG V1 per-channel SH0/opacity ranges. */
export function decodeSOGRangeColors(sh0Img, mins, maxs, count) {
    const sh0 = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const p = getPixel(sh0Img, i);
        sh0[i * 3] = mins[0] + (maxs[0] - mins[0]) * (p.r / 255);
        sh0[i * 3 + 1] = mins[1] + (maxs[1] - mins[1]) * (p.g / 255);
        sh0[i * 3 + 2] = mins[2] + (maxs[2] - mins[2]) * (p.b / 255);
        const opacityLogit = mins[3] + (maxs[3] - mins[3]) * (p.a / 255);
        opacities[i] = 1 / (1 + Math.exp(-opacityLogit));
    }
    return { sh0, opacities };
}
/** Decode higher-order SOG SH palette labels into GaussianCloud's coeff-major RGB layout. */
export function decodeSOGSHN(centroidsImg, labelsImg, meta, count) {
    const shMeta = meta.shN;
    if (!shMeta) {
        throw new Error('Invalid SOG metadata: shN is missing');
    }
    const shDegree = requireSHBands(shMeta.bands);
    const shCoeffs = SOG_SH_COEFFS_BY_BAND[shDegree];
    const paletteCount = requirePositiveInt(shMeta.count, 'shN.count');
    const codebook = shMeta.codebook;
    const decode = codebook
        ? (index) => decodeCodebookValue(codebook, index, 'shN.codebook')
        : (index) => lerp(requireFiniteNumber(shMeta.mins, 'shN.mins'), requireFiniteNumber(shMeta.maxs, 'shN.maxs'), index / 255);
    validateImageSize(labelsImg, count, 'shN_labels.webp');
    const requiredCentroidWidth = 64 * shCoeffs;
    if (centroidsImg.width < requiredCentroidWidth) {
        throw new Error(`SOG shN_centroids.webp width must be at least ${requiredCentroidWidth} for ${shDegree} SH bands`);
    }
    if (centroidsImg.height * 64 < paletteCount) {
        throw new Error('SOG shN_centroids.webp texture too small for shN.count');
    }
    const shN = new Float32Array(count * shCoeffs * 3);
    for (let i = 0; i < count; i++) {
        const labelPixel = getPixel(labelsImg, i);
        const label = labelPixel.r | (labelPixel.g << 8);
        if (label >= paletteCount) {
            throw new Error(`SOG shN label ${label} exceeds shN.count ${paletteCount}`);
        }
        const entryX = (label % 64) * shCoeffs;
        const entryY = Math.floor(label / 64);
        for (let coeff = 0; coeff < shCoeffs; coeff++) {
            const pixelOffset = ((entryY * centroidsImg.width) + entryX + coeff) * 4;
            const dst = i * shCoeffs * 3 + coeff * 3;
            shN[dst] = decode(centroidsImg.data[pixelOffset]);
            shN[dst + 1] = decode(centroidsImg.data[pixelOffset + 1]);
            shN[dst + 2] = decode(centroidsImg.data[pixelOffset + 2]);
        }
    }
    return { shN, shDegree };
}
/**
 * Load a WebP image and decode to pixel data.
 * This is a browser-only helper using createImageBitmap/OffscreenCanvas.
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
async function decodeWebPAsset(asset) {
    const blob = asset instanceof Blob ? asset : new Blob([asset], { type: 'image/webp' });
    return decodeWebPBlob(blob);
}
/**
 * Load SOG from parsed metadata and an asset resolver.
 */
export async function loadSOGFromMetadata(meta, loadAsset) {
    const count = resolveSOGCount(meta);
    const [meansL, meansU, quatsImg, scalesImg, sh0Img] = await Promise.all([
        decodeWebPAsset(await loadAsset(resolveFile(meta.means.files, 0, 'means_l.webp'))),
        decodeWebPAsset(await loadAsset(resolveFile(meta.means.files, 1, 'means_u.webp'))),
        decodeWebPAsset(await loadAsset(resolveFile(meta.quats?.files, 0, 'quats.webp'))),
        decodeWebPAsset(await loadAsset(resolveFile(meta.scales.files, 0, 'scales.webp'))),
        decodeWebPAsset(await loadAsset(resolveFile(meta.sh0.files, 0, 'sh0.webp'))),
    ]);
    validateImageSize(meansL, count, 'means_l.webp');
    validateImageSize(meansU, count, 'means_u.webp');
    validateImageSize(quatsImg, count, 'quats.webp');
    validateImageSize(scalesImg, count, 'scales.webp');
    validateImageSize(sh0Img, count, 'sh0.webp');
    const positions = decodeSOGPositions(meansL, meansU, meta, count);
    const rotations = decodeSOGRotations(quatsImg, count);
    const scales = meta.scales.codebook
        ? decodeSOGScales(scalesImg, meta.scales.codebook, count)
        : decodeSOGRangeScales(scalesImg, requireVec3(meta.scales.mins, 'scales.mins'), requireVec3(meta.scales.maxs, 'scales.maxs'), count);
    const { sh0, opacities } = meta.sh0.codebook
        ? decodeSOGColors(sh0Img, meta.sh0.codebook, count)
        : decodeSOGRangeColors(sh0Img, requireNumberArray(meta.sh0.mins, 'sh0.mins'), requireNumberArray(meta.sh0.maxs, 'sh0.maxs'), count);
    let shN;
    let shDegree = 0;
    const shFiles = meta.shN?.files;
    if (meta.shN && shFiles?.length && canDecodeSOGSHN(meta.shN)) {
        const [centroidsImg, labelsImg] = await Promise.all([
            decodeWebPAsset(await loadAsset(resolveFile(shFiles, 0, 'shN_centroids.webp'))),
            decodeWebPAsset(await loadAsset(resolveFile(shFiles, 1, 'shN_labels.webp'))),
        ]);
        const decoded = decodeSOGSHN(centroidsImg, labelsImg, meta, count);
        shN = decoded.shN;
        shDegree = decoded.shDegree;
    }
    else if (meta.shN) {
        console.warn('[gs-toolbox] SOG higher-order SH metadata is unsupported; loading DC only.');
    }
    return {
        count,
        positions,
        rotations,
        scales,
        sh0,
        shN,
        opacities,
        shDegree,
        metadata: {
            format: 'sog',
            version: meta.version ?? 1,
            asset: meta.asset,
            hasSHN: !!meta.shN,
            shBands: shDegree,
        },
    };
}
/**
 * Load SOG from a caller-provided zip-like instance.
 * Browser-only (uses OffscreenCanvas for WebP decoding).
 */
export async function loadSOGFromZip(zip) {
    const metaFile = findZipMetaFile(zip);
    if (!metaFile)
        throw new Error('Missing meta.json in SOG archive');
    const metaStr = await metaFile.async('string');
    const meta = parseSOGMetadata(metaStr);
    const baseDir = zipBaseDir(metaFile.name ?? 'meta.json');
    const loadAsset = async (name) => {
        const file = zip.file(joinZipPath(baseDir, name));
        if (!file)
            throw new Error(`Missing ${joinZipPath(baseDir, name)} in SOG archive`);
        return file.async('blob');
    };
    return loadSOGFromMetadata(meta, loadAsset);
}
/** Load unbundled SOG from a meta.json URL. */
export async function loadSOGFromURL(metaUrl) {
    const response = await fetch(metaUrl);
    if (!response.ok)
        throw new Error(`Failed to fetch SOG metadata: ${response.statusText}`);
    const meta = parseSOGMetadata(await response.text());
    const loadAsset = async (name) => {
        const assetUrl = new URL(name, metaUrl).toString();
        const assetResponse = await fetch(assetUrl);
        if (!assetResponse.ok) {
            throw new Error(`Failed to fetch SOG asset ${assetUrl}: ${assetResponse.statusText}`);
        }
        return assetResponse.arrayBuffer();
    };
    return loadSOGFromMetadata(meta, loadAsset);
}
/** Load SOG from File, ArrayBuffer, or URL. Bundled .sog loading is unavailable in this vendored build. */
export async function loadSOG(source, options = {}) {
    if (typeof source === 'string' && isSOGMetaUrl(source)) {
        return loadSOGFromURL(source);
    }
    if (typeof source === 'string' && options.baseUrl && isLikelyJSONUrl(source)) {
        return loadSOGFromURL(new URL(source, options.baseUrl).toString());
    }
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
    if (looksLikeJSON(buffer)) {
        if (!options.baseUrl) {
            throw new Error('Unbundled SOG metadata requires a base URL for texture assets');
        }
        const meta = parseSOGMetadata(new TextDecoder().decode(buffer));
        return loadSOGFromMetadata(meta, async (name) => {
            const assetUrl = new URL(name, options.baseUrl).toString();
            const response = await fetch(assetUrl);
            if (!response.ok)
                throw new Error(`Failed to fetch SOG asset ${assetUrl}: ${response.statusText}`);
            return response.arrayBuffer();
        });
    }
    throw new Error('Bundled SOG loading is unavailable in colmapview vendored gs-toolbox');
}
export function isSOGMetadata(input) {
    try {
        const text = typeof input === 'string'
            ? input
            : new TextDecoder().decode(input instanceof Uint8Array ? input : new Uint8Array(input));
        const parsed = JSON.parse(text);
        return !!parsed && typeof parsed === 'object' && !!parsed.means && !!parsed.scales && !!parsed.sh0;
    }
    catch {
        return false;
    }
}
function resolveSOGCount(meta) {
    const count = meta.count ?? meta.means.shape?.[0];
    if (!Number.isInteger(count) || count < 0) {
        throw new Error('Invalid SOG metadata: count must be a non-negative integer');
    }
    return count;
}
function resolveFile(files, index, fallback) {
    const file = files?.[index] ?? fallback;
    if (!file)
        throw new Error(`Invalid SOG metadata: missing file ${fallback}`);
    return file;
}
function validateImageSize(image, count, label) {
    if (image.width * image.height < count) {
        throw new Error(`SOG ${label} texture too small for count`);
    }
}
function decodeScaleValue(value, encodedLogScale = false) {
    if (value === undefined)
        return 0.001;
    return encodedLogScale ? Math.exp(value) : value;
}
function canDecodeSOGSHN(shMeta) {
    const bands = shMeta.bands;
    const count = shMeta.count;
    if (!Number.isInteger(bands) || bands === undefined || bands < 1 || bands > 3)
        return false;
    if (!Number.isInteger(count) || count === undefined || count <= 0)
        return false;
    if (shMeta.codebook)
        return true;
    return Number.isFinite(shMeta.mins) && Number.isFinite(shMeta.maxs);
}
function requireSHBands(value) {
    if (value === 1 || value === 2 || value === 3)
        return value;
    throw new Error('Invalid SOG metadata: shN.bands must be 1, 2, or 3');
}
function requirePositiveInt(value, label) {
    if (!Number.isInteger(value) || value === undefined || value <= 0) {
        throw new Error(`Invalid SOG metadata: ${label} must be a positive integer`);
    }
    return value;
}
function requireFiniteNumber(value, label) {
    if (!Number.isFinite(value)) {
        throw new Error(`Invalid SOG metadata: ${label} must be a finite number`);
    }
    return value;
}
function decodeCodebookValue(codebook, index, label) {
    const value = codebook[index];
    if (Number.isFinite(value))
        return value;
    throw new Error(`Invalid SOG metadata: ${label}[${index}] must be a finite number`);
}
function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}
function invLogTransform(v) {
    const a = Math.abs(v);
    const e = Math.exp(a) - 1;
    return v < 0 ? -e : e;
}
function requireVec3(value, label) {
    if (!value || value.length < 3 || !value.every(Number.isFinite)) {
        throw new Error(`Invalid SOG metadata: ${label} must be a numeric 3-vector`);
    }
    return [value[0], value[1], value[2]];
}
function requireNumberArray(value, label) {
    if (!value || value.length === 0 || !value.every(Number.isFinite)) {
        throw new Error(`Invalid SOG metadata: ${label} must be a numeric array`);
    }
    return value;
}
function findZipMetaFile(zip) {
    const root = zip.file('meta.json');
    if (root)
        return root;
    const matches = zip.file(/(^|\/)meta\.json$/);
    return matches.length > 0 ? matches[0] : null;
}
function zipBaseDir(path) {
    const index = path.lastIndexOf('/');
    return index >= 0 ? path.slice(0, index) : '';
}
function joinZipPath(baseDir, name) {
    return baseDir ? `${baseDir}/${name}` : name;
}
function isSOGMetaUrl(url) {
    const lower = url.toLowerCase().split(/[?#]/, 1)[0].replace(/\\/g, '/');
    return lower.endsWith('/meta.json') || lower === 'meta.json';
}
function isLikelyJSONUrl(url) {
    return url.toLowerCase().split(/[?#]/, 1)[0].endsWith('.json');
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
