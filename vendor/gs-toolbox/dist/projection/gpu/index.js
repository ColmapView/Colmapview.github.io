// GPU Projection Module Factory
// ==============================
// Creates GPU projection modules by algorithm name.
// All algorithms implement the GPUProjectionModule interface for drop-in swapping.
export { PreprocessProjectionModule } from './preprocess';
import { PreprocessProjectionModule } from './preprocess';
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
export function createGPUProjectionModule(algorithm, device) {
    switch (algorithm) {
        case 'preprocess':
            return new PreprocessProjectionModule(device);
    }
}
