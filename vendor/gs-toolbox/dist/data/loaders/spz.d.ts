import type { GaussianCloud, SPZHeader } from '../../types';
export interface SparkSPZHeader {
    magic: number;
    version: number;
    numSplats: number;
    shDegree: number;
    fractionalBits: number;
    flags: number;
    reserved: number;
}
/** Parse SPZ header from decompressed data (16 bytes) */
export declare function parseSPZHeader(data: Uint8Array): SPZHeader;
/** Validate SPZ magic bytes ("SPZ\0") */
export declare function validateSPZMagic(header: SPZHeader): void;
/** Parse Spark/Niantic NGSP SPZ header from decompressed data. */
export declare function parseSparkSPZHeader(data: Uint8Array): SparkSPZHeader;
/** Decode SPZ positions from decompressed data */
export declare function decodeSPZPositions(data: Uint8Array, count: number, offset: number, posScale: number, posBias: number): Float32Array;
/** Decode SPZ rotations from decompressed data */
export declare function decodeSPZRotations(data: Uint8Array, count: number, offset: number): Float32Array;
/** Decode SPZ scales from decompressed data */
export declare function decodeSPZScales(data: Uint8Array, count: number, offset: number): Float32Array;
/** Decode SPZ opacities from decompressed data */
export declare function decodeSPZOpacities(data: Uint8Array, count: number, offset: number): Float32Array;
/** Decode SPZ SH0 (DC) from decompressed data */
export declare function decodeSPZSH0(data: Uint8Array, count: number, offset: number): Float32Array;
/** Decode SPZ higher-order SH from decompressed data.
 * SPZ stores SH in interleaved order [R0,G0,B0, R1,G1,B1, ...] — color is the
 * inner (fastest-varying) axis, matching our GaussianCloud.shN layout.
 * (Confirmed against Niantic's splat-types.h reference implementation.) */
export declare function decodeSPZSHN(data: Uint8Array, count: number, offset: number, shDegree: number): Float32Array | undefined;
/** Load SPZ from decompressed Uint8Array */
export declare function loadSPZFromDecompressed(data: Uint8Array): GaussianCloud;
/** Load Spark/Niantic NGSP SPZ from decompressed gzip payload. */
export declare function loadSparkSPZFromDecompressed(data: Uint8Array): GaussianCloud;
/** Load SPZ from gzip-compressed ArrayBuffer */
export declare function loadSPZFromBuffer(compressed: ArrayBuffer): GaussianCloud;
/** Load SPZ from File, ArrayBuffer, or URL */
export declare function loadSPZ(source: File | ArrayBuffer | string): Promise<GaussianCloud>;
