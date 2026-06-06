export type { GPUProjectionConfig, GPUProjectionModule, GPUProjectionAlgorithm, GPUProjectionBuffers, GPUProjectionUniforms, CameraModel, } from './types';
export { PreprocessProjectionModule } from './preprocess';
export type { PreprocessProjectionOptions } from './preprocess';
import type { GPUProjectionAlgorithm, GPUProjectionModule } from './types';
/**
 * Create a GPU projection module for the given algorithm.
 *
 * All returned modules implement `GPUProjectionModule` and can be used
 * interchangeably in a rendering pipeline. The caller must call `configure()`
 * then `setUniforms()` before `execute()`.
 *
 * | Algorithm      | Description                                              |
 * |----------------|----------------------------------------------------------|
 * | `preprocess`   | Full preprocess: projection, SH eval, cov2D, AA, cull   |
 *
 * @param algorithm - Projection algorithm identifier
 * @param device - WebGPU device for creating pipelines and buffers
 * @returns A configured GPUProjectionModule ready for `configure()` + `execute()`
 *
 * @example
 * ```typescript
 * const proj = createGPUProjectionModule('preprocess', device);
 * proj.configure({
 *   count: gaussianCount,
 *   buffers: { gaussians, splatData, depths, indices },
 * });
 *
 * // Each frame:
 * proj.setUniforms({ viewMatrix, projMatrix, viewportWidth: 1920, ... });
 * const encoder = device.createCommandEncoder();
 * proj.execute(encoder);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare function createGPUProjectionModule(algorithm: GPUProjectionAlgorithm, device: GPUDevice): GPUProjectionModule;
