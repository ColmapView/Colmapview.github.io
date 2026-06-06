// Radix4 Sort Module
// ===================
// 4-bit GPU radix sort (2, 4, or 8 passes of 4-bit digits).
// Uses histogram -> scan -> scatter pipeline per pass with ping-pong buffers.
//
// Algorithm: LSD (Least Significant Digit) radix sort with 16 bins per pass
//   Each pass sorts one 4-bit digit using a 3-stage pipeline:
//   1. Histogram — count occurrences of each digit (0-15) per workgroup
//   2. Scan — Blelloch parallel prefix sum across 16 digits
//   3. Scatter — move elements to sorted positions using countBefore (stable)
//
// Compared to 8-bit radix (256 bins):
//   - Less shared memory and atomic contention (16 vs 256 bins)
//   - Trivial scan pass (16 elements vs 256)
//   - More passes for the same precision (2x)
//   - Foundation for future dynamic dispatch (GPU-side element count)
//
// Ping-pong: Even passes write primary→alt, odd passes write alt→primary.
//   For even total passes (2, 4, 8), the final result is in primary buffers.
//   For odd total passes, a copy-back from alt→primary is appended.
import { unsupportedIndirectSort } from './types';
import { radix4HistogramSource, radix4ScanSource, radix4ScatterSource } from './shaders';
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
export class Radix4BitSortModule {
    constructor(device, options) {
        // Per-configure state
        this.configured = false;
        this.count = 0;
        this.numWorkgroups = 0;
        this.buffers = null;
        // Internal buffers (created in configure)
        this.depthAlt = null;
        this.indexAlt = null;
        this.histogramBuffer = null;
        this.globalOffsetsBuffer = null;
        // Pre-created bind groups and uniforms for each pass
        this.histogramBindGroups = [];
        this.scanBindGroups = [];
        this.scatterBindGroups = [];
        this.uniformBuffers = [];
        this.device = device;
        this.passes = options?.passes ?? 8;
        // Default startShift: sort the top N*4 bits
        if (options?.startShift !== undefined) {
            this.startShift = options.startShift;
        }
        else {
            this.startShift = (8 - this.passes) * 4;
        }
        const bits = this.passes * 4;
        this.name = `Radix4 ${bits}-bit`;
        this.capabilities = {
            fixedCount: true,
            indirectCount: false,
            stable: true,
            precisionBits: bits,
            keyFormat: 'u32-depth',
            indexFormat: 'u32-index',
            requiresPowerOfTwo: false,
        };
        // Create pipelines (reusable across configure calls)
        const histogramModule = device.createShaderModule({ code: radix4HistogramSource });
        this.histogramPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: histogramModule, entryPoint: 'main' },
        });
        const scanModule = device.createShaderModule({ code: radix4ScanSource });
        this.scanPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: scanModule, entryPoint: 'main' },
        });
        const scatterModule = device.createShaderModule({ code: radix4ScatterSource });
        this.scatterPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: scatterModule, entryPoint: 'main' },
        });
    }
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
    configure(config) {
        // Destroy previous internal buffers
        this.destroyInternalBuffers();
        if (config.count === 0) {
            this.configured = false;
            return;
        }
        this.count = config.count;
        this.buffers = config.buffers;
        this.numWorkgroups = Math.min(1024, Math.ceil(config.count / 256));
        // Create internal ping-pong buffers
        // COPY_SRC needed for copy-back when passes is odd
        this.depthAlt = this.device.createBuffer({
            size: config.count * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        this.indexAlt = this.device.createBuffer({
            size: config.count * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        this.histogramBuffer = this.device.createBuffer({
            size: 16 * this.numWorkgroups * 4,
            usage: GPUBufferUsage.STORAGE,
        });
        this.globalOffsetsBuffer = this.device.createBuffer({
            size: 16 * 4,
            usage: GPUBufferUsage.STORAGE,
        });
        this.createBindGroups();
        this.configured = true;
    }
    createBindGroups() {
        const { depth, index } = this.buffers;
        this.histogramBindGroups = [];
        this.scanBindGroups = [];
        this.scatterBindGroups = [];
        for (let pass = 0; pass < this.passes; pass++) {
            const shift = this.startShift + pass * 4;
            // Ping-pong: even passes read primary→alt, odd passes read alt→primary.
            const readFromAlt = pass % 2 !== 0;
            const srcDepth = readFromAlt ? this.depthAlt : depth;
            const srcIndex = readFromAlt ? this.indexAlt : index;
            const dstDepth = readFromAlt ? depth : this.depthAlt;
            const dstIndex = readFromAlt ? index : this.indexAlt;
            // Uniform for histogram + scatter
            const uniformData = new Uint32Array([this.count, shift, this.numWorkgroups, 0]);
            const uniformBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);
            this.uniformBuffers.push(uniformBuffer);
            // Histogram bind group
            this.histogramBindGroups.push(this.device.createBindGroup({
                layout: this.histogramPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: srcDepth } },
                    { binding: 1, resource: { buffer: this.histogramBuffer } },
                    { binding: 2, resource: { buffer: uniformBuffer } },
                ],
            }));
            // Scan uniform (just numWorkgroups)
            const scanUniformData = new Uint32Array([this.numWorkgroups, 0, 0, 0]);
            const scanUniformBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(scanUniformBuffer, 0, scanUniformData);
            this.uniformBuffers.push(scanUniformBuffer);
            this.scanBindGroups.push(this.device.createBindGroup({
                layout: this.scanPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.histogramBuffer } },
                    { binding: 1, resource: { buffer: this.globalOffsetsBuffer } },
                    { binding: 2, resource: { buffer: scanUniformBuffer } },
                ],
            }));
            // Scatter bind group
            this.scatterBindGroups.push(this.device.createBindGroup({
                layout: this.scatterPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: srcDepth } },
                    { binding: 1, resource: { buffer: srcIndex } },
                    { binding: 2, resource: { buffer: dstDepth } },
                    { binding: 3, resource: { buffer: dstIndex } },
                    { binding: 4, resource: { buffer: this.histogramBuffer } },
                    { binding: 5, resource: { buffer: uniformBuffer } },
                ],
            }));
        }
    }
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
    executeFixed(encoder) {
        if (!this.configured)
            return;
        for (let pass = 0; pass < this.passes; pass++) {
            // 1. Histogram
            {
                const computePass = encoder.beginComputePass();
                computePass.setPipeline(this.histogramPipeline);
                computePass.setBindGroup(0, this.histogramBindGroups[pass]);
                computePass.dispatchWorkgroups(this.numWorkgroups);
                computePass.end();
            }
            // 2. Scan (prefix sum)
            {
                const computePass = encoder.beginComputePass();
                computePass.setPipeline(this.scanPipeline);
                computePass.setBindGroup(0, this.scanBindGroups[pass]);
                computePass.dispatchWorkgroups(1);
                computePass.end();
            }
            // 3. Scatter
            {
                const computePass = encoder.beginComputePass();
                computePass.setPipeline(this.scatterPipeline);
                computePass.setBindGroup(0, this.scatterBindGroups[pass]);
                computePass.dispatchWorkgroups(this.numWorkgroups);
                computePass.end();
            }
        }
        // If odd number of passes, result is in alt buffers — copy back to primary
        if (this.passes % 2 !== 0) {
            encoder.copyBufferToBuffer(this.depthAlt, 0, this.buffers.depth, 0, this.count * 4);
            encoder.copyBufferToBuffer(this.indexAlt, 0, this.buffers.index, 0, this.count * 4);
        }
    }
    executeIndirect(_encoder, _config) {
        unsupportedIndirectSort(this.name);
    }
    execute(encoder) {
        this.executeFixed(encoder);
    }
    destroyInternalBuffers() {
        this.depthAlt?.destroy();
        this.indexAlt?.destroy();
        this.histogramBuffer?.destroy();
        this.globalOffsetsBuffer?.destroy();
        for (const buf of this.uniformBuffers)
            buf.destroy();
        this.depthAlt = null;
        this.indexAlt = null;
        this.histogramBuffer = null;
        this.globalOffsetsBuffer = null;
        this.uniformBuffers = [];
        this.histogramBindGroups = [];
        this.scanBindGroups = [];
        this.scatterBindGroups = [];
    }
    destroy() {
        this.destroyInternalBuffers();
        this.configured = false;
    }
}
