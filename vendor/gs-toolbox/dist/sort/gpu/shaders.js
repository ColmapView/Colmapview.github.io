// GPU Sort Shaders
// =================
// All WGSL shader sources embedded as string constants.
// This avoids bundler-specific ?raw imports and works with plain tsc.
// ---- Radix Sort Shaders ----
export const radixHistogramSource = /* wgsl */ `
// Radix Sort - Histogram Pass
// ============================
// Part 1 of 3-stage radix sort (histogram -> scan -> scatter)
//
// Purpose: Count occurrences of each 8-bit digit (0-255) within each workgroup's
// portion of the data. These local histograms are later combined by the scan pass.
//
// Algorithm:
// 1. Each workgroup processes a contiguous chunk of elements
// 2. Threads collaboratively count digits using shared memory atomics
// 3. Final histogram is written to global memory (256 counts per workgroup)
//
// Performance: O(n/numWorkgroups) per workgroup, highly parallel

struct Uniforms {
    count: u32,
    shift: u32,      // Bit shift for current pass (0, 8, 16, 24)
    numWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depths: array<u32>;
@group(0) @binding(1) var<storage, read_write> histograms: array<u32>;  // 256 * numWorkgroups
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

var<workgroup> localHistogram: array<atomic<u32>, 256>;

@compute
@workgroup_size(256)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    // Initialize local histogram
    atomicStore(&localHistogram[local_id.x], 0u);
    workgroupBarrier();

    // Each thread processes multiple elements
    let elementsPerWorkgroup = (uniforms.count + uniforms.numWorkgroups - 1u) / uniforms.numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, uniforms.count);

    // Count digits for this workgroup's elements
    var idx = startIdx + local_id.x;
    while (idx < endIdx) {
        let depth = depths[idx];
        let digit = (depth >> uniforms.shift) & 0xFFu;
        atomicAdd(&localHistogram[digit], 1u);
        idx += 256u;
    }

    workgroupBarrier();

    // Write local histogram to global memory
    let globalOffset = wg_id.x * 256u + local_id.x;
    histograms[globalOffset] = atomicLoad(&localHistogram[local_id.x]);
}
`;
export const radixScanSource = /* wgsl */ `
// Radix Sort - Prefix Sum (Scan) Pass
// =====================================
// Part 2 of 3-stage radix sort (histogram -> scan -> scatter)
//
// Algorithm: Blelloch Parallel Prefix Sum
// Source: Blelloch, G.E. "Prefix Sums and Their Applications" CMU-CS-90-190, 1990
// Reference: https://www.cs.cmu.edu/~guyb/papers/Ble93.pdf
//
// Purpose: Compute global write offsets for each digit by performing prefix sum
// across all workgroup histograms. This determines where each digit's elements
// should be placed in the final sorted order.
//
// Algorithm (Blelloch parallel scan):
// 1. Sum each digit's count across all workgroups (column sum)
// 2. Perform exclusive prefix sum across 256 digits
// 3. Add global offsets back to per-workgroup histograms
//
// After this pass, histograms[wg * 256 + digit] contains the global starting
// index for elements with that digit in that workgroup.
//
// Performance: O(numWorkgroups * 256), runs on single workgroup

struct Uniforms {
    numWorkgroups: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<storage, read_write> histograms: array<u32>;  // 256 * numWorkgroups
@group(0) @binding(1) var<storage, read_write> globalOffsets: array<u32>;  // 256 digit offsets
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

var<workgroup> temp: array<u32, 256>;

// Single workgroup processes all 256 digits
// Each digit sums its histogram across all workgroups
@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>
) {
    let digit = local_id.x;

    // Sum this digit's count across all workgroups
    var digitTotal = 0u;
    for (var wg = 0u; wg < uniforms.numWorkgroups; wg++) {
        let count = histograms[wg * 256u + digit];
        // Store prefix sum for this workgroup
        histograms[wg * 256u + digit] = digitTotal;
        digitTotal += count;
    }

    // Store digit total in shared memory
    temp[digit] = digitTotal;
    workgroupBarrier();

    // Parallel prefix sum across digits (Blelloch scan)
    // Up-sweep
    for (var stride = 1u; stride < 256u; stride *= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            temp[idx] += temp[idx - stride];
        }
        workgroupBarrier();
    }

    // Clear last element for exclusive scan
    if (digit == 255u) {
        temp[255u] = 0u;
    }
    workgroupBarrier();

    // Down-sweep
    for (var stride = 128u; stride > 0u; stride /= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            let t = temp[idx - stride];
            temp[idx - stride] = temp[idx];
            temp[idx] += t;
        }
        workgroupBarrier();
    }

    // Write global offset for this digit
    globalOffsets[digit] = temp[digit];

    // Update histograms with global offsets
    for (var wg = 0u; wg < uniforms.numWorkgroups; wg++) {
        histograms[wg * 256u + digit] += temp[digit];
    }
}
`;
export const radixScatterSource = /* wgsl */ `
// Radix Sort - Stable Scatter Pass
// =================================
// Part 3 of 3-stage radix sort (histogram -> scan -> scatter)
//
// Purpose: Move each element from its source position to its sorted destination
// based on the offsets computed in the scan pass. Uses ping-pong buffers to
// avoid read/write conflicts.
//
// Stability: Uses countBefore (not atomicAdd) to compute destinations, ensuring
// elements with the same digit maintain their relative input order. This is
// critical for multi-pass radix sort correctness.
//
// Algorithm:
// 1. Load pre-computed offsets for this workgroup into shared memory
// 2. For each batch of 256 elements:
//    a. Load elements, compute digit, store digit in shared memory
//    b. Each thread counts same-digit predecessors (countBefore) for stable position
//    c. destIdx = baseOffset[digit] + countBefore (deterministic, stable)
//    d. Write to global output
//    e. Update baseOffset for next batch
//
// Performance: O(n/numWorkgroups) per workgroup

struct Uniforms {
    count: u32,
    shift: u32,
    numWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<storage, read_write> histograms: array<u32>;  // Pre-computed offsets per workgroup
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

var<workgroup> localOffsets: array<u32, 256>;       // Running base offset per digit
var<workgroup> localDigits: array<u32, 256>;        // Digit per thread in current batch
var<workgroup> digitCounts: array<atomic<u32>, 256>; // Per-digit count in current batch

@compute
@workgroup_size(256)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    let tid = local_id.x;

    // Load workgroup's base offsets into shared memory
    localOffsets[tid] = histograms[wg_id.x * 256u + tid];
    workgroupBarrier();

    // Each workgroup processes a contiguous chunk
    let elementsPerWorkgroup = (uniforms.count + uniforms.numWorkgroups - 1u) / uniforms.numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, uniforms.count);

    // Process in batches of 256
    var batchStart = startIdx;
    while (batchStart < endIdx) {
        let batchEnd = min(batchStart + 256u, endIdx);
        let batchSize = batchEnd - batchStart;
        let idx = batchStart + tid;
        let inBounds = tid < batchSize;

        // Reset digit counts
        atomicStore(&digitCounts[tid], 0u);
        workgroupBarrier();

        // Step 1: Load element, compute digit, store in shared memory
        var depth = 0u;
        var origIdx = 0u;
        var digit = 0u;

        if (inBounds) {
            depth = depthsIn[idx];
            origIdx = indicesIn[idx];
            digit = (depth >> uniforms.shift) & 0xFFu;
            atomicAdd(&digitCounts[digit], 1u);
        }
        // Use 256 as sentinel for out-of-bounds threads (no valid digit is 256)
        localDigits[tid] = select(256u, digit, inBounds);
        workgroupBarrier();

        // Step 2: Compute stable destination using countBefore
        // countBefore = number of threads with same digit AND lower tid
        // This guarantees deterministic, stable ordering within each digit
        if (inBounds) {
            var countBefore = 0u;
            for (var t = 0u; t < tid; t++) {
                if (localDigits[t] == digit) {
                    countBefore++;
                }
            }
            let destIdx = localOffsets[digit] + countBefore;
            depthsOut[destIdx] = depth;
            indicesOut[destIdx] = origIdx;
        }
        workgroupBarrier();

        // Step 3: Update base offsets for next batch
        localOffsets[tid] += atomicLoad(&digitCounts[tid]);
        workgroupBarrier();

        batchStart += 256u;
    }
}
`;
export const radixIndirectHistogramSource = /* wgsl */ `
// Radix Sort - Indirect Count Histogram Pass

struct Uniforms {
    maxCount: u32,
    shift: u32,
    maxWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depths: array<u32>;
@group(0) @binding(1) var<storage, read_write> histograms: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<storage, read> countBuffer: array<u32>;

var<workgroup> localHistogram: array<atomic<u32>, 256>;

fn activeCount() -> u32 {
    return min(countBuffer[0], uniforms.maxCount);
}

fn activeWorkgroups(count: u32) -> u32 {
    if (count == 0u) {
        return 0u;
    }
    return min(uniforms.maxWorkgroups, (count + 255u) / 256u);
}

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    atomicStore(&localHistogram[local_id.x], 0u);
    workgroupBarrier();

    let count = activeCount();
    let numWorkgroups = activeWorkgroups(count);
    if (wg_id.x >= numWorkgroups) {
        return;
    }

    let elementsPerWorkgroup = (count + numWorkgroups - 1u) / numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, count);

    var idx = startIdx + local_id.x;
    while (idx < endIdx) {
        let depth = depths[idx];
        let digit = (depth >> uniforms.shift) & 0xFFu;
        atomicAdd(&localHistogram[digit], 1u);
        idx += 256u;
    }

    workgroupBarrier();

    let globalOffset = wg_id.x * 256u + local_id.x;
    histograms[globalOffset] = atomicLoad(&localHistogram[local_id.x]);
}
`;
export const radixIndirectScanSource = /* wgsl */ `
// Radix Sort - Indirect Count Prefix Sum Pass

struct Uniforms {
    maxCount: u32,
    _shift: u32,
    maxWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read_write> histograms: array<u32>;
@group(0) @binding(1) var<storage, read_write> globalOffsets: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<storage, read> countBuffer: array<u32>;

var<workgroup> temp: array<u32, 256>;

fn activeCount() -> u32 {
    return min(countBuffer[0], uniforms.maxCount);
}

fn activeWorkgroups(count: u32) -> u32 {
    if (count == 0u) {
        return 0u;
    }
    return min(uniforms.maxWorkgroups, (count + 255u) / 256u);
}

@compute
@workgroup_size(256)
fn main(@builtin(local_invocation_id) local_id: vec3<u32>) {
    let digit = local_id.x;
    let count = activeCount();
    let numWorkgroups = activeWorkgroups(count);

    var digitTotal = 0u;
    for (var wg = 0u; wg < numWorkgroups; wg++) {
        let histogramIdx = wg * 256u + digit;
        let binCount = histograms[histogramIdx];
        histograms[histogramIdx] = digitTotal;
        digitTotal += binCount;
    }

    temp[digit] = digitTotal;
    workgroupBarrier();

    for (var stride = 1u; stride < 256u; stride *= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            temp[idx] += temp[idx - stride];
        }
        workgroupBarrier();
    }

    if (digit == 255u) {
        temp[255u] = 0u;
    }
    workgroupBarrier();

    for (var stride = 128u; stride > 0u; stride /= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            let t = temp[idx - stride];
            temp[idx - stride] = temp[idx];
            temp[idx] += t;
        }
        workgroupBarrier();
    }

    globalOffsets[digit] = temp[digit];

    for (var wg = 0u; wg < numWorkgroups; wg++) {
        histograms[wg * 256u + digit] += temp[digit];
    }
}
`;
export const radixIndirectScatterSource = /* wgsl */ `
// Radix Sort - Indirect Count Stable Scatter Pass

struct Uniforms {
    maxCount: u32,
    shift: u32,
    maxWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<storage, read_write> histograms: array<u32>;
@group(0) @binding(5) var<uniform> uniforms: Uniforms;
@group(0) @binding(6) var<storage, read> countBuffer: array<u32>;

var<workgroup> localOffsets: array<u32, 256>;
var<workgroup> localDigits: array<u32, 256>;
var<workgroup> digitCounts: array<atomic<u32>, 256>;

fn activeCount() -> u32 {
    return min(countBuffer[0], uniforms.maxCount);
}

fn activeWorkgroups(count: u32) -> u32 {
    if (count == 0u) {
        return 0u;
    }
    return min(uniforms.maxWorkgroups, (count + 255u) / 256u);
}

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    let tid = local_id.x;
    let count = activeCount();
    let numWorkgroups = activeWorkgroups(count);
    if (wg_id.x >= numWorkgroups) {
        return;
    }

    localOffsets[tid] = histograms[wg_id.x * 256u + tid];
    workgroupBarrier();

    let elementsPerWorkgroup = (count + numWorkgroups - 1u) / numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, count);

    var batchStart = startIdx;
    while (batchStart < endIdx) {
        let batchEnd = min(batchStart + 256u, endIdx);
        let batchSize = batchEnd - batchStart;
        let idx = batchStart + tid;
        let inBounds = tid < batchSize;

        atomicStore(&digitCounts[tid], 0u);
        workgroupBarrier();

        var depth = 0u;
        var origIdx = 0u;
        var digit = 0u;

        if (inBounds) {
            depth = depthsIn[idx];
            origIdx = indicesIn[idx];
            digit = (depth >> uniforms.shift) & 0xFFu;
            atomicAdd(&digitCounts[digit], 1u);
        }
        localDigits[tid] = select(256u, digit, inBounds);
        workgroupBarrier();

        if (inBounds) {
            var countBefore = 0u;
            for (var t = 0u; t < tid; t++) {
                if (localDigits[t] == digit) {
                    countBefore++;
                }
            }
            let destIdx = localOffsets[digit] + countBefore;
            depthsOut[destIdx] = depth;
            indicesOut[destIdx] = origIdx;
        }
        workgroupBarrier();

        localOffsets[tid] += atomicLoad(&digitCounts[tid]);
        workgroupBarrier();

        batchStart += 256u;
    }
}
`;
export const radixIndirectCopyBackSource = /* wgsl */ `
// Radix Sort - Indirect Count Copy-Back Pass

struct Uniforms {
    maxCount: u32,
    _shift: u32,
    maxWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<uniform> uniforms: Uniforms;
@group(0) @binding(5) var<storage, read> countBuffer: array<u32>;

fn activeCount() -> u32 {
    return min(countBuffer[0], uniforms.maxCount);
}

fn activeWorkgroups(count: u32) -> u32 {
    if (count == 0u) {
        return 0u;
    }
    return min(uniforms.maxWorkgroups, (count + 255u) / 256u);
}

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    let count = activeCount();
    let numWorkgroups = activeWorkgroups(count);
    if (wg_id.x >= numWorkgroups) {
        return;
    }

    let elementsPerWorkgroup = (count + numWorkgroups - 1u) / numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, count);

    var idx = startIdx + local_id.x;
    while (idx < endIdx) {
        depthsOut[idx] = depthsIn[idx];
        indicesOut[idx] = indicesIn[idx];
        idx += 256u;
    }
}
`;
// ---- Radix 4-bit Sort Shaders ----
export const radix4HistogramSource = /* wgsl */ `
// Radix4 Sort - Histogram Pass
// =============================
// Part 1 of 3-stage 4-bit radix sort (histogram -> scan -> scatter)
//
// Purpose: Count occurrences of each 4-bit digit (0-15) within each workgroup's
// portion of the data. Uses 16-bin shared memory histogram (vs 256 for 8-bit).
//
// Algorithm:
// 1. Each workgroup processes a contiguous chunk of elements
// 2. Threads collaboratively count digits using 16 shared memory atomics
// 3. Final histogram is written to global memory (16 counts per workgroup)

struct Uniforms {
    count: u32,
    shift: u32,
    numWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depths: array<u32>;
@group(0) @binding(1) var<storage, read_write> histograms: array<u32>;  // 16 * numWorkgroups
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

var<workgroup> localHistogram: array<atomic<u32>, 16>;

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    // Initialize local histogram (only first 16 threads)
    if (local_id.x < 16u) {
        atomicStore(&localHistogram[local_id.x], 0u);
    }
    workgroupBarrier();

    // Each thread processes multiple elements
    let elementsPerWorkgroup = (uniforms.count + uniforms.numWorkgroups - 1u) / uniforms.numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, uniforms.count);

    var idx = startIdx + local_id.x;
    while (idx < endIdx) {
        let depth = depths[idx];
        let digit = (depth >> uniforms.shift) & 0xFu;
        atomicAdd(&localHistogram[digit], 1u);
        idx += 256u;
    }

    workgroupBarrier();

    // Write local histogram to global memory (only first 16 threads)
    if (local_id.x < 16u) {
        histograms[wg_id.x * 16u + local_id.x] = atomicLoad(&localHistogram[local_id.x]);
    }
}
`;
export const radix4ScanSource = /* wgsl */ `
// Radix4 Sort - Prefix Sum (Scan) Pass
// ======================================
// Part 2 of 3-stage 4-bit radix sort (histogram -> scan -> scatter)
//
// Purpose: Compute global write offsets for each of 16 digits by performing
// prefix sum across all workgroup histograms.
//
// Algorithm:
// 1. Each of 16 threads sums its digit's count across all workgroups
// 2. Blelloch parallel exclusive prefix sum across 16 digits (4 up-sweep + 4 down-sweep)
// 3. Add global offsets back to per-workgroup histograms

struct Uniforms {
    numWorkgroups: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<storage, read_write> histograms: array<u32>;  // 16 * numWorkgroups
@group(0) @binding(1) var<storage, read_write> globalOffsets: array<u32>;  // 16 digit offsets
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

var<workgroup> temp: array<u32, 16>;

@compute
@workgroup_size(16)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>
) {
    let digit = local_id.x;

    // Sum this digit's count across all workgroups
    var digitTotal = 0u;
    for (var wg = 0u; wg < uniforms.numWorkgroups; wg++) {
        let count = histograms[wg * 16u + digit];
        histograms[wg * 16u + digit] = digitTotal;
        digitTotal += count;
    }

    // Store digit total in shared memory
    temp[digit] = digitTotal;
    workgroupBarrier();

    // Parallel prefix sum across 16 digits (Blelloch scan)
    // Up-sweep (4 steps for 16 elements)
    for (var stride = 1u; stride < 16u; stride *= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 16u) {
            temp[idx] += temp[idx - stride];
        }
        workgroupBarrier();
    }

    // Clear last element for exclusive scan
    if (digit == 15u) {
        temp[15u] = 0u;
    }
    workgroupBarrier();

    // Down-sweep (4 steps)
    for (var stride = 8u; stride > 0u; stride /= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 16u) {
            let t = temp[idx - stride];
            temp[idx - stride] = temp[idx];
            temp[idx] += t;
        }
        workgroupBarrier();
    }

    // Write global offset for this digit
    globalOffsets[digit] = temp[digit];

    // Update histograms with global offsets
    for (var wg = 0u; wg < uniforms.numWorkgroups; wg++) {
        histograms[wg * 16u + digit] += temp[digit];
    }
}
`;
export const radix4ScatterSource = /* wgsl */ `
// Radix4 Sort - Stable Scatter Pass
// ===================================
// Part 3 of 3-stage 4-bit radix sort (histogram -> scan -> scatter)
//
// Purpose: Move each element to its sorted destination using 4-bit digits (16 bins).
// Uses countBefore for stability (same proven approach as 8-bit scatter).
//
// Algorithm:
// 1. Load pre-computed offsets (16 per workgroup) into shared memory
// 2. For each batch of 256 elements:
//    a. Load elements, compute 4-bit digit, store in shared memory
//    b. Each thread counts same-digit predecessors (countBefore)
//    c. destIdx = baseOffset[digit] + countBefore
//    d. Write to output, update baseOffsets per batch

struct Uniforms {
    count: u32,
    shift: u32,
    numWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<storage, read_write> histograms: array<u32>;  // Pre-computed offsets
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

var<workgroup> localOffsets: array<u32, 16>;        // Running base offset per digit
var<workgroup> localDigits: array<u32, 256>;        // Digit per thread in current batch
var<workgroup> digitCounts: array<atomic<u32>, 16>; // Per-digit count in current batch

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    let tid = local_id.x;

    // Load workgroup's base offsets into shared memory (only first 16 threads)
    if (tid < 16u) {
        localOffsets[tid] = histograms[wg_id.x * 16u + tid];
    }
    workgroupBarrier();

    // Each workgroup processes a contiguous chunk
    let elementsPerWorkgroup = (uniforms.count + uniforms.numWorkgroups - 1u) / uniforms.numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, uniforms.count);

    // Process in batches of 256
    var batchStart = startIdx;
    while (batchStart < endIdx) {
        let batchEnd = min(batchStart + 256u, endIdx);
        let batchSize = batchEnd - batchStart;
        let idx = batchStart + tid;
        let inBounds = tid < batchSize;

        // Reset digit counts (only first 16 threads)
        if (tid < 16u) {
            atomicStore(&digitCounts[tid], 0u);
        }
        workgroupBarrier();

        // Step 1: Load element, compute digit, store in shared memory
        var depth = 0u;
        var origIdx = 0u;
        var digit = 0u;

        if (inBounds) {
            depth = depthsIn[idx];
            origIdx = indicesIn[idx];
            digit = (depth >> uniforms.shift) & 0xFu;
            atomicAdd(&digitCounts[digit], 1u);
        }
        // Use 16 as sentinel for out-of-bounds threads (no valid digit is 16)
        localDigits[tid] = select(16u, digit, inBounds);
        workgroupBarrier();

        // Step 2: Compute stable destination using countBefore
        if (inBounds) {
            var countBefore = 0u;
            for (var t = 0u; t < tid; t++) {
                if (localDigits[t] == digit) {
                    countBefore++;
                }
            }
            let destIdx = localOffsets[digit] + countBefore;
            depthsOut[destIdx] = depth;
            indicesOut[destIdx] = origIdx;
        }
        workgroupBarrier();

        // Step 3: Update base offsets for next batch (only first 16 threads)
        if (tid < 16u) {
            localOffsets[tid] += atomicLoad(&digitCounts[tid]);
        }
        workgroupBarrier();

        batchStart += 256u;
    }
}
`;
// ---- Bitonic Sort Shader ----
export const bitonicSortSource = /* wgsl */ `
// Bitonic Sort for Gaussian depth ordering
// Based on https://en.wikipedia.org/wiki/Bitonic_sorter

struct SortUniforms {
    j: u32,
    k: u32,
    count: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read_write> indices: array<u32>;
@group(0) @binding(1) var<storage, read_write> depths: array<u32>;  // Quantized depths for faster integer comparison
@group(0) @binding(2) var<uniform> uniforms: SortUniforms;

// Use 2D dispatch to handle >16M elements
@compute
@workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // 2D global_id: x varies fastest, then y
    let i = global_id.x + global_id.y * 65535u * 256u;
    if (i >= uniforms.count) {
        return;
    }

    let j = uniforms.j;
    let k = uniforms.k;

    // XOR partner index
    let i_xor_j = i ^ j;

    // Only process if we're the lower index of the pair
    if (i_xor_j <= i) {
        return;
    }

    // Bounds check for partner
    if (i_xor_j >= uniforms.count) {
        return;
    }

    // Determine sort direction based on k
    let ascending = (i & k) == 0;

    // Compare and swap
    let depth_i = depths[i];
    let depth_partner = depths[i_xor_j];

    let should_swap = select(
        (depth_i < depth_partner),  // descending: swap if i < partner
        (depth_i > depth_partner),  // ascending: swap if i > partner
        ascending
    );

    if (should_swap) {
        // Swap depths
        depths[i] = depth_partner;
        depths[i_xor_j] = depth_i;

        // Swap indices
        let idx_i = indices[i];
        let idx_partner = indices[i_xor_j];
        indices[i] = idx_partner;
        indices[i_xor_j] = idx_i;
    }
}
`;
// ---- Counting Sort Shaders ----
export const countHistogramSource = /* wgsl */ `
// Counting Sort - Histogram Pass
// ===============================
// Part 1 of 3-stage counting sort (histogram -> prefix sum -> scatter)
//
// Purpose: Count occurrences of each 16-bit bucket (top 16 bits of depth).
// Uses 65536 global atomic counters -- no per-workgroup histograms needed.
//
// Performance: O(n) with high parallelism, single pass over data

struct Uniforms {
    count: u32,
    shift: u32,      // Bit shift (16 for top 16 bits)
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<storage, read> depths: array<u32>;
@group(0) @binding(1) var<storage, read_write> histogram: array<atomic<u32>>;  // 65536 entries
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@compute
@workgroup_size(256)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(num_workgroups) num_wgs: vec3<u32>,
) {
    let totalThreads = num_wgs.x * num_wgs.y * 256u;
    let threadIdx = global_id.y * (num_wgs.x * 256u) + global_id.x;

    var idx = threadIdx;
    while (idx < uniforms.count) {
        let depth = depths[idx];
        let bucket = (depth >> uniforms.shift) & 0xFFFFu;
        atomicAdd(&histogram[bucket], 1u);
        idx += totalThreads;
    }
}
`;
export const countPrefixSumSource = /* wgsl */ `
// Counting Sort - Prefix Sum Pass
// =================================
// Part 2 of 3-stage counting sort (histogram -> prefix sum -> scatter)
//
// Purpose: Convert 65536 bucket counts into exclusive prefix sums (write offsets).
// Single workgroup of 256 threads, each processes 256 sequential buckets.
//
// Algorithm:
// Phase 1: Each thread sequentially prefix-sums its 256 buckets, stores thread total
// Phase 2: Blelloch parallel scan across 256 partial sums
// Phase 3: Each thread adds its global offset back to its 256 entries
//
// After this pass, histogram[bucket] = starting index for that bucket in sorted output.

@group(0) @binding(0) var<storage, read_write> histogram: array<u32>;  // 65536 entries (in-place)

var<workgroup> threadTotals: array<u32, 256>;
var<workgroup> temp: array<u32, 256>;

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
) {
    let tid = local_id.x;
    let bucketStart = tid * 256u;
    let bucketEnd = bucketStart + 256u;

    // Phase 1: Sequential prefix sum within this thread's 256 buckets
    var runningSum = 0u;
    for (var b = bucketStart; b < bucketEnd; b++) {
        let count = histogram[b];
        histogram[b] = runningSum;
        runningSum += count;
    }

    // Store thread total for parallel scan
    threadTotals[tid] = runningSum;
    temp[tid] = runningSum;
    workgroupBarrier();

    // Phase 2: Blelloch parallel exclusive prefix sum across 256 thread totals
    // Up-sweep (reduce)
    for (var stride = 1u; stride < 256u; stride *= 2u) {
        let idx = (tid + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            temp[idx] += temp[idx - stride];
        }
        workgroupBarrier();
    }

    // Clear last element for exclusive scan
    if (tid == 255u) {
        temp[255u] = 0u;
    }
    workgroupBarrier();

    // Down-sweep
    for (var stride = 128u; stride > 0u; stride /= 2u) {
        let idx = (tid + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            let t = temp[idx - stride];
            temp[idx - stride] = temp[idx];
            temp[idx] += t;
        }
        workgroupBarrier();
    }

    // Phase 3: Add global offset to each thread's local prefix sums
    let globalOffset = temp[tid];
    for (var b = bucketStart; b < bucketEnd; b++) {
        histogram[b] += globalOffset;
    }
}
`;
export const countScatterSource = /* wgsl */ `
// Counting Sort - Scatter Pass
// =============================
// Part 3 of 3-stage counting sort (histogram -> prefix sum -> scatter)
//
// Purpose: Place each element at its sorted position using atomic offsets.
// Each thread reads its depth, determines bucket, atomicAdds the offset to get
// a unique write position, and writes depth+index to output buffers.
//
// Note: Unstable within buckets (elements with same top-16-bit depth may be
// reordered). This is acceptable for Gaussian splatting where sub-bucket
// ordering has negligible visual impact.

struct Uniforms {
    count: u32,
    shift: u32,
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<storage, read_write> offsets: array<atomic<u32>>;  // 65536 entries
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

@compute
@workgroup_size(256)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(num_workgroups) num_wgs: vec3<u32>,
) {
    let totalThreads = num_wgs.x * num_wgs.y * 256u;
    let threadIdx = global_id.y * (num_wgs.x * 256u) + global_id.x;

    var idx = threadIdx;
    while (idx < uniforms.count) {
        let depth = depthsIn[idx];
        let index = indicesIn[idx];
        let bucket = (depth >> uniforms.shift) & 0xFFFFu;
        let pos = atomicAdd(&offsets[bucket], 1u);
        depthsOut[pos] = depth;
        indicesOut[pos] = index;
        idx += totalThreads;
    }
}
`;
