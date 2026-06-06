// Comparison sort — BigUint64Array.sort() with packed (depth, index) keys
// Matches Babylon.js approach: O(n log n), stable (TimSort), simple
/**
 * Sort parallel u32 arrays by depth using native BigUint64Array.sort().
 * Packs (depth, index) into BigInt64, sorts, then unpacks.
 * O(n log n), stable, leverages engine-optimized TimSort.
 *
 * Reorders both `depths` and `indices` in-place.
 */
export function comparisonSort(depths, indices) {
    const n = depths.length;
    if (n <= 1)
        return;
    if (indices.length !== n) {
        throw new Error(`depths.length (${n}) !== indices.length (${indices.length})`);
    }
    // Pack: high 32 bits = depth, low 32 bits = index
    const packed = new BigUint64Array(n);
    for (let i = 0; i < n; i++) {
        packed[i] = (BigInt(depths[i]) << 32n) | BigInt(indices[i]);
    }
    // Native sort (TimSort — stable)
    packed.sort();
    // Unpack
    for (let i = 0; i < n; i++) {
        depths[i] = Number(packed[i] >> 32n);
        indices[i] = Number(packed[i] & 0xffffffffn);
    }
}
/**
 * Non-destructive comparison sort: returns sorted index array.
 */
export function comparisonSortIndices(depths, count) {
    const n = count ?? depths.length;
    if (n === 0)
        return new Uint32Array(0);
    if (n > depths.length) {
        throw new Error(`count (${n}) > depths.length (${depths.length})`);
    }
    const d = depths.slice(0, n);
    const indices = new Uint32Array(n);
    for (let i = 0; i < n; i++)
        indices[i] = i;
    comparisonSort(d, indices);
    return indices;
}
