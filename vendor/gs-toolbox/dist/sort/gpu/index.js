// GPU Sort Module Factory
// =======================
// Creates GPU sort modules by algorithm name.
// All algorithms implement the GPUSortModule interface for drop-in swapping.
export { UnsupportedGPUSortCapabilityError, getGPUSortAlgorithmCapabilities, getWorkgroupCounts, nextPowerOf2, supportsIndirectGPUSort, } from './types';
export { RadixSortModule } from './radix-sort';
export { Radix4BitSortModule } from './radix4-sort';
export { BitonicSortModule } from './bitonic-sort';
export { CountingSortModule } from './counting-sort';
import { RadixSortModule } from './radix-sort';
import { Radix4BitSortModule } from './radix4-sort';
import { BitonicSortModule } from './bitonic-sort';
import { CountingSortModule } from './counting-sort';
/**
 * Create a GPU sort module for the given algorithm.
 *
 * All returned modules implement `GPUSortModule` and can be used interchangeably
 * in a rendering pipeline. The caller must call `configure()` before executing
 * a fixed-count or indirect-count sort.
 *
 * Algorithm guide:
 *
 * | Algorithm        | Best for                          | Exact? | Dispatches |
 * |------------------|-----------------------------------|--------|------------|
 * | `radix`          | Scenes needing exact depth order  | Yes    | 12         |
 * | `radix-16bit`    | Most scenes (best speed/quality)  | Top 16 | 6          |
 * | `radix-8bit`     | Low-precision fast sort           | Top 8  | 3          |
 * | `radix4`         | 4-bit variant, exact depth order  | Yes    | 24         |
 * | `radix4-16bit`   | 4-bit variant, top 16 bits        | Top 16 | 12         |
 * | `radix4-8bit`    | 4-bit variant, top 8 bits         | Top 8  | 6          |
 * | `bitonic`        | Small scenes, no extra buffers    | Yes    | O(log^2 n) |
 * | `counting`       | Fastest at small sizes            | Top 16 | 3          |
 * | `counting-32bit` | Not recommended (use `radix`)     | ~Approx| 6          |
 *
 * @param algorithm - Sort algorithm identifier
 * @param device - WebGPU device for creating pipelines and buffers
 * @returns A GPUSortModule ready for `configure()` + `executeFixed()` or `executeIndirect()`
 *
 * @example
 * ```typescript
 * const sort = createGPUSortModule('radix-16bit', device);
 * sort.configure({ count: 100000, buffers: { depth: depthBuf, index: indexBuf } });
 *
 * // Each frame:
 * const encoder = device.createCommandEncoder();
 * if (sort.capabilities.indirectCount) {
 *   sort.executeIndirect(encoder, { countBuffer: visibleCountBuffer, maxCount: 100000 });
 * } else {
 *   sort.executeFixed(encoder);
 * }
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export function createGPUSortModule(algorithm, device) {
    switch (algorithm) {
        case 'radix':
            return new RadixSortModule(device);
        case 'radix-16bit':
            return new RadixSortModule(device, { passes: 2, startShift: 16 });
        case 'radix-8bit':
            return new RadixSortModule(device, { passes: 1, startShift: 24 });
        case 'radix4':
            return new Radix4BitSortModule(device);
        case 'radix4-16bit':
            return new Radix4BitSortModule(device, { passes: 4, startShift: 16 });
        case 'radix4-8bit':
            return new Radix4BitSortModule(device, { passes: 2, startShift: 24 });
        case 'bitonic':
            return new BitonicSortModule(device);
        case 'counting':
            return new CountingSortModule(device);
        case 'counting-32bit':
            return new CountingSortModule(device, { passes: 2 });
    }
}
