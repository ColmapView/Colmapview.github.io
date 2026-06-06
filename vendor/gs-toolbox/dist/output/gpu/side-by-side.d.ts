import type { GPUOutputModule, GPUOutputConfig, GPUOutputUniforms, SideBySideOptions } from './types';
/**
 * GPU side-by-side stereo output module for Gaussian splatting.
 *
 * Renders left and right eye color textures side-by-side into a single target.
 * Requires `colorTexture` (left eye) and `colorTextureRight` (right eye) in
 * the output buffers.
 *
 * @example
 * ```typescript
 * const stereo = new SideBySideOutputModule(device);
 *
 * stereo.configure({
 *   buffers: {
 *     colorTexture: leftEyeRaster,       // Left eye
 *     colorTextureRight: rightEyeRaster,  // Right eye
 *   },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * stereo.setUniforms({
 *   viewportWidth: canvas.width,
 *   viewportHeight: canvas.height,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * stereo.execute(encoder, canvasTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare class SideBySideOutputModule implements GPUOutputModule {
    readonly name = "Side-by-Side Stereo";
    private device;
    private shaderModule;
    private sampler;
    private uniformBuffer;
    private fallbackMode;
    private fallbackTexture;
    private configured;
    private pipeline;
    private bindGroup;
    private currentFormat;
    constructor(device: GPUDevice, options?: SideBySideOptions);
    configure(config: GPUOutputConfig): void;
    setUniforms(uniforms: GPUOutputUniforms): void;
    execute(encoder: GPUCommandEncoder, target: GPUTextureView): void;
    destroy(): void;
    private createPipeline;
    private createBindGroup;
}
