// GPU Output Module Factory
// =========================
// Creates GPU output/post-processing modules by algorithm name.
// All algorithms implement the GPUOutputModule interface for drop-in swapping.
export { CompositeOutputModule } from './composite';
export { DofOutputModule } from './dof';
export { XRPassthroughOutputModule } from './xr-passthrough';
export { SideBySideOutputModule } from './side-by-side';
import { CompositeOutputModule } from './composite';
import { DofOutputModule } from './dof';
import { XRPassthroughOutputModule } from './xr-passthrough';
import { SideBySideOutputModule } from './side-by-side';
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
export function createGPUOutputModule(algorithm, device) {
    switch (algorithm) {
        case 'composite':
            return new CompositeOutputModule(device);
        case 'dof':
            return new DofOutputModule(device);
        case 'xr-passthrough':
            return new XRPassthroughOutputModule(device);
        case 'side-by-side':
            return new SideBySideOutputModule(device);
    }
}
