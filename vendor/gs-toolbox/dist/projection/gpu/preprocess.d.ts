import type { GPUProjectionModule, GPUProjectionConfig, GPUProjectionUniforms } from './types';
/**
 * Options for creating a PreprocessProjectionModule.
 */
export interface PreprocessProjectionOptions {
}
/**
 * GPU preprocess projection module for Gaussian splatting.
 *
 * Transforms raw Gaussian data into screen-space SplatData (48 bytes each),
 * quantized u32 depths for radix sort, and initialized indices [0..N).
 *
 * @example
 * ```typescript
 * const proj = new PreprocessProjectionModule(device);
 *
 * proj.configure({
 *   count: gaussianCount,
 *   buffers: { gaussians: gaussianBuf, splatData: splatBuf, depths: depthBuf, indices: indexBuf },
 * });
 *
 * // Each frame:
 * proj.setUniforms({
 *   viewMatrix, projMatrix,
 *   viewportWidth: canvas.width, viewportHeight: canvas.height,
 *   focalX, focalY, camPos: [x, y, z],
 *   shDegree: 0, nearPlane: 0.1, farPlane: 100,
 *   numGaussians: count,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * proj.execute(encoder);
 * // ... sort pass ...
 * // ... render pass ...
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare class PreprocessProjectionModule implements GPUProjectionModule {
    readonly name = "Preprocess";
    private device;
    private shaderModule;
    private pipeline;
    private uniformBuffer;
    private dummySHBuffer;
    private configured;
    private count;
    private bindGroup;
    constructor(device: GPUDevice, _options?: PreprocessProjectionOptions);
    configure(config: GPUProjectionConfig): void;
    setUniforms(uniforms: GPUProjectionUniforms): void;
    execute(encoder: GPUCommandEncoder): void;
    destroy(): void;
}
