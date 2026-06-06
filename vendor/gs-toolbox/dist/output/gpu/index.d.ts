export type { GPUOutputConfig, GPUOutputModule, GPUOutputAlgorithm, GPUOutputBuffers, GPUOutputUniforms, GPUCompositeUniforms, GPUDofUniforms, GPUXRPassthroughUniforms, GPUSideBySideUniforms, XRPassthroughOptions, SideBySideOptions, } from './types';
export { CompositeOutputModule } from './composite';
export type { CompositeOutputOptions } from './composite';
export { DofOutputModule } from './dof';
export type { DofOutputOptions } from './dof';
export { XRPassthroughOutputModule } from './xr-passthrough';
export { SideBySideOutputModule } from './side-by-side';
import type { GPUOutputAlgorithm, GPUOutputModule } from './types';
/**
 * Create a GPU output module for the given algorithm.
 *
 * All returned modules implement `GPUOutputModule` and can be used interchangeably
 * in a rendering pipeline. The caller must call `configure()` then `setUniforms()`
 * before `execute()`.
 *
 * | Algorithm        | Description                                    |
 * |-----------------|------------------------------------------------|
 * | `composite`     | Background compositing (solid color or texture)|
 * | `dof`           | Depth-of-field blur post-processing            |
 * | `xr-passthrough`| AR passthrough (preserves alpha, no background)|
 * | `side-by-side`  | Stereo side-by-side (left + right eye)         |
 *
 * @param algorithm - Output algorithm identifier
 * @param device - WebGPU device for creating pipelines and textures
 * @returns A configured GPUOutputModule ready for `configure()` + `execute()`
 *
 * @example
 * ```typescript
 * const output = createGPUOutputModule('composite', device);
 * output.configure({
 *   buffers: { colorTexture: rasterOutput },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * output.setUniforms({ viewportWidth: 1920, viewportHeight: 1080 });
 * const encoder = device.createCommandEncoder();
 * output.execute(encoder, canvasTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare function createGPUOutputModule(algorithm: GPUOutputAlgorithm, device: GPUDevice): GPUOutputModule;
