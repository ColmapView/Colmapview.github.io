import type { GPURasterModule, GPURasterConfig, GPURasterUniforms, BlendDirection } from './types';
/**
 * Options for creating a BillboardRasterModule.
 */
export interface BillboardRasterOptions {
    /** Blend compositing direction (default: 'front-to-back'). */
    blend?: BlendDirection;
}
/**
 * GPU billboard rasterization module for Gaussian splatting.
 *
 * Draws Gaussians as instanced screen-aligned quads with 2D Gaussian falloff.
 * Supports front-to-back ("under") and back-to-front ("over") alpha blending.
 *
 * @example
 * ```typescript
 * // Front-to-back (pairs with ascending radix sort)
 * const raster = new BillboardRasterModule(device, { blend: 'front-to-back' });
 *
 * raster.configure({
 *   count: gaussianCount,
 *   buffers: { sortedIndices: indexBuf, splatData: splatBuf },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * raster.setUniforms({
 *   viewportWidth: canvas.width,
 *   viewportHeight: canvas.height,
 *   nearPlane: 0.1,
 *   farPlane: 100,
 *   numGaussians: activeCount,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * raster.execute(encoder, colorTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare class BillboardRasterModule implements GPURasterModule {
    readonly name: string;
    private device;
    private blend;
    private reverseSort;
    private shaderModule;
    private uniformBuffer;
    private configured;
    private count;
    private pipeline;
    private bindGroup;
    private currentFormat;
    private currentDepthFormat;
    constructor(device: GPUDevice, options?: BillboardRasterOptions);
    configure(config: GPURasterConfig): void;
    setUniforms(uniforms: GPURasterUniforms): void;
    execute(encoder: GPUCommandEncoder, colorTarget: GPUTextureView, depthTarget?: GPUTextureView, clearColor?: GPUColor, loadOp?: GPULoadOp): void;
    destroy(): void;
    private createPipeline;
    private createBindGroup;
    private getBlendState;
}
