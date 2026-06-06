import type { GPURasterModule, GPURasterConfig, GPURasterUniforms } from './types';
/**
 * Options for creating a TiledRasterModule.
 */
export interface TiledRasterOptions {
    /** Tile size in pixels (default: 16). Must be 16 for current shader. */
    tileSize?: number;
    /** Max intersections per Gaussian (default: 8). Controls buffer pre-allocation. */
    intersectionRatio?: number;
}
/**
 * GPU tiled rasterization module for Gaussian splatting.
 *
 * Self-contained compute pipeline that handles tile intersection, internal
 * sorting, offset encoding, and per-tile rasterization. Implements the
 * GPURasterModule interface for drop-in use with the existing pipeline.
 *
 * The external sort module should be SKIPPED when using this rasterizer —
 * sorting is handled internally with a radix sort on packed (tile_id, depth) keys.
 *
 * @example
 * ```typescript
 * const raster = new TiledRasterModule(device);
 * raster.configure({
 *   count: gaussianCount,
 *   buffers: { sortedIndices: indexBuf, splatData: splatBuf },
 *   format: 'bgra8unorm',
 * });
 * raster.setUniforms({ viewportWidth: 1920, viewportHeight: 1080, ... });
 *
 * const encoder = device.createCommandEncoder();
 * // Skip sortModule.execute(encoder) — tiled handles sorting internally
 * raster.execute(encoder, colorTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare class TiledRasterModule implements GPURasterModule {
    readonly name = "Tiled";
    private device;
    private tileSize;
    private intersectionRatio;
    private clearPipeline;
    private intersectPipeline;
    private offsetEncodePipeline;
    private offsetFixPipeline;
    private rasterPipeline;
    private blitShaderModule;
    private blitPipeline;
    private currentFormat;
    private sortModule;
    private configured;
    private count;
    private maxIsects;
    private splatDataBuffer;
    private tileWidth;
    private tileHeight;
    private viewportWidth;
    private viewportHeight;
    private isectKeys;
    private isectVals;
    private tileOffsets;
    private outputColor;
    private atomicCounter;
    private clearUniformBuffer;
    private intersectUniformBuffer;
    private rasterUniformBuffer;
    private offsetFixUniformBuffer;
    private blitUniformBuffer;
    private clearBindGroup;
    private intersectBindGroup;
    private offsetEncodeBindGroup;
    private offsetFixBindGroup;
    private rasterBindGroup;
    private blitBindGroup;
    private needsRebuild;
    constructor(device: GPUDevice, options?: TiledRasterOptions);
    configure(config: GPURasterConfig): void;
    setUniforms(uniforms: GPURasterUniforms): void;
    execute(encoder: GPUCommandEncoder, colorTarget: GPUTextureView, depthTarget?: GPUTextureView, clearColor?: GPUColor, loadOp?: GPULoadOp): void;
    destroy(): void;
    private createBindGroups;
    private destroyInternalBuffers;
}
