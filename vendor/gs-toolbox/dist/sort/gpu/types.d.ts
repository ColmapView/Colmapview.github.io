/**
 * Primary depth/index GPU buffers shared between pipeline stages.
 *
 * Created by the renderer, written by preprocess, reordered by sort, read by render.
 * Both buffers must have `GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST`.
 */
export interface GPUSortBuffers {
    /** u32 quantized depths — preprocess writes, sort reorders, render ignores */
    depth: GPUBuffer;
    /** u32 Gaussian indices — preprocess writes [0..N), sort reorders, render reads */
    index: GPUBuffer;
}
/**
 * Configuration passed to `GPUSortModule.configure()`.
 *
 * Call configure() whenever the Gaussian count changes (e.g. after loading a
 * new scene or culling). The sort module will create/resize internal buffers
 * and bind groups to match.
 */
export interface GPUSortConfig {
    /** Number of active Gaussians to sort (may be less than buffer capacity) */
    count: number;
    /** Primary depth/index buffers written by preprocess, read by render */
    buffers: GPUSortBuffers;
}
/** GPU sort key buffer format. */
export type GPUSortKeyFormat = 'u32-depth';
/** GPU sort payload/index buffer format. */
export type GPUSortIndexFormat = 'u32-index';
/**
 * Static capabilities for a GPU sort implementation.
 *
 * Renderers should ask this contract what execution modes and formats an
 * algorithm supports instead of branching on concrete class names. This is the
 * compatibility layer needed before adding visible-count indirect sorting.
 */
export interface GPUSortCapabilities {
    /** Sorts the configured `count` supplied by `configure()`. */
    readonly fixedCount: boolean;
    /** Sorts a GPU-written count from an indirect args/count buffer. */
    readonly indirectCount: boolean;
    /** Sort preserves input order for equal keys. */
    readonly stable: boolean;
    /** Number of depth-key bits that materially affect ordering. */
    readonly precisionBits: number;
    /** Depth key format read by the sorter. */
    readonly keyFormat: GPUSortKeyFormat;
    /** Payload/index format reordered alongside depth keys. */
    readonly indexFormat: GPUSortIndexFormat;
    /** Whether the algorithm internally pads to a power-of-two element count. */
    readonly requiresPowerOfTwo: boolean;
}
/**
 * Future indirect-count sort execution inputs.
 *
 * The current implementations expose this contract but intentionally reject it
 * until their shaders and bind groups consume GPU-written counts safely.
 */
export interface GPUSortIndirectConfig {
    /** GPU buffer containing a u32 active element count. */
    countBuffer: GPUBuffer;
    /** Byte offset of the u32 count within `countBuffer`. Defaults to 0. */
    countOffset?: number;
    /** Upper bound used for buffer capacity validation. */
    maxCount: number;
}
export declare class UnsupportedGPUSortCapabilityError extends Error {
    constructor(moduleName: string, capability: string);
}
/**
 * Pluggable GPU sort module interface.
 *
 * All GPU sort algorithms implement this interface, allowing the renderer to
 * swap algorithms without changing any other code. Lifecycle:
 *
 * ```typescript
 * const sort = createGPUSortModule('radix', device);
 * sort.configure({ count, buffers: { depth, index } });  // once per resize
 *
 * // Every frame:
 * const encoder = device.createCommandEncoder();
 * // ... preprocess pass ...
 * sort.execute(encoder);  // encodes sort dispatches
 * // ... render pass ...
 * device.queue.submit([encoder.finish()]);
 *
 * sort.destroy();  // cleanup
 * ```
 */
export interface GPUSortModule {
    /** Human-readable name (e.g. "Radix 32-bit", "Bitonic", "Counting 16-bit") */
    readonly name: string;
    /** Static execution and format capabilities. */
    readonly capabilities: GPUSortCapabilities;
    /**
     * (Re)configure internal buffers and bind groups for the given count.
     * Must be called before the first `execute()` and whenever count/buffers change.
     */
    configure(config: GPUSortConfig): void;
    /**
     * Encode fixed-count sort compute dispatches into the command encoder.
     * Use this when the caller wants the configured capacity sorted.
     */
    executeFixed(encoder: GPUCommandEncoder): void;
    /**
     * Encode indirect-count sort dispatches.
     *
     * Implementations that do not support `capabilities.indirectCount` must throw
     * `UnsupportedGPUSortCapabilityError` rather than silently falling back to a
     * fixed count.
     */
    executeIndirect(encoder: GPUCommandEncoder, config: GPUSortIndirectConfig): void;
    /**
     * Encode sort compute dispatches into the command encoder.
     * Called every frame between preprocess and render passes.
     * No-op if `configure()` has not been called.
     *
     * Deprecated alias for `executeFixed()` kept for compatibility with existing
     * renderers.
     */
    execute(encoder: GPUCommandEncoder): void;
    /** Release all internal GPU buffers. The module cannot be used after this. */
    destroy(): void;
}
/**
 * Available GPU sort algorithm identifiers.
 *
 * | Algorithm        | Passes | Precision | Stable | Dispatches   |
 * |------------------|--------|-----------|--------|--------------|
 * | `radix`          | 4x8b   | Exact 32b | Yes    | 12           |
 * | `radix-16bit`    | 2x8b   | Top 16b   | Yes    | 6            |
 * | `radix-8bit`     | 1x8b   | Top 8b    | Yes    | 3            |
 * | `radix4`         | 8x4b   | Exact 32b | Yes    | 24           |
 * | `radix4-16bit`   | 4x4b   | Top 16b   | Yes    | 12           |
 * | `radix4-8bit`    | 2x4b   | Top 8b    | Yes    | 6            |
 * | `bitonic`        | log^2  | Exact 32b | Yes    | O(log^2 n)   |
 * | `counting`       | 1x16b  | Top 16b   | No     | 3            |
 * | `counting-32bit` | 2x16b  | ~Approx   | No     | 6            |
 *
 * Recommendations:
 * - `radix-16bit`: Best balance of speed and quality for most scenes
 * - `radix`: Use when exact ordering matters (e.g. very deep scenes)
 * - `radix4-*`: 4-bit variant — less shared memory pressure, trivial scan pass
 * - `bitonic`: Good fallback, no internal buffers needed, but O(log^2 n) dispatches
 * - `counting`: Fastest at small sizes, slight quality loss in dense depth regions
 * - `counting-32bit`: Unstable scatter limits multi-pass accuracy — prefer radix
 */
export type GPUSortAlgorithm = 'radix' | 'radix-16bit' | 'radix-8bit' | 'radix4' | 'radix4-16bit' | 'radix4-8bit' | 'bitonic' | 'counting' | 'counting-32bit';
export declare function getGPUSortAlgorithmCapabilities(algorithm: GPUSortAlgorithm): GPUSortCapabilities;
export declare function supportsIndirectGPUSort(algorithm: GPUSortAlgorithm): boolean;
export declare function unsupportedIndirectSort(moduleName: string): never;
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
export declare function getWorkgroupCounts(elementCount: number, workgroupSize: number): [number, number];
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
export declare function nextPowerOf2(n: number): number;
