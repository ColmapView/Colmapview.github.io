import type { GaussianCloud, SOGMetadata, PixelData } from '../../types';
export interface SOGLoadOptions {
    /** Base URL used to resolve relative texture paths for unbundled meta.json payloads. */
    baseUrl?: string;
}
type AssetLoader = (name: string) => Promise<ArrayBuffer | Blob>;
/** Parse SOG metadata from JSON string */
export declare function parseSOGMetadata(json: string): SOGMetadata;
/** Decode SOG positions from low + high byte images */
export declare function decodeSOGPositions(meansL: PixelData, meansU: PixelData, meta: SOGMetadata, count: number): Float32Array;
/** Decode SOG rotations from quaternion image */
export declare function decodeSOGRotations(quats: PixelData, count: number): Float32Array;
/** Decode SOG scales from codebook image */
export declare function decodeSOGScales(scalesImg: PixelData, codebook: number[], count: number, options?: {
    encodedLogScale?: boolean;
}): Float32Array;
/** Decode legacy SOG V1 per-axis scale ranges. */
export declare function decodeSOGRangeScales(scalesImg: PixelData, mins: [number, number, number], maxs: [number, number, number], count: number): Float32Array;
/** Decode SOG colors from codebook image */
export declare function decodeSOGColors(sh0Img: PixelData, codebook: number[], count: number): {
    sh0: Float32Array;
    opacities: Float32Array;
};
/** Decode legacy SOG V1 per-channel SH0/opacity ranges. */
export declare function decodeSOGRangeColors(sh0Img: PixelData, mins: number[], maxs: number[], count: number): {
    sh0: Float32Array;
    opacities: Float32Array;
};
/** Decode higher-order SOG SH palette labels into GaussianCloud's coeff-major RGB layout. */
export declare function decodeSOGSHN(centroidsImg: PixelData, labelsImg: PixelData, meta: SOGMetadata, count: number): {
    shN: Float32Array;
    shDegree: number;
};
/**
 * Load SOG from parsed metadata and an asset resolver.
 */
export declare function loadSOGFromMetadata(meta: SOGMetadata, loadAsset: AssetLoader): Promise<GaussianCloud>;
/**
 * Load SOG from a caller-provided zip-like instance.
 * Browser-only (uses OffscreenCanvas for WebP decoding).
 */
export declare function loadSOGFromZip(zip: any): Promise<GaussianCloud>;
/** Load unbundled SOG from a meta.json URL. */
export declare function loadSOGFromURL(metaUrl: string): Promise<GaussianCloud>;
/** Load SOG from File, ArrayBuffer, or URL. Bundled .sog loading is unavailable in this vendored build. */
export declare function loadSOG(source: File | ArrayBuffer | string, options?: SOGLoadOptions): Promise<GaussianCloud>;
export declare function isSOGMetadata(input: ArrayBuffer | Uint8Array | string): boolean;
export {};
