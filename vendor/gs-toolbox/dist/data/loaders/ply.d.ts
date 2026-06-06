import type { GaussianCloud, PLYHeader, CompressedPLYChunk } from '../../types';
/** Parse a PLY header from text. Handles both standard and compressed formats. */
export declare function parsePLYHeader(buffer: ArrayBuffer): PLYHeader;
/** Check if a PLY has compressed chunk-based format */
export declare function isCompressedPLY(header: PLYHeader): boolean;
/** Read compressed PLY chunks from buffer */
export declare function readPLYChunks(buffer: ArrayBuffer, header: PLYHeader): CompressedPLYChunk[];
export declare function readStandardPLYBody(buffer: ArrayBuffer, header: PLYHeader): GaussianCloud;
export declare function readCompressedPLYBody(buffer: ArrayBuffer, header: PLYHeader, chunks: CompressedPLYChunk[]): GaussianCloud;
/** Load a PLY file (standard or compressed) from ArrayBuffer */
export declare function loadPLYFromBuffer(buffer: ArrayBuffer): GaussianCloud;
/** Load a PLY file from File, ArrayBuffer, or URL string */
export declare function loadPLY(source: File | ArrayBuffer | string): Promise<GaussianCloud>;
