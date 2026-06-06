/**
 * Configuration for CPU sort operations.
 *
 * Both `depths` and `indices` are reordered in-place by the sort.
 * After sorting, `depths` is in ascending order and `indices[i]` contains
 * the original Gaussian index that had `depths[i]`.
 */
export interface CPUSortConfig {
    /** Number of elements to sort (may be less than array length) */
    count: number;
    /** u32 quantized depths — reordered in-place to ascending order */
    depths: Uint32Array;
    /** u32 Gaussian indices — reordered in-place to match sorted depths */
    indices: Uint32Array;
}
/**
 * Pluggable CPU sort module interface.
 *
 * All CPU sort algorithms implement this interface, allowing callers to swap
 * algorithms without changing other code.
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
export interface CPUSortModule {
    /** Human-readable name (e.g. "radix", "counting", "wasm-radix") */
    readonly name: string;
    /** Sort depths and indices in-place. */
    sort(config: CPUSortConfig): void;
}
/**
 * Available CPU sort algorithm identifiers.
 *
 * | Algorithm     | Time      | Stable | Precision | Notes                          |
 * |---------------|-----------|--------|-----------|--------------------------------|
 * | `radix`       | O(n)      | Yes    | Exact 32b | 4-pass LSB radix sort          |
 * | `radix-16bit` | O(n)      | Yes    | Top 16b   | 2-pass (bits 16-31)            |
 * | `radix-8bit`  | O(n)      | Yes    | Top 8b    | 1-pass (bits 24-31)            |
 * | `counting`    | O(n)      | No     | Top 16b   | 65536-bucket counting sort     |
 * | `comparison`  | O(n logn) | Yes    | Exact 32b | BigUint64Array.sort() (TimSort)|
 * | `wasm-radix`      | O(n)      | Yes    | Exact 32b | WASM 4-pass 8-bit radix        |
 * | `wasm-radix-16bit`| O(n)      | Yes    | Top 16b   | WASM 2-pass 8-bit radix        |
 * | `wasm-radix-8bit` | O(n)      | Yes    | Top 8b    | WASM 1-pass 8-bit radix        |
 * | `wasm-counting`   | O(n)      | No     | Top 16b   | WASM single-pass counting      |
 *
 * Use `createCPUSortModule()` for sync algorithms.
 * Use `createWasmSortModule()` for the async WASM variants.
 */
export type CPUSortAlgorithm = 'radix' | 'radix-16bit' | 'radix-8bit' | 'counting' | 'comparison' | 'wasm-radix' | 'wasm-radix-16bit' | 'wasm-radix-8bit' | 'wasm-counting';
