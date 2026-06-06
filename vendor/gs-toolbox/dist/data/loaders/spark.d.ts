import type { GaussianCloud } from '../../types';
export interface SparkSplatEncoding {
    rgbMin?: number;
    rgbMax?: number;
    lnScaleMin?: number;
    lnScaleMax?: number;
    sh1Max?: number;
    sh2Max?: number;
    sh3Max?: number;
    lodOpacity?: boolean;
}
export interface SparkRADChunkRange {
    offset: number;
    bytes: number;
    base?: number;
    count?: number;
    filename?: string;
}
export interface SparkRADMeta {
    version: number;
    type: string;
    count: number;
    maxSh?: number;
    lodTree?: boolean;
    chunkSize?: number;
    allChunkBytes?: number;
    chunks: SparkRADChunkRange[];
    splatEncoding?: SparkSplatEncoding;
    shCodeCount?: number;
    comment?: string;
}
export interface SparkRADHeader {
    meta: SparkRADMeta;
    chunksStart: number;
}
export interface SparkRADChunkProperty {
    offset: number;
    bytes: number;
    property: SparkRADChunkPropertyName;
    encoding: SparkRADChunkPropertyEncoding;
    compression?: 'gz';
    min?: number;
    max?: number;
}
export type SparkRADChunkPropertyName = 'center' | 'alpha' | 'rgb' | 'scales' | 'orientation' | 'sh1' | 'sh2' | 'sh3' | 'child_count' | 'child_start' | 'sh1_code' | 'sh2_code' | 'sh3_code' | 'sh_label';
export type SparkRADChunkPropertyEncoding = 'f32' | 'f16' | 'f32_lebytes' | 'f16_lebytes' | 'r8' | 'r8_delta' | 's8' | 's8_delta' | 'ln_0r8' | 'ln_f16' | 'oct88r8' | 'u16' | 'u32';
export interface SparkRADChunkMeta {
    version: number;
    base: number;
    count: number;
    payloadBytes: number;
    maxSh?: number;
    lodTree?: boolean;
    splatEncoding?: SparkSplatEncoding;
    properties: SparkRADChunkProperty[];
}
export interface SparkRADChunkHeader {
    meta: SparkRADChunkMeta;
    payloadStart: number;
    payloadEnd: number;
}
export interface SparkPackedResult {
    numSplats: number;
    packedArray: Uint32Array;
    splatEncoding?: SparkSplatEncoding;
    extra?: Record<string, unknown>;
}
export interface SparkUnpackedSplat {
    center: [number, number, number];
    scales: [number, number, number];
    quaternion: [number, number, number, number];
    color: [number, number, number];
    opacity: number;
}
/** Load Spark RAD or RADC data into this repository's GaussianCloud representation. */
export declare function loadSparkRAD(source: File | ArrayBuffer | string): Promise<GaussianCloud>;
/** Decode a complete Spark RAD file or a single RADC chunk from an ArrayBuffer. */
export declare function loadSparkRADFromBuffer(buffer: ArrayBuffer, baseUrl?: string): Promise<GaussianCloud>;
/** Parse a Spark RAD file header from the beginning of a byte buffer. */
export declare function parseRADHeader(bytes: Uint8Array): SparkRADHeader;
/** Parse a Spark RADC chunk header from the beginning of a byte buffer. */
export declare function parseRADChunkHeader(bytes: Uint8Array): SparkRADChunkHeader;
export declare function sparkPackedResultToCloud(result: SparkPackedResult, sparkOrChunkIndex?: {
    unpackSplat?: unknown;
} | number, maybeChunkIndex?: number): GaussianCloud;
/** Unpack Spark's 4-word PackedSplat layout without importing Spark or Three.js. */
export declare function unpackSparkPackedSplat(packedSplats: Uint32Array, index: number, encoding?: SparkSplatEncoding): SparkUnpackedSplat;
