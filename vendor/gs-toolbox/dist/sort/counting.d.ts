/**
 * Sort parallel u32 arrays by depth using 65536-bucket counting sort.
 * Uses the top 16 bits of each depth value as the bucket key.
 * O(n) time, unstable within same-bucket elements.
 *
 * Reorders both `depths` and `indices` in-place.
 */
export declare function countingSort(depths: Uint32Array, indices: Uint32Array): void;
/**
 * Non-destructive counting sort: returns sorted index array.
 */
export declare function countingSortIndices(depths: Uint32Array, count?: number): Uint32Array;
