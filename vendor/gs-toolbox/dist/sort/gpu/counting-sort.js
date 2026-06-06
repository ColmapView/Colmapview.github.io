// Counting Sort Module
// ====================
// GPU counting sort with 16-bit bucketing (65536 buckets per pass).
//
// Algorithm:
//   Each pass sorts one 16-bit digit using 3 stages:
//   1. Histogram — global atomic counters for 65536 buckets
//   2. Prefix sum — Blelloch scan across 65536 entries (single workgroup)
//   3. Scatter — atomicAdd on bucket offsets for write positions
//
// Single-pass (default): sorts top 16 bits only. 3 dispatches.
//   Unstable within buckets but visually equivalent for Gaussian splatting.
//   Shift=16, so elements with the same top-16-bit depth may be reordered.
//
// Two-pass (passes=2): attempts full 32-bit sort. 6 dispatches with ping-pong.
//   Pass 0 sorts lower 16 bits (shift=0), pass 1 sorts upper 16 bits (shift=16).
//   WARNING: The scatter uses global atomicAdd which is inherently unstable —
//   elements within the same bucket may be reordered. This means multi-pass
//   counting sort is NOT fully correct (the second pass can break the ordering
//   established by the first pass). Use radix sort for exact 32-bit sorting.
//
// Performance (measured):
//   | Variant         | 100K  | 500K  | 1M    | 2M     |
//   |-----------------|-------|-------|-------|--------|
//   | counting (16b)  | 3.2ms | 3.6ms | 4.7ms | 9.3ms  |
//   | counting-32bit  | 3.6ms | 5.0ms | 7.4ms | 11.0ms |
import { getWorkgroupCounts } from './types';
import { unsupportedIndirectSort } from './types';
import { countHistogramSource, countPrefixSumSource, countScatterSource } from './shaders';
const BUCKET_COUNT = 65536;
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
export class CountingSortModule {
    constructor(device, options) {
        // Per-configure state
        this.configured = false;
        this.count = 0;
        this.buffers = null;
        // Internal buffers (per pass)
        this.histogramBuffers = [];
        this.offsetsBuffers = [];
        this.uniformBuffers = [];
        // Ping-pong alt buffers (only for 2-pass)
        this.depthAlt = null;
        this.indexAlt = null;
        // Bind groups (per pass)
        this.histogramBindGroups = [];
        this.prefixSumBindGroups = [];
        this.scatterBindGroups = [];
        this.device = device;
        this.passes = options?.passes ?? 1;
        const bits = this.passes * 16;
        this.name = `Counting ${bits}-bit`;
        this.capabilities = {
            fixedCount: true,
            indirectCount: false,
            stable: false,
            precisionBits: bits,
            keyFormat: 'u32-depth',
            indexFormat: 'u32-index',
            requiresPowerOfTwo: false,
        };
        const histogramModule = device.createShaderModule({ code: countHistogramSource });
        this.histogramPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: histogramModule, entryPoint: 'main' },
        });
        const prefixSumModule = device.createShaderModule({ code: countPrefixSumSource });
        this.prefixSumPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: prefixSumModule, entryPoint: 'main' },
        });
        const scatterModule = device.createShaderModule({ code: countScatterSource });
        this.scatterPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: scatterModule, entryPoint: 'main' },
        });
    }
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
    configure(config) {
        this.destroyInternalBuffers();
        if (config.count === 0) {
            this.configured = false;
            return;
        }
        this.count = config.count;
        this.buffers = config.buffers;
        // Create alt buffers for ping-pong (needed for 2-pass)
        if (this.passes === 2) {
            this.depthAlt = this.device.createBuffer({
                size: config.count * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.indexAlt = this.device.createBuffer({
                size: config.count * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        }
        // Create per-pass resources
        for (let pass = 0; pass < this.passes; pass++) {
            // 1-pass: sort top 16 bits only (shift=16). Approximate but fast.
            // 2-pass: LSB-first — pass 0 sorts lower 16 bits (shift=0), pass 1 sorts upper (shift=16).
            const shift = this.passes === 1 ? 16 : pass * 16;
            const histogramBuffer = this.device.createBuffer({
                size: BUCKET_COUNT * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            });
            this.histogramBuffers.push(histogramBuffer);
            const offsetsBuffer = this.device.createBuffer({
                size: BUCKET_COUNT * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.offsetsBuffers.push(offsetsBuffer);
            const uniformData = new Uint32Array([config.count, shift, 0, 0]);
            const uniformBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);
            this.uniformBuffers.push(uniformBuffer);
            // Determine src/dst buffers for ping-pong
            // 1-pass: primary → out, then copy back
            // 2-pass: primary → alt (pass 0), alt → primary (pass 1)
            let srcDepth;
            let srcIndex;
            let dstDepth;
            let dstIndex;
            if (this.passes === 1) {
                // Single pass: always read from primary, we'll copy back in execute
                srcDepth = config.buffers.depth;
                srcIndex = config.buffers.index;
                // Need dedicated output buffers
                if (!this.depthAlt) {
                    this.depthAlt = this.device.createBuffer({
                        size: config.count * 4,
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
                    });
                    this.indexAlt = this.device.createBuffer({
                        size: config.count * 4,
                        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
                    });
                }
                dstDepth = this.depthAlt;
                dstIndex = this.indexAlt;
            }
            else {
                // 2-pass ping-pong: even pass reads primary→alt, odd reads alt→primary
                if (pass % 2 === 0) {
                    srcDepth = config.buffers.depth;
                    srcIndex = config.buffers.index;
                    dstDepth = this.depthAlt;
                    dstIndex = this.indexAlt;
                }
                else {
                    srcDepth = this.depthAlt;
                    srcIndex = this.indexAlt;
                    dstDepth = config.buffers.depth;
                    dstIndex = config.buffers.index;
                }
            }
            // Histogram: read depths from src
            this.histogramBindGroups.push(this.device.createBindGroup({
                layout: this.histogramPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: srcDepth } },
                    { binding: 1, resource: { buffer: histogramBuffer } },
                    { binding: 2, resource: { buffer: uniformBuffer } },
                ],
            }));
            // Prefix sum: in-place on histogram buffer
            this.prefixSumBindGroups.push(this.device.createBindGroup({
                layout: this.prefixSumPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: histogramBuffer } },
                ],
            }));
            // Scatter: read from src, write to dst
            this.scatterBindGroups.push(this.device.createBindGroup({
                layout: this.scatterPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: srcDepth } },
                    { binding: 1, resource: { buffer: srcIndex } },
                    { binding: 2, resource: { buffer: dstDepth } },
                    { binding: 3, resource: { buffer: dstIndex } },
                    { binding: 4, resource: { buffer: offsetsBuffer } },
                    { binding: 5, resource: { buffer: uniformBuffer } },
                ],
            }));
        }
        this.configured = true;
    }
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
    executeFixed(encoder) {
        if (!this.configured)
            return;
        const [wgX, wgY] = getWorkgroupCounts(this.count, 256);
        for (let pass = 0; pass < this.passes; pass++) {
            // 1. Clear histogram buffer
            encoder.clearBuffer(this.histogramBuffers[pass]);
            // 2. Histogram pass
            {
                const p = encoder.beginComputePass();
                p.setPipeline(this.histogramPipeline);
                p.setBindGroup(0, this.histogramBindGroups[pass]);
                p.dispatchWorkgroups(wgX, wgY);
                p.end();
            }
            // 3. Prefix sum pass (single workgroup)
            {
                const p = encoder.beginComputePass();
                p.setPipeline(this.prefixSumPipeline);
                p.setBindGroup(0, this.prefixSumBindGroups[pass]);
                p.dispatchWorkgroups(1);
                p.end();
            }
            // 4. Copy prefix sums to offsets buffer
            encoder.copyBufferToBuffer(this.histogramBuffers[pass], 0, this.offsetsBuffers[pass], 0, BUCKET_COUNT * 4);
            // 5. Scatter pass
            {
                const p = encoder.beginComputePass();
                p.setPipeline(this.scatterPipeline);
                p.setBindGroup(0, this.scatterBindGroups[pass]);
                p.dispatchWorkgroups(wgX, wgY);
                p.end();
            }
        }
        // For single-pass: copy results back to primary buffers
        if (this.passes === 1) {
            encoder.copyBufferToBuffer(this.depthAlt, 0, this.buffers.depth, 0, this.count * 4);
            encoder.copyBufferToBuffer(this.indexAlt, 0, this.buffers.index, 0, this.count * 4);
        }
        // For 2-pass: final pass already writes to primary buffers (odd pass → primary)
    }
    executeIndirect(_encoder, _config) {
        unsupportedIndirectSort(this.name);
    }
    execute(encoder) {
        this.executeFixed(encoder);
    }
    destroyInternalBuffers() {
        for (const buf of this.histogramBuffers)
            buf.destroy();
        for (const buf of this.offsetsBuffers)
            buf.destroy();
        for (const buf of this.uniformBuffers)
            buf.destroy();
        this.depthAlt?.destroy();
        this.indexAlt?.destroy();
        this.histogramBuffers = [];
        this.offsetsBuffers = [];
        this.uniformBuffers = [];
        this.depthAlt = null;
        this.indexAlt = null;
        this.histogramBindGroups = [];
        this.prefixSumBindGroups = [];
        this.scatterBindGroups = [];
    }
    destroy() {
        this.destroyInternalBuffers();
        this.configured = false;
    }
}
