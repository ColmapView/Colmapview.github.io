import type { GaussianCloud, SOGMetadata, PixelData } from './types';
/** Parse SOG metadata from JSON string */
export declare function parseSOGMetadata(json: string): SOGMetadata;
/** Decode SOG positions from low + high byte images */
export declare function decodeSOGPositions(meansL: PixelData, meansU: PixelData, meta: SOGMetadata, count: number): Float32Array;
/** Decode SOG rotations from quaternion image */
export declare function decodeSOGRotations(quats: PixelData, count: number): Float32Array;
/** Decode SOG scales from codebook image */
export declare function decodeSOGScales(scalesImg: PixelData, codebook: number[], count: number): Float32Array;
/** Decode SOG colors from codebook image */
export declare function decodeSOGColors(sh0Img: PixelData, codebook: number[], count: number): {
    sh0: Float32Array;
    opacities: Float32Array;
};
/**
 * Load SOG from a caller-provided zip-like instance.
 * Browser-only (uses OffscreenCanvas for WebP decoding).
 */
export declare function loadSOGFromZip(zip: any): Promise<GaussianCloud>;
/** Load SOG from File, ArrayBuffer, or URL. Bundled .sog loading is unavailable in this vendored build. */
export declare function loadSOG(source: File | ArrayBuffer | string): Promise<GaussianCloud>;
