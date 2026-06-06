/**
 * Sort parallel u32 arrays by depth using native BigUint64Array.sort().
 * Packs (depth, index) into BigInt64, sorts, then unpacks.
 * O(n log n), stable, leverages engine-optimized TimSort.
 *
 * Reorders both `depths` and `indices` in-place.
 */
export declare function comparisonSort(depths: Uint32Array, indices: Uint32Array): void;
/**
 * Non-destructive comparison sort: returns sorted index array.
 */
export declare function comparisonSortIndices(depths: Uint32Array, count?: number): Uint32Array;
