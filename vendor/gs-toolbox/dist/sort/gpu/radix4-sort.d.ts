import type { GPUSortCapabilities, GPUSortConfig, GPUSortIndirectConfig, GPUSortModule } from './types';
/**
 * Options for configuring the 4-bit GPU radix sort.
 *
 * The radix sort processes 4 bits per pass, so:
 * - 8 passes = full 32-bit sort (exact, bits 0-31)
 * - 4 passes = top 16-bit sort (bits 16-31, fast, visually equivalent)
 * - 2 passes = top 8-bit sort (bits 24-31, fastest, slight quality loss)
 */
export interface Radix4SortOptions {
    /** Number of 4-bit passes (2, 4, or 8). Default: 8 (full 32-bit). */
    passes?: number;
    /**
     * Starting bit shift for the first pass.
     * Default: `(8 - passes) * 4` — sorts the topmost N*4 bits.
     * Examples: passes=8 → startShift=0, passes=4 → startShift=16, passes=2 → startShift=24.
     */
    startShift?: number;
}
/**
 * GPU 4-bit radix sort module — O(n) stable sort with 16 bins per pass.
 *
 * Implements a 3-stage per-pass pipeline (histogram → scan → scatter) using
 * ping-pong buffers. Uses 16-bin digits instead of 256-bin for less shared
 * memory pressure and a trivial scan pass.
 *
 * @example
 * ```typescript
 * // Full 32-bit sort (exact, 8 passes)
 * const sort = new Radix4BitSortModule(device);
 *
 * // Top 16-bit sort (4 passes, visually equivalent for most scenes)
 * const sort16 = new Radix4BitSortModule(device, { passes: 4, startShift: 16 });
 *
 * sort.configure({ count: gaussianCount, buffers: { depth, index } });
 * sort.execute(commandEncoder);
 * ```
 */
export declare class Radix4BitSortModule implements GPUSortModule {
    readonly name: string;
    readonly capabilities: GPUSortCapabilities;
    private device;
    private passes;
    private startShift;
    private histogramPipeline;
    private scanPipeline;
    private scatterPipeline;
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
    constructor(device: GPUDevice, options?: Radix4SortOptions);
    /**
     * (Re)configure internal buffers and bind groups for the given Gaussian count.
     *
     * Creates:
     * - Ping-pong alt buffers (depthAlt, indexAlt) with STORAGE | COPY_SRC
     * - Per-workgroup histogram buffer (16 * numWorkgroups entries)
     * - Global offsets buffer (16 entries)
     * - Per-pass uniform buffers with (count, shift, numWorkgroups)
     * - Per-pass bind groups for histogram, scan, and scatter pipelines
     */
    configure(config: GPUSortConfig): void;
    private createBindGroups;
    /**
     * Encode sort compute dispatches into the command encoder.
     *
     * Per pass (3 dispatches each):
     *   1. Histogram — each workgroup counts 4-bit digits in its chunk
     *   2. Scan — single workgroup of 16 threads prefix-sums all histograms
     *   3. Scatter — each workgroup moves elements to sorted positions
     *
     * For odd pass counts, appends 2 copy-back commands (alt → primary).
     */
    executeFixed(encoder: GPUCommandEncoder): void;
    executeIndirect(_encoder: GPUCommandEncoder, _config: GPUSortIndirectConfig): void;
    execute(encoder: GPUCommandEncoder): void;
    private destroyInternalBuffers;
    destroy(): void;
}
