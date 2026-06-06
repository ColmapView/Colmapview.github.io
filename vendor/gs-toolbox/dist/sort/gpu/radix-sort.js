// Radix Sort Module
// ==================
// Parameterized GPU radix sort (1, 2, or 4 passes of 8-bit digits).
// Uses histogram -> scan -> scatter pipeline per pass with ping-pong buffers.
//
// Algorithm: LSD (Least Significant Digit) radix sort
//   Each pass sorts one 8-bit digit using a 3-stage pipeline:
//   1. Histogram — count occurrences of each digit (0-255) per workgroup
//   2. Scan — Blelloch parallel prefix sum to compute global write offsets
//   3. Scatter — move elements to sorted positions using countBefore (stable)
//
// Stability: The scatter pass uses a countBefore approach (not atomicAdd) to
//   compute deterministic destination indices. This ensures elements with the
//   same digit maintain their relative input order — critical for multi-pass
//   radix sort correctness where later passes depend on earlier pass ordering.
//
// Ping-pong: Even passes write primary→alt, odd passes write alt→primary.
//   For even total passes (2, 4), the final result is in primary buffers.
//   For odd total passes (1, 3), a copy-back from alt→primary is appended.
//
// Performance (measured on real Gaussian data):
//   | Variant    | Passes | Dispatches | 100K  | 500K  | 1M    | 2M     |
//   |------------|--------|------------|-------|-------|-------|--------|
//   | radix      | 4      | 12         | 3.8ms | 4.1ms | 4.9ms | 8.1ms  |
//   | radix-16bit| 2      | 6          | 3.8ms | 3.9ms | 4.6ms | 5.7ms  |
//   | radix-8bit | 1      | 3          | 3.1ms | 3.9ms | 5.6ms | 8.9ms  |
import { UnsupportedGPUSortCapabilityError } from './types';
import { radixHistogramSource, radixIndirectCopyBackSource, radixIndirectHistogramSource, radixIndirectScanSource, radixIndirectScatterSource, radixScanSource, radixScatterSource, } from './shaders';
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
export class RadixSortModule {
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
        this.indirectCountBuffer = null;
        this.indirectMaxCount = 0;
        this.indirectHistogramBindGroups = [];
        this.indirectScanBindGroups = [];
        this.indirectScatterBindGroups = [];
        this.indirectCopyBackBindGroup = null;
        this.indirectUniformBuffers = [];
        this.device = device;
        this.passes = options?.passes ?? 4;
        // Default startShift: sort the top N*8 bits
        if (options?.startShift !== undefined) {
            this.startShift = options.startShift;
        }
        else {
            this.startShift = (4 - this.passes) * 8;
        }
        const bits = this.passes * 8;
        this.name = `Radix ${bits}-bit`;
        this.capabilities = {
            fixedCount: true,
            indirectCount: true,
            stable: true,
            precisionBits: bits,
            keyFormat: 'u32-depth',
            indexFormat: 'u32-index',
            requiresPowerOfTwo: false,
        };
        // Create pipelines (reusable across configure calls)
        const histogramModule = device.createShaderModule({ code: radixHistogramSource });
        this.histogramPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: histogramModule, entryPoint: 'main' },
        });
        const scanModule = device.createShaderModule({ code: radixScanSource });
        this.scanPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: scanModule, entryPoint: 'main' },
        });
        const scatterModule = device.createShaderModule({ code: radixScatterSource });
        this.scatterPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: scatterModule, entryPoint: 'main' },
        });
        const indirectHistogramModule = device.createShaderModule({ code: radixIndirectHistogramSource });
        this.indirectHistogramPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: indirectHistogramModule, entryPoint: 'main' },
        });
        const indirectScanModule = device.createShaderModule({ code: radixIndirectScanSource });
        this.indirectScanPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: indirectScanModule, entryPoint: 'main' },
        });
        const indirectScatterModule = device.createShaderModule({ code: radixIndirectScatterSource });
        this.indirectScatterPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: indirectScatterModule, entryPoint: 'main' },
        });
        const indirectCopyBackModule = device.createShaderModule({ code: radixIndirectCopyBackSource });
        this.indirectCopyBackPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: indirectCopyBackModule, entryPoint: 'main' },
        });
    }
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
            size: 256 * this.numWorkgroups * 4,
            usage: GPUBufferUsage.STORAGE,
        });
        this.globalOffsetsBuffer = this.device.createBuffer({
            size: 256 * 4,
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
            const shift = this.startShift + pass * 8;
            // Ping-pong: pass 0 always reads from primary (where input lives).
            // Even passes read primary→alt, odd passes read alt→primary.
            // For even total passes (2, 4): last pass is odd → result in primary. OK.
            // For odd total passes (1, 3): last pass is even → result in alt. Copy back in execute().
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
     *   1. Histogram — each workgroup counts digits in its chunk
     *   2. Scan — single workgroup prefix-sums all histograms (Blelloch)
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
    createIndirectBindGroups(countBuffer, maxCount) {
        this.destroyIndirectBuffers();
        this.indirectCountBuffer = countBuffer;
        this.indirectMaxCount = maxCount;
        const { depth, index } = this.buffers;
        for (let pass = 0; pass < this.passes; pass++) {
            const shift = this.startShift + pass * 8;
            const readFromAlt = pass % 2 !== 0;
            const srcDepth = readFromAlt ? this.depthAlt : depth;
            const srcIndex = readFromAlt ? this.indexAlt : index;
            const dstDepth = readFromAlt ? depth : this.depthAlt;
            const dstIndex = readFromAlt ? index : this.indexAlt;
            const uniformData = new Uint32Array([maxCount, shift, this.numWorkgroups, 0]);
            const uniformBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);
            this.indirectUniformBuffers.push(uniformBuffer);
            this.indirectHistogramBindGroups.push(this.device.createBindGroup({
                layout: this.indirectHistogramPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: srcDepth } },
                    { binding: 1, resource: { buffer: this.histogramBuffer } },
                    { binding: 2, resource: { buffer: uniformBuffer } },
                    { binding: 3, resource: { buffer: countBuffer } },
                ],
            }));
            this.indirectScanBindGroups.push(this.device.createBindGroup({
                layout: this.indirectScanPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.histogramBuffer } },
                    { binding: 1, resource: { buffer: this.globalOffsetsBuffer } },
                    { binding: 2, resource: { buffer: uniformBuffer } },
                    { binding: 3, resource: { buffer: countBuffer } },
                ],
            }));
            this.indirectScatterBindGroups.push(this.device.createBindGroup({
                layout: this.indirectScatterPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: srcDepth } },
                    { binding: 1, resource: { buffer: srcIndex } },
                    { binding: 2, resource: { buffer: dstDepth } },
                    { binding: 3, resource: { buffer: dstIndex } },
                    { binding: 4, resource: { buffer: this.histogramBuffer } },
                    { binding: 5, resource: { buffer: uniformBuffer } },
                    { binding: 6, resource: { buffer: countBuffer } },
                ],
            }));
        }
        if (this.passes % 2 !== 0) {
            this.indirectCopyBackBindGroup = this.device.createBindGroup({
                layout: this.indirectCopyBackPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.depthAlt } },
                    { binding: 1, resource: { buffer: this.indexAlt } },
                    { binding: 2, resource: { buffer: depth } },
                    { binding: 3, resource: { buffer: index } },
                    { binding: 4, resource: { buffer: this.indirectUniformBuffers[0] } },
                    { binding: 5, resource: { buffer: countBuffer } },
                ],
            });
        }
    }
    executeIndirect(encoder, config) {
        if (!this.configured)
            return;
        if (config.countOffset !== undefined && config.countOffset !== 0) {
            throw new UnsupportedGPUSortCapabilityError(this.name, 'non-zero indirect count offsets');
        }
        if (config.maxCount > this.count) {
            throw new Error(`${this.name} indirect maxCount ${config.maxCount} exceeds configured capacity ${this.count}`);
        }
        if (this.indirectCountBuffer !== config.countBuffer || this.indirectMaxCount !== config.maxCount) {
            this.createIndirectBindGroups(config.countBuffer, config.maxCount);
        }
        for (let pass = 0; pass < this.passes; pass++) {
            {
                const computePass = encoder.beginComputePass();
                computePass.setPipeline(this.indirectHistogramPipeline);
                computePass.setBindGroup(0, this.indirectHistogramBindGroups[pass]);
                computePass.dispatchWorkgroups(this.numWorkgroups);
                computePass.end();
            }
            {
                const computePass = encoder.beginComputePass();
                computePass.setPipeline(this.indirectScanPipeline);
                computePass.setBindGroup(0, this.indirectScanBindGroups[pass]);
                computePass.dispatchWorkgroups(1);
                computePass.end();
            }
            {
                const computePass = encoder.beginComputePass();
                computePass.setPipeline(this.indirectScatterPipeline);
                computePass.setBindGroup(0, this.indirectScatterBindGroups[pass]);
                computePass.dispatchWorkgroups(this.numWorkgroups);
                computePass.end();
            }
        }
        if (this.passes % 2 !== 0) {
            const computePass = encoder.beginComputePass();
            computePass.setPipeline(this.indirectCopyBackPipeline);
            computePass.setBindGroup(0, this.indirectCopyBackBindGroup);
            computePass.dispatchWorkgroups(this.numWorkgroups);
            computePass.end();
        }
    }
    execute(encoder) {
        this.executeFixed(encoder);
    }
    destroyInternalBuffers() {
        this.destroyIndirectBuffers();
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
    destroyIndirectBuffers() {
        for (const buf of this.indirectUniformBuffers)
            buf.destroy();
        this.indirectUniformBuffers = [];
        this.indirectHistogramBindGroups = [];
        this.indirectScanBindGroups = [];
        this.indirectScatterBindGroups = [];
        this.indirectCopyBackBindGroup = null;
        this.indirectCountBuffer = null;
        this.indirectMaxCount = 0;
    }
    destroy() {
        this.destroyInternalBuffers();
        this.configured = false;
    }
}
