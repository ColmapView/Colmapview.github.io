export type { GPURasterConfig, GPURasterModule, GPURasterAlgorithm, GPURasterBuffers, GPURasterUniforms, BlendDirection, RenderMode, } from './types';
export { BillboardRasterModule } from './billboard';
export type { BillboardRasterOptions } from './billboard';
export { TiledRasterModule } from './tiled';
export type { TiledRasterOptions } from './tiled';
export { StochasticRasterModule } from './stochastic';
export type { TensorRasterizationGPUOptions, PreparedTensorRasterizationInputsCPU, PreparedTensorRasterizationGPUInputs, } from './tensor';
export { executeTensorRasterizationGPU, renderToTensorsGPU, rasterizationGPU, requestWebGPUDevice, prepareTensorRasterizationInputsCPU, prepareTensorRasterizationGPUInputs, tensorRasterShaderSource, } from './tensor';
import type { GPURasterAlgorithm, GPURasterModule } from './types';
/**
 * Create a GPU rasterization module for the given algorithm.
 *
 * All returned modules implement `GPURasterModule` and can be used interchangeably
 * in a rendering pipeline. The caller must call `configure()` then `setUniforms()`
 * before `execute()`.
 *
 * | Algorithm        | Blend Direction   | Description                        |
 * |------------------|-------------------|------------------------------------|
 * | `billboard-ftb`  | Front-to-back     | "Under" compositing, natural sort  |
 * | `billboard-btf`  | Back-to-front     | "Over" compositing, reversed read  |
 * | `tiled`          | Front-to-back     | Compute tiled, internal sort       |
 * | `stochastic`     | None (depth test) | PCG hash stochastic discard        |
 *
 * @param algorithm - Rasterization algorithm identifier
 * @param device - WebGPU device for creating pipelines and buffers
 * @returns A configured GPURasterModule ready for `configure()` + `execute()`
 *
 * @example
 * ```typescript
 * const raster = createGPURasterModule('billboard-ftb', device);
 * raster.configure({
 *   count: gaussianCount,
 *   buffers: { sortedIndices: indexBuf, splatData: splatBuf },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * raster.setUniforms({ viewportWidth: 1920, viewportHeight: 1080, nearPlane: 0.1, farPlane: 100, numGaussians: count });
 * const encoder = device.createCommandEncoder();
 * raster.execute(encoder, colorTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export declare function createGPURasterModule(algorithm: GPURasterAlgorithm, device: GPUDevice): GPURasterModule;
