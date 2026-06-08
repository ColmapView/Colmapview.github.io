/**
 * Unified output for all Gaussian loaders.
 * All values are in "activated" (linear) space — no further transforms needed.
 */
export interface GaussianCloud {
    count: number;
    positions: Float32Array;
    scales: Float32Array;
    rotations: Float32Array;
    opacities: Float32Array;
    sh0: Float32Array;
    shN?: Float32Array;
    shDegree: number;
    metadata?: Record<string, unknown>;
}
export interface PLYProperty {
    name: string;
    type: string;
    offset: number;
    size: number;
}
export interface PLYHeader {
    format: string;
    vertexCount: number;
    properties: PLYProperty[];
    headerLength: number;
    /** Number of chunks for compressed PLY, 0 for standard */
    chunkCount: number;
    chunkProperties: PLYProperty[];
    rowVertexLength: number;
    rowChunkLength: number;
}
export declare const PLY_TYPE_SIZES: Record<string, number>;
export interface CompressedPLYChunk {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
    minScaleX: number;
    minScaleY: number;
    minScaleZ: number;
    maxScaleX: number;
    maxScaleY: number;
    maxScaleZ: number;
    minColorR: number;
    minColorG: number;
    minColorB: number;
    maxColorR: number;
    maxColorG: number;
    maxColorB: number;
}
export interface SPZHeader {
    magic: number;
    version: number;
    numPoints: number;
    shDegree: number;
    flags: number;
    reserved: number;
}
export type PackedFormat = 'compact' | 'balanced';
/**
 * GPU-optimized packed Gaussian storage.
 *
 * - `compact` (16 bytes/splat): f16 positions, u8 color/opacity/scales, octahedral rotation
 * - `balanced` (32 bytes/splat): f32 positions, precomputed covariance as f16, u8 color/opacity
 */
export interface PackedGaussians {
    format: PackedFormat;
    count: number;
    /** Packed data — Uint32Array with 4 (compact) or 8 (balanced) words per Gaussian */
    data: Uint32Array;
    bytesPerSplat: number;
}
