// CPU LSB radix sort — mirrors GPU radix sort parameterization (1/2/4 passes)
/**
 * Sort parallel u32 arrays by depth using LSB radix sort.
 * Reorders both `depths` and `indices` in-place.
 *
 * @param passes - Number of 8-bit passes: 1 (top 8 bits), 2 (top 16), 4 (full 32)
 */
export function radixSort(depths, indices, options) {
    const n = depths.length;
    if (n <= 1)
        return;
    if (indices.length !== n) {
        throw new Error(`depths.length (${n}) !== indices.length (${indices.length})`);
    }
    const passes = options?.passes ?? 4;
    const startShift = (4 - passes) * 8;
    // Ping-pong buffers (copy input so both buffers have same type)
    const buf0D = new Uint32Array(n);
    const buf0I = new Uint32Array(n);
    const buf1D = new Uint32Array(n);
    const buf1I = new Uint32Array(n);
    buf0D.set(depths);
    buf0I.set(indices);
    let srcD = buf0D;
    let srcI = buf0I;
    let dstD = buf1D;
    let dstI = buf1I;
    const histogram = new Uint32Array(256);
    for (let p = 0; p < passes; p++) {
        const shift = startShift + p * 8;
        // Histogram
        histogram.fill(0);
        for (let i = 0; i < n; i++) {
            histogram[(srcD[i] >>> shift) & 0xFF]++;
        }
        // Exclusive prefix sum
        let sum = 0;
        for (let i = 0; i < 256; i++) {
            const count = histogram[i];
            histogram[i] = sum;
            sum += count;
        }
        // Scatter
        for (let i = 0; i < n; i++) {
            const digit = (srcD[i] >>> shift) & 0xFF;
            const pos = histogram[digit]++;
            dstD[pos] = srcD[i];
            dstI[pos] = srcI[i];
        }
        // Swap src/dst
        const tmpD = srcD;
        srcD = dstD;
        dstD = tmpD;
        const tmpI = srcI;
        srcI = dstI;
        dstI = tmpI;
    }
    // Copy result back to original arrays
    for (let i = 0; i < n; i++) {
        depths[i] = srcD[i];
        indices[i] = srcI[i];
    }
}
/**
 * Non-destructive sort: returns a new Uint32Array of indices sorted by depth.
 * Does not modify the input `depths` array.
 *
 * @param depths - Keys to sort by
 * @param count - Number of elements to sort (defaults to depths.length)
 * @param passes - Number of 8-bit passes: 1 (top 8 bits), 2 (top 16), 4 (full 32)
 */
export function radixSortIndices(depths, count, options) {
    const n = count ?? depths.length;
    if (n === 0)
        return new Uint32Array(0);
    if (n > depths.length) {
        throw new Error(`count (${n}) > depths.length (${depths.length})`);
    }
    // Copy so we don't mutate the input
    const d = depths.slice(0, n);
    const indices = new Uint32Array(n);
    for (let i = 0; i < n; i++)
        indices[i] = i;
    radixSort(d, indices, options);
    return indices;
}
