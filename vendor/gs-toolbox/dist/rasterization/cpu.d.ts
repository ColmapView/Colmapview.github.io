import type { GaussianCloud } from '../types';
export type TensorRenderMode = 'RGB' | 'D' | 'ED' | 'RGB+D' | 'RGB+ED';
export type TensorCameraModel = 'pinhole' | 'ortho';
export interface TensorRasterizationOptions {
    cloud: GaussianCloud;
    viewmats: Float32Array | Float32Array[];
    Ks: Float32Array | Float32Array[];
    width: number;
    height: number;
    colors?: Float32Array;
    colorChannels?: number;
    backgrounds?: Float32Array;
    renderMode?: TensorRenderMode;
    cameraModel?: TensorCameraModel;
    nearPlane?: number;
    farPlane?: number;
    radiusClip?: number;
    eps2d?: number;
    opacityThreshold?: number;
    channelChunk?: number;
}
export interface TensorRasterizationMeta {
    cameraCount: number;
    gaussianCount: number;
    width: number;
    height: number;
    channels: number;
    sourceChannels: number;
    colorShape: [number, number, number, number];
    alphaShape: [number, number, number, 1];
    renderMode: TensorRenderMode;
    channelChunk: number;
    radii: Float32Array;
    means2d: Float32Array;
    depths: Float32Array;
    conics: Float32Array;
}
export interface TensorRasterizationResult {
    renderColors: Float32Array;
    renderAlphas: Float32Array;
    render_colors: Float32Array;
    render_alphas: Float32Array;
    meta: TensorRasterizationMeta;
}
export interface ProjectionReferenceOptions {
    cloud: GaussianCloud;
    viewmats: Float32Array | Float32Array[];
    Ks: Float32Array | Float32Array[];
    width: number;
    height: number;
    cameraModel?: TensorCameraModel;
    nearPlane?: number;
    farPlane?: number;
    radiusClip?: number;
    eps2d?: number;
    opacityThreshold?: number;
}
export interface ProjectionReferenceResult {
    cameraCount: number;
    gaussianCount: number;
    radii: Float32Array;
    means2d: Float32Array;
    depths: Float32Array;
    conics: Float32Array;
}
export interface TileIntersectionCPUResult {
    tilesPerGaussian: Uint32Array;
    isectIds: BigUint64Array;
    flattenIds: Uint32Array;
}
export declare function renderToTensors(options: TensorRasterizationOptions): TensorRasterizationResult;
export declare function rasterizationCPU(options: TensorRasterizationOptions): TensorRasterizationResult;
export declare function fullyFusedProjectionCPU(options: ProjectionReferenceOptions): ProjectionReferenceResult;
export declare function isectTilesCPU(projection: ProjectionReferenceResult, tileSize: number, tileWidth: number, tileHeight: number, sort?: boolean): TileIntersectionCPUResult;
export declare function isectOffsetEncodeCPU(isectIds: BigUint64Array, nImages: number, tileWidth: number, tileHeight: number): Uint32Array;
export declare function rasterizeToPixelsCPU(projection: ProjectionReferenceResult, colors: Float32Array, opacities: Float32Array, width: number, height: number, options: {
    colorChannels: number;
    renderMode?: TensorRenderMode;
    backgrounds?: Float32Array;
    channelChunk?: number;
}): TensorRasterizationResult;
