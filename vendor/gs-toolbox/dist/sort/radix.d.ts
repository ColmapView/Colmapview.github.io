export type RadixSortPasses = 1 | 2 | 4;
export interface RadixSortOptions {
    passes?: RadixSortPasses;
}
/**
 * Sort parallel u32 arrays by depth using LSB radix sort.
 * Reorders both `depths` and `indices` in-place.
 *
 * @param passes - Number of 8-bit passes: 1 (top 8 bits), 2 (top 16), 4 (full 32)
 */
export declare function radixSort(depths: Uint32Array, indices: Uint32Array, options?: RadixSortOptions): void;
/**
 * Non-destructive sort: returns a new Uint32Array of indices sorted by depth.
 * Does not modify the input `depths` array.
 *
 * @param depths - Keys to sort by
 * @param count - Number of elements to sort (defaults to depths.length)
 * @param passes - Number of 8-bit passes: 1 (top 8 bits), 2 (top 16), 4 (full 32)
 */
export declare function radixSortIndices(depths: Uint32Array, count?: number, options?: RadixSortOptions): Uint32Array;
