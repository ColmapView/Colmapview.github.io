import type { GPURasterModule, GPURasterConfig, GPURasterUniforms } from './types';
/**
 * GPU stochastic rasterization module for Gaussian splatting.
 *
 * Uses PCG hash stochastic alpha test with hardware depth testing instead
 * of sorted alpha blending. Produces noisy but sort-order-independent results
 * that converge with temporal accumulation.
 *
 * @example
 * ```typescript
 * const raster = new StochasticRasterModule(device);
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
 *   projMatrix: projMat,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * raster.execute(encoder, colorTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare class StochasticRasterModule implements GPURasterModule {
    readonly name = "Stochastic";
    private device;
    private shaderModule;
    private uniformBuffer;
    private configured;
    private count;
    private pipeline;
    private bindGroup;
    private currentFormat;
    private currentDepthFormat;
    private internalDepthTexture;
    private internalDepthWidth;
    private internalDepthHeight;
    private frameCounter;
    private viewportWidth;
    private viewportHeight;
    constructor(device: GPUDevice);
    configure(config: GPURasterConfig): void;
    setUniforms(uniforms: GPURasterUniforms): void;
    execute(encoder: GPUCommandEncoder, colorTarget: GPUTextureView, depthTarget?: GPUTextureView, clearColor?: GPUColor, loadOp?: GPULoadOp): void;
    destroy(): void;
    private createPipeline;
    private createBindGroup;
    private internalDepthView;
    private ensureInternalDepthTexture;
}
