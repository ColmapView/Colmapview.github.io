// Counting sort — 65536-bucket sort on top 16 bits of depth
// Matches gsplat.js approach: O(n), single pass, unstable within buckets
/**
 * Sort parallel u32 arrays by depth using 65536-bucket counting sort.
 * Uses the top 16 bits of each depth value as the bucket key.
 * O(n) time, unstable within same-bucket elements.
 *
 * Reorders both `depths` and `indices` in-place.
 */
export function countingSort(depths, indices) {
    const n = depths.length;
    if (n <= 1)
        return;
    if (indices.length !== n) {
        throw new Error(`depths.length (${n}) !== indices.length (${indices.length})`);
    }
    const BUCKETS = 65536;
    // Histogram: count elements per bucket (top 16 bits)
    const histogram = new Uint32Array(BUCKETS);
    for (let i = 0; i < n; i++) {
        histogram[depths[i] >>> 16]++;
    }
    // Exclusive prefix sum
    let sum = 0;
    for (let i = 0; i < BUCKETS; i++) {
        const count = histogram[i];
        histogram[i] = sum;
        sum += count;
    }
    // Scatter into output buffers
    const outD = new Uint32Array(n);
    const outI = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        const bucket = depths[i] >>> 16;
        const pos = histogram[bucket]++;
        outD[pos] = depths[i];
        outI[pos] = indices[i];
    }
    // Copy back
    depths.set(outD);
    indices.set(outI);
}
/**
 * Non-destructive counting sort: returns sorted index array.
 */
export function countingSortIndices(depths, count) {
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
    countingSort(d, indices);
    return indices;
}
