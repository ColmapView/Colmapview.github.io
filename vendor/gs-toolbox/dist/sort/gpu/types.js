// GPU Sort Module Types
// =====================
// Pluggable GPU sorting interface for Gaussian splatting renderers.
//
// Data flow:
//   Preprocess (compute) → Sort (compute) → Render (vertex+fragment)
//   writes depths[i]        reorders both     reads sorted indices[i]
//   writes indices[i]       buffers in-place   to draw Gaussians
//
// The preprocess stage writes u32 quantized depths and Gaussian indices into
// GPU buffers. The sort module reorders both buffers so depths are in ascending
// order (front-to-back). The render stage reads sorted indices to draw
// Gaussians with correct alpha-blending order.
//
// Buffer requirements:
//   The caller must create depth and index buffers with at least:
//     GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
//   Sort modules internally create ping-pong alt buffers and only copy TO
//   the primary buffers (needing COPY_DST), never FROM them.
export class UnsupportedGPUSortCapabilityError extends Error {
    constructor(moduleName, capability) {
        super(`${moduleName} does not support ${capability}`);
        this.name = 'UnsupportedGPUSortCapabilityError';
    }
}
const DEFAULT_KEY_FORMAT = 'u32-depth';
const DEFAULT_INDEX_FORMAT = 'u32-index';
const GPU_SORT_CAPABILITIES = {
    radix: {
        fixedCount: true,
        indirectCount: true,
        stable: true,
        precisionBits: 32,
        keyFormat: DEFAULT_KEY_FORMAT,
        indexFormat: DEFAULT_INDEX_FORMAT,
        requiresPowerOfTwo: false,
    },
    'radix-16bit': {
        fixedCount: true,
        indirectCount: true,
        stable: true,
        precisionBits: 16,
        keyFormat: DEFAULT_KEY_FORMAT,
        indexFormat: DEFAULT_INDEX_FORMAT,
        requiresPowerOfTwo: false,
    },
    'radix-8bit': {
        fixedCount: true,
        indirectCount: true,
        stable: true,
        precisionBits: 8,
        keyFormat: DEFAULT_KEY_FORMAT,
        indexFormat: DEFAULT_INDEX_FORMAT,
        requiresPowerOfTwo: false,
    },
    radix4: {
        fixedCount: true,
        indirectCount: false,
        stable: true,
        precisionBits: 32,
        keyFormat: DEFAULT_KEY_FORMAT,
        indexFormat: DEFAULT_INDEX_FORMAT,
        requiresPowerOfTwo: false,
    },
    'radix4-16bit': {
        fixedCount: true,
        indirectCount: false,
        stable: true,
        precisionBits: 16,
        keyFormat: DEFAULT_KEY_FORMAT,
        indexFormat: DEFAULT_INDEX_FORMAT,
        requiresPowerOfTwo: false,
    },
    'radix4-8bit': {
        fixedCount: true,
        indirectCount: false,
        stable: true,
        precisionBits: 8,
        keyFormat: DEFAULT_KEY_FORMAT,
        indexFormat: DEFAULT_INDEX_FORMAT,
        requiresPowerOfTwo: false,
    },
    bitonic: {
        fixedCount: true,
        indirectCount: false,
        stable: true,
        precisionBits: 32,
        keyFormat: DEFAULT_KEY_FORMAT,
        indexFormat: DEFAULT_INDEX_FORMAT,
        requiresPowerOfTwo: true,
    },
    counting: {
        fixedCount: true,
        indirectCount: false,
        stable: false,
        precisionBits: 16,
        keyFormat: DEFAULT_KEY_FORMAT,
        indexFormat: DEFAULT_INDEX_FORMAT,
        requiresPowerOfTwo: false,
    },
    'counting-32bit': {
        fixedCount: true,
        indirectCount: false,
        stable: false,
        precisionBits: 32,
        keyFormat: DEFAULT_KEY_FORMAT,
        indexFormat: DEFAULT_INDEX_FORMAT,
        requiresPowerOfTwo: false,
    },
};
export function getGPUSortAlgorithmCapabilities(algorithm) {
    return { ...GPU_SORT_CAPABILITIES[algorithm] };
}
export function supportsIndirectGPUSort(algorithm) {
    return GPU_SORT_CAPABILITIES[algorithm].indirectCount;
}
export function unsupportedIndirectSort(moduleName) {
    throw new UnsupportedGPUSortCapabilityError(moduleName, 'indirect-count sorting');
}
/**
 * Compute 2D workgroup dispatch dimensions for large element counts.
 *
 * WebGPU limits each dispatch dimension to 65535. For element counts exceeding
 * 65535 * workgroupSize, this function splits across X and Y dimensions.
 *
 * @param elementCount - Total number of elements to process
 * @param workgroupSize - Threads per workgroup (typically 256)
 * @returns [xWorkgroups, yWorkgroups] for dispatchWorkgroups(x, y)
 *
 * @example
 * ```typescript
 * const [wgX, wgY] = getWorkgroupCounts(1_000_000, 256);
 * computePass.dispatchWorkgroups(wgX, wgY);
 * ```
 */
export function getWorkgroupCounts(elementCount, workgroupSize) {
    const totalWorkgroups = Math.ceil(elementCount / workgroupSize);
    const maxWorkgroupsPerDim = 65535;
    if (totalWorkgroups <= maxWorkgroupsPerDim) {
        return [totalWorkgroups, 1];
    }
    const xWorkgroups = maxWorkgroupsPerDim;
    const yWorkgroups = Math.ceil(totalWorkgroups / maxWorkgroupsPerDim);
    return [xWorkgroups, yWorkgroups];
}
/**
 * Round up to next power of 2. Used by bitonic sort which requires power-of-2 counts.
 *
 * @example
 * ```typescript
 * nextPowerOf2(1000)  // 1024
 * nextPowerOf2(1024)  // 1024
 * nextPowerOf2(1025)  // 2048
 * ```
 */
export function nextPowerOf2(n) {
    return Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));
}
