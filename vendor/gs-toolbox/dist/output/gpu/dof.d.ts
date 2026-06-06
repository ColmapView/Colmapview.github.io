import type { GPUOutputModule, GPUOutputConfig, GPUOutputUniforms } from './types';
/**
 * Options for creating a DofOutputModule.
 */
export interface DofOutputOptions {
    /** Number of blur taps per direction (default: 9). Must be odd. */
    taps?: number;
}
/**
 * GPU depth-of-field output module for Gaussian splatting.
 *
 * Applies separable circle-of-confusion blur as a two-pass post-process.
 * Requires a depth texture from the rasterization stage.
 *
 * @example
 * ```typescript
 * const dof = new DofOutputModule(device);
 *
 * dof.configure({
 *   buffers: { colorTexture: rasterColor, depthTexture: rasterDepth },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * dof.setUniforms({
 *   viewportWidth: canvas.width,
 *   viewportHeight: canvas.height,
 *   focalDistance: 5.0,
 *   aperture: 0.05,
 *   nearPlane: 0.1,
 *   farPlane: 100.0,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * dof.execute(encoder, canvasTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare class DofOutputModule implements GPUOutputModule {
    readonly name = "Depth of Field";
    private device;
    private shaderModule;
    private sampler;
    private uniformBufferH;
    private uniformBufferV;
    private configured;
    private pipeline;
    private horizontalBindGroup;
    private verticalBindGroup;
    private intermediateTexture;
    private currentFormat;
    private currentWidth;
    private currentHeight;
    private depthTextureView;
    private dummyDepthTexture;
    private dummyDepthView;
    constructor(device: GPUDevice, _options?: DofOutputOptions);
    configure(config: GPUOutputConfig): void;
    setUniforms(uniforms: GPUOutputUniforms): void;
    execute(encoder: GPUCommandEncoder, target: GPUTextureView): void;
    destroy(): void;
    private createPipeline;
    private createBindGroups;
}
