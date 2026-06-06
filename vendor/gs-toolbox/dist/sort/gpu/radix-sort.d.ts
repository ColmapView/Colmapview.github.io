import type { GPUSortCapabilities, GPUSortConfig, GPUSortIndirectConfig, GPUSortModule } from './types';
/**
 * Options for configuring the GPU radix sort.
 *
 * The radix sort processes 8 bits per pass, so:
 * - 4 passes = full 32-bit sort (exact, bits 0-31)
 * - 2 passes = top 16-bit sort (bits 16-31, fast, visually equivalent)
 * - 1 pass = top 8-bit sort (bits 24-31, fastest, slight quality loss)
 */
export interface RadixSortOptions {
    /** Number of 8-bit passes (1, 2, or 4). Default: 4 (full 32-bit). */
    passes?: number;
    /**
     * Starting bit shift for the first pass.
     * Default: `(4 - passes) * 8` — sorts the topmost N*8 bits.
     * Examples: passes=4 → startShift=0, passes=2 → startShift=16, passes=1 → startShift=24.
     */
    startShift?: number;
}
/**
 * GPU radix sort module — O(n) stable sort with configurable precision.
 *
 * Implements a 3-stage per-pass pipeline (histogram → scan → scatter) using
 * ping-pong buffers. The scatter stage uses a deterministic countBefore
 * approach for stability, which is critical for multi-pass correctness.
 *
 * @example
 * ```typescript
 * // Full 32-bit sort (exact)
 * const sort = new RadixSortModule(device);
 *
 * // Top 16-bit sort (fast, visually equivalent for most scenes)
 * const sort16 = new RadixSortModule(device, { passes: 2, startShift: 16 });
 *
 * sort.configure({ count: gaussianCount, buffers: { depth, index } });
 * sort.execute(commandEncoder);
 * ```
 */
export declare class RadixSortModule implements GPUSortModule {
    readonly name: string;
    readonly capabilities: GPUSortCapabilities;
    private device;
    private passes;
    private startShift;
    private histogramPipeline;
    private scanPipeline;
    private scatterPipeline;
    private indirectHistogramPipeline;
    private indirectScanPipeline;
    private indirectScatterPipeline;
    private indirectCopyBackPipeline;
    private configured;
    private count;
    private numWorkgroups;
    private buffers;
    private depthAlt;
    private indexAlt;
    private histogramBuffer;
    private globalOffsetsBuffer;
    private histogramBindGroups;
    private scanBindGroups;
    private scatterBindGroups;
    private uniformBuffers;
    private indirectCountBuffer;
    private indirectMaxCount;
    private indirectHistogramBindGroups;
    private indirectScanBindGroups;
    private indirectScatterBindGroups;
    private indirectCopyBackBindGroup;
    private indirectUniformBuffers;
    constructor(device: GPUDevice, options?: RadixSortOptions);
    /**
     * (Re)configure internal buffers and bind groups for the given Gaussian count.
     *
     * Creates:
     * - Ping-pong alt buffers (depthAlt, indexAlt) with STORAGE | COPY_SRC
     * - Per-workgroup histogram buffer (256 * numWorkgroups entries)
     * - Global offsets buffer (256 entries)
     * - Per-pass uniform buffers with (count, shift, numWorkgroups)
     * - Per-pass bind groups for histogram, scan, and scatter pipelines
     */
    configure(config: GPUSortConfig): void;
    private createBindGroups;
    /**
     * Encode sort compute dispatches into the command encoder.
     *
     * Per pass (3 dispatches each):
     *   1. Histogram — each workgroup counts digits in its chunk
     *   2. Scan — single workgroup prefix-sums all histograms (Blelloch)
     *   3. Scatter — each workgroup moves elements to sorted positions
     *
     * For odd pass counts, appends 2 copy-back commands (alt → primary).
     */
    executeFixed(encoder: GPUCommandEncoder): void;
    private createIndirectBindGroups;
    executeIndirect(encoder: GPUCommandEncoder, config: GPUSortIndirectConfig): void;
    execute(encoder: GPUCommandEncoder): void;
    private destroyInternalBuffers;
    private destroyIndirectBuffers;
    destroy(): void;
}
