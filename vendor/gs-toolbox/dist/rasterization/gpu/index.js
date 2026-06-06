// GPU Rasterization Module Factory
// =================================
// Creates GPU rasterization modules by algorithm name.
// All algorithms implement the GPURasterModule interface for drop-in swapping.
export { BillboardRasterModule } from './billboard';
export { TiledRasterModule } from './tiled';
export { StochasticRasterModule } from './stochastic';
export { executeTensorRasterizationGPU, renderToTensorsGPU, rasterizationGPU, requestWebGPUDevice, prepareTensorRasterizationInputsCPU, prepareTensorRasterizationGPUInputs, tensorRasterShaderSource, } from './tensor';
import { BillboardRasterModule } from './billboard';
import { TiledRasterModule } from './tiled';
import { StochasticRasterModule } from './stochastic';
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
export function createGPURasterModule(algorithm, device) {
    switch (algorithm) {
        case 'billboard-ftb':
            return new BillboardRasterModule(device, { blend: 'front-to-back' });
        case 'billboard-btf':
            return new BillboardRasterModule(device, { blend: 'back-to-front' });
        case 'tiled':
            return new TiledRasterModule(device);
        case 'stochastic':
            return new StochasticRasterModule(device);
    }
}
