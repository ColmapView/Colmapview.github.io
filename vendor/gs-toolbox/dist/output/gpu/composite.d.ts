import type { GPUOutputModule, GPUOutputConfig, GPUOutputUniforms } from './types';
/**
 * Options for creating a CompositeOutputModule.
 */
export interface CompositeOutputOptions {
}
/**
 * GPU composite output module for Gaussian splatting.
 *
 * Composites premultiplied-alpha Gaussian output over a background,
 * producing the final image for display.
 *
 * @example
 * ```typescript
 * const composite = new CompositeOutputModule(device);
 *
 * composite.configure({
 *   buffers: { colorTexture: rasterOutput },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * composite.setUniforms({
 *   viewportWidth: canvas.width,
 *   viewportHeight: canvas.height,
 *   backgroundColor: [0.1, 0.1, 0.1, 1.0],
 * });
 *
 * const encoder = device.createCommandEncoder();
 * composite.execute(encoder, canvasTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare class CompositeOutputModule implements GPUOutputModule {
    readonly name = "Composite";
    private device;
    private shaderModule;
    private sampler;
    private uniformBuffer;
    private fallbackBackgroundTexture;
    private fallbackDepthTexture;
    private configured;
    private pipeline;
    private bindGroup;
    private currentFormat;
    constructor(device: GPUDevice, _options?: CompositeOutputOptions);
    configure(config: GPUOutputConfig): void;
    setUniforms(uniforms: GPUOutputUniforms): void;
    execute(encoder: GPUCommandEncoder, target: GPUTextureView): void;
    destroy(): void;
    private createPipeline;
    private createBindGroup;
}
