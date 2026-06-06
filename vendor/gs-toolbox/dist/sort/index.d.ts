import type { CPUSortModule, CPUSortAlgorithm } from './types';
export type { CPUSortConfig, CPUSortModule, CPUSortAlgorithm } from './types';
export type { RadixSortOptions, RadixSortPasses } from './radix';
export { radixSort, radixSortIndices } from './radix';
export { countingSort, countingSortIndices } from './counting';
export { comparisonSort, comparisonSortIndices } from './comparison';
export { createWasmSortModule } from './wasm/wrapper';
export type { WasmSortAlgorithm } from './wasm/wrapper';
export type { GPUSortCapabilities, GPUSortConfig, GPUSortIndirectConfig, GPUSortIndexFormat, GPUSortKeyFormat, GPUSortModule, GPUSortAlgorithm, GPUSortBuffers, } from './gpu';
export type { RadixSortOptions as GPURadixSortOptions, Radix4SortOptions as GPURadix4SortOptions, CountingSortOptions as GPUCountingSortOptions } from './gpu';
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
export declare function createCPUSortModule(algorithm: CPUSortAlgorithm): CPUSortModule;
