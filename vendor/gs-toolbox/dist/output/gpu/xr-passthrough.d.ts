import type { GPUOutputModule, GPUOutputConfig, GPUOutputUniforms, XRPassthroughOptions } from './types';
/**
 * GPU XR passthrough output module for Gaussian splatting.
 *
 * Outputs premultiplied-alpha Gaussian render without background compositing,
 * suitable for WebXR AR passthrough where the browser compositor blends the
 * result over the camera feed.
 *
 * @example
 * ```typescript
 * const xrOutput = new XRPassthroughOutputModule(device);
 *
 * xrOutput.configure({
 *   buffers: { colorTexture: rasterOutput },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * xrOutput.setUniforms({
 *   viewportWidth: xrViewport.width,
 *   viewportHeight: xrViewport.height,
 *   opacity: 1.0,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * xrOutput.execute(encoder, xrLayerTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare class XRPassthroughOutputModule implements GPUOutputModule {
    readonly name = "XR Passthrough";
    private device;
    private shaderModule;
    private sampler;
    private uniformBuffer;
    private configured;
    private pipeline;
    private bindGroup;
    private currentFormat;
    private loadOp;
    constructor(device: GPUDevice, _options?: XRPassthroughOptions);
    configure(config: GPUOutputConfig): void;
    setUniforms(uniforms: GPUOutputUniforms): void;
    execute(encoder: GPUCommandEncoder, target: GPUTextureView): void;
    destroy(): void;
    private createPipeline;
    private createBindGroup;
}
