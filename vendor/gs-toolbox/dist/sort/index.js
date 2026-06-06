// Sort — CPU + GPU sort implementations for Gaussian depth ordering
// ================================================================
//
// This module provides pluggable sort algorithms for ordering Gaussians by depth.
// Both CPU and GPU implementations share the same pattern:
//   1. Factory creates a module: createCPUSortModule() or createGPUSortModule()
//   2. Module sorts parallel (depths, indices) arrays in ascending depth order
//   3. Sorted indices used to draw Gaussians front-to-back for alpha blending
//
// CPU sorts operate on Uint32Array typed arrays (for Web Workers or Node).
// GPU sorts operate on GPUBuffer pairs via WebGPU compute shaders.
import { radixSort } from './radix';
import { countingSort } from './counting';
import { comparisonSort } from './comparison';
export { radixSort, radixSortIndices } from './radix';
export { countingSort, countingSortIndices } from './counting';
export { comparisonSort, comparisonSortIndices } from './comparison';
export async function createWasmSortModule() {
    throw new Error('WASM sort modules are not included in this vendored gs-toolbox build');
}
export { UnsupportedGPUSortCapabilityError, createGPUSortModule, getGPUSortAlgorithmCapabilities, getWorkgroupCounts, nextPowerOf2, supportsIndirectGPUSort, } from './gpu';
export { RadixSortModule, Radix4BitSortModule, BitonicSortModule, CountingSortModule } from './gpu';
/**
 * Create a CPU sort module for the given algorithm.
 *
 * All returned modules implement `CPUSortModule` and sort parallel u32 arrays
 * (depths + indices) in-place. After sorting, depths are in ascending order and
 * indices[i] contains the original Gaussian index for that depth.
 *
 * | Algorithm     | Time      | Stable | Precision | Notes                          |
 * |---------------|-----------|--------|-----------|--------------------------------|
 * | `radix`       | O(n)      | Yes    | Exact 32b | 4-pass 32-bit LSB radix        |
 * | `radix-16bit` | O(n)      | Yes    | Top 16b   | 2-pass (bits 16-31 only)       |
 * | `radix-8bit`  | O(n)      | Yes    | Top 8b    | 1-pass (bits 24-31 only)       |
 * | `counting`    | O(n)      | No     | Top 16b   | 65536-bucket, top 16 bits      |
 * | `comparison`  | O(n logn) | Yes    | Exact 32b | BigUint64Array.sort() (TimSort)|
 *
 * For the WASM variant (`wasm-radix`), use `createWasmSortModule()` instead
 * (requires async initialization).
 *
 * @param algorithm - Sort algorithm identifier
 * @returns A CPUSortModule ready to call `.sort()`
 * @throws {Error} For unknown algorithms or `wasm-radix` (use async factory)
 *
 * @example
 * ```typescript
 * const sort = createCPUSortModule('radix');
 * const depths = new Uint32Array([300, 100, 200]);
 * const indices = new Uint32Array([0, 1, 2]);
 * sort.sort({ count: 3, depths, indices });
 * // depths: [100, 200, 300], indices: [1, 2, 0]
 * ```
 */
export function createCPUSortModule(algorithm) {
    switch (algorithm) {
        case 'radix':
            return {
                name: 'radix',
                sort(config) {
                    const { depths, indices } = sliceToCount(config);
                    radixSort(depths, indices, { passes: 4 });
                },
            };
        case 'radix-16bit':
            return {
                name: 'radix-16bit',
                sort(config) {
                    const { depths, indices } = sliceToCount(config);
                    radixSort(depths, indices, { passes: 2 });
                },
            };
        case 'radix-8bit':
            return {
                name: 'radix-8bit',
                sort(config) {
                    const { depths, indices } = sliceToCount(config);
                    radixSort(depths, indices, { passes: 1 });
                },
            };
        case 'counting':
            return {
                name: 'counting',
                sort(config) {
                    const { depths, indices } = sliceToCount(config);
                    countingSort(depths, indices);
                },
            };
        case 'comparison':
            return {
                name: 'comparison',
                sort(config) {
                    const { depths, indices } = sliceToCount(config);
                    comparisonSort(depths, indices);
                },
            };
        case 'wasm-radix':
        case 'wasm-radix-16bit':
        case 'wasm-radix-8bit':
        case 'wasm-counting':
            throw new Error("WASM sort requires async init. Use createWasmSortModule() instead of createCPUSortModule()");
        default:
            throw new Error(`Unknown sort algorithm: ${algorithm}`);
    }
}
/**
 * When config.count < array length, return subarrays of the correct size.
 * Raw sort functions use depths.length, so we must trim to count.
 * The subarray shares the same underlying buffer, so in-place sorting
 * modifies the original arrays for elements [0..count).
 */
function sliceToCount(config) {
    const { count, depths, indices } = config;
    if (count >= depths.length)
        return { depths, indices };
    return {
        depths: depths.subarray(0, count),
        indices: indices.subarray(0, count),
    };
}
