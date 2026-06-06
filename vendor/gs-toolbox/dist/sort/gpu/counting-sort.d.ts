import type { GPUSortCapabilities, GPUSortConfig, GPUSortIndirectConfig, GPUSortModule } from './types';
/**
 * Options for configuring the GPU counting sort.
 */
export interface CountingSortOptions {
    /**
     * Number of 16-bit passes (1 or 2). Default: 1 (top 16 bits only).
     *
     * - `1`: Sorts top 16 bits (shift=16). Fast, visually equivalent for splatting.
     * - `2`: Attempts full 32-bit via LSB-first (shift=0 then shift=16).
     *   Approximate due to unstable scatter — prefer radix for exact 32-bit sort.
     */
    passes?: number;
}
/**
 * GPU counting sort module — O(n) sort using 65536-bucket histograms.
 *
 * Fastest algorithm at small sizes (<200K). Uses global atomic counters
 * instead of per-workgroup histograms, making it simpler but unstable.
 * The unstable scatter is acceptable for single-pass top-16-bit sorting
 * (sub-bucket ordering has negligible visual impact in Gaussian splatting)
 * but makes multi-pass (32-bit) sorting only approximate.
 *
 * @example
 * ```typescript
 * // Top 16-bit sort (recommended)
 * const sort = new CountingSortModule(device);
 *
 * // Approximate 32-bit sort (prefer RadixSortModule for exact)
 * const sort32 = new CountingSortModule(device, { passes: 2 });
 *
 * sort.configure({ count: gaussianCount, buffers: { depth, index } });
 * sort.execute(commandEncoder);
 * ```
 */
export declare class CountingSortModule implements GPUSortModule {
    readonly name: string;
    readonly capabilities: GPUSortCapabilities;
    private device;
    private passes;
    private histogramPipeline;
    private prefixSumPipeline;
    private scatterPipeline;
    private configured;
    private count;
    private buffers;
    private histogramBuffers;
    private offsetsBuffers;
    private uniformBuffers;
    private depthAlt;
    private indexAlt;
    private histogramBindGroups;
    private prefixSumBindGroups;
    private scatterBindGroups;
    constructor(device: GPUDevice, options?: CountingSortOptions);
    /**
     * (Re)configure internal buffers and bind groups for the given Gaussian count.
     *
     * Creates per-pass:
     * - Histogram buffer (65536 u32 entries, STORAGE | COPY_SRC | COPY_DST)
     * - Offsets buffer (65536 u32 entries, for scatter read)
     * - Uniform buffer (count, shift)
     * - Ping-pong alt buffers for output / multi-pass
     * - Bind groups for histogram, prefix sum, and scatter pipelines
     */
    configure(config: GPUSortConfig): void;
    /**
     * Encode sort compute dispatches into the command encoder.
     *
     * Per pass (3 dispatches + 1 clear + 1 copy):
     *   1. clearBuffer(histogram) — zero the 65536 counters
     *   2. Histogram dispatch — count bucket occurrences
     *   3. Prefix sum dispatch — in-place exclusive scan (single workgroup)
     *   4. copyBufferToBuffer — snapshot offsets for scatter
     *   5. Scatter dispatch — move elements to sorted positions
     *
     * For single-pass: appends 2 copy-back commands (alt → primary).
     * For 2-pass: final pass writes directly to primary (pass 1 is odd → primary).
     */
    executeFixed(encoder: GPUCommandEncoder): void;
    executeIndirect(_encoder: GPUCommandEncoder, _config: GPUSortIndirectConfig): void;
    execute(encoder: GPUCommandEncoder): void;
    private destroyInternalBuffers;
    destroy(): void;
}
