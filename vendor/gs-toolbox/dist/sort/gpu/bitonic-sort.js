// Bitonic Sort Module
// ====================
// GPU bitonic sort — O(log^2 n) dispatches. Good fallback for small counts.
// Operates in-place on depth/index buffers (no ping-pong needed).
//
// Algorithm: Bitonic merge sort (Batcher, 1968)
//   Builds increasingly large bitonic sequences and merges them.
//   Each (j, k) step is one compute dispatch that compares and swaps
//   element pairs at distance j, with sort direction determined by k.
//
// Total dispatches: sum_{k=1}^{log2(n)} k = log2(n) * (log2(n)+1) / 2
//   e.g. n=1M → ~190 dispatches, n=100K → ~136 dispatches
//
// Trade-offs:
//   + Simple shader (compare-and-swap)
//   + Exact 32-bit sort
//   + Operates in-place when count is a power of 2
//   - O(log^2 n) dispatches (vs O(1) passes for radix)
//   - Requires padding to next power of 2 (allocates internal padded buffers)
//   - Poor scaling at large sizes (>500K)
//
// Performance (measured):
//   100K: 3.9ms | 500K: 4.3ms | 1M: 9.0ms | 2M: 13.9ms
import { getGPUSortAlgorithmCapabilities, unsupportedIndirectSort } from './types';
import { nextPowerOf2, getWorkgroupCounts } from './types';
import { bitonicSortSource } from './shaders';
/**
 * GPU bitonic sort module — in-place comparison sort with O(log^2 n) dispatches.
 *
 * Good fallback when internal buffer allocation is undesirable. Exact 32-bit
 * sort, but scales poorly beyond ~500K elements due to the number of dispatches.
 *
 * @example
 * ```typescript
 * const sort = new BitonicSortModule(device);
 * sort.configure({ count: gaussianCount, buffers: { depth, index } });
 * sort.execute(commandEncoder);
 * ```
 */
export class BitonicSortModule {
    constructor(device) {
        this.name = 'Bitonic';
        this.capabilities = getGPUSortAlgorithmCapabilities('bitonic');
        // Per-configure state
        this.configured = false;
        this.realCount = 0;
        this.sortCount = 0;
        this.uniformBuffers = [];
        this.bindGroups = [];
        // Internal padded buffers (only allocated when count != nextPowerOf2(count))
        this.paddedDepth = null;
        this.paddedIndex = null;
        this.primaryDepth = null;
        this.primaryIndex = null;
        this.needsPadding = false;
        this.device = device;
        const module = device.createShaderModule({ code: bitonicSortSource });
        this.pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module, entryPoint: 'main' },
        });
    }
    /**
     * (Re)configure bind groups for all (j, k) pairs.
     *
     * Creates one uniform buffer + bind group per (j, k) step. The total number
     * of steps is log2(n) * (log2(n)+1) / 2, where n = nextPowerOf2(count).
     *
     * When count is not a power of 2, internal padded buffers are created.
     * Padding depths are set to 0xFFFFFFFF so phantom elements sort to the back.
     */
    configure(config) {
        this.destroyInternalBuffers();
        if (config.count === 0) {
            this.configured = false;
            return;
        }
        this.realCount = config.count;
        this.sortCount = nextPowerOf2(config.count);
        this.needsPadding = this.sortCount > this.realCount;
        const { depth, index } = config.buffers;
        this.primaryDepth = depth;
        this.primaryIndex = index;
        // Determine which buffers the bind groups point to
        let sortDepth;
        let sortIndex;
        if (this.needsPadding) {
            // Create internal padded buffers with depth padding = 0xFFFFFFFF
            // so phantom elements sort to the back (maximum depth).
            const paddedSize = this.sortCount * 4;
            // Depth buffer: fill padding region with 0xFFFFFFFF
            this.paddedDepth = this.device.createBuffer({
                size: paddedSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true,
            });
            const depthMapping = new Uint32Array(this.paddedDepth.getMappedRange());
            depthMapping.fill(0xFFFFFFFF); // all slots start as max depth
            this.paddedDepth.unmap();
            // Index buffer: padding values don't matter (they'll sort to back)
            this.paddedIndex = this.device.createBuffer({
                size: paddedSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            });
            sortDepth = this.paddedDepth;
            sortIndex = this.paddedIndex;
        }
        else {
            // No padding needed — bind directly to primary buffers
            sortDepth = depth;
            sortIndex = index;
        }
        // Create a uniform buffer and bind group for each (j, k) pair
        for (let k = 2; k <= this.sortCount; k *= 2) {
            for (let j = k / 2; j > 0; j = Math.floor(j / 2)) {
                const uniformData = new Uint32Array([j, k, this.sortCount, 0]);
                const uniformBuffer = this.device.createBuffer({
                    size: 16,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
                this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);
                this.uniformBuffers.push(uniformBuffer);
                const bindGroup = this.device.createBindGroup({
                    layout: this.pipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: { buffer: sortIndex } },
                        { binding: 1, resource: { buffer: sortDepth } },
                        { binding: 2, resource: { buffer: uniformBuffer } },
                    ],
                });
                this.bindGroups.push(bindGroup);
            }
        }
        this.configured = true;
    }
    /**
     * Encode bitonic sort dispatches.
     *
     * When padding is needed: copies primary→internal, sorts on internal buffers,
     * then copies sorted results back to primary buffers.
     */
    executeFixed(encoder) {
        if (!this.configured)
            return;
        const realBytes = this.realCount * 4;
        // Copy primary → internal padded buffers (real elements only, padding stays 0xFFFFFFFF)
        if (this.needsPadding && this.paddedDepth && this.paddedIndex && this.primaryDepth && this.primaryIndex) {
            encoder.copyBufferToBuffer(this.primaryDepth, 0, this.paddedDepth, 0, realBytes);
            encoder.copyBufferToBuffer(this.primaryIndex, 0, this.paddedIndex, 0, realBytes);
        }
        // Run all bitonic sort passes
        const [sortX, sortY] = getWorkgroupCounts(this.sortCount, 256);
        for (const bindGroup of this.bindGroups) {
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(sortX, sortY);
            pass.end();
        }
        // Copy sorted results back: internal → primary (real elements only)
        if (this.needsPadding && this.paddedDepth && this.paddedIndex && this.primaryDepth && this.primaryIndex) {
            encoder.copyBufferToBuffer(this.paddedDepth, 0, this.primaryDepth, 0, realBytes);
            encoder.copyBufferToBuffer(this.paddedIndex, 0, this.primaryIndex, 0, realBytes);
        }
    }
    executeIndirect(_encoder, _config) {
        unsupportedIndirectSort(this.name);
    }
    execute(encoder) {
        this.executeFixed(encoder);
    }
    destroyInternalBuffers() {
        for (const buf of this.uniformBuffers)
            buf.destroy();
        this.uniformBuffers = [];
        this.bindGroups = [];
        this.paddedDepth?.destroy();
        this.paddedIndex?.destroy();
        this.paddedDepth = null;
        this.paddedIndex = null;
        this.primaryDepth = null;
        this.primaryIndex = null;
    }
    destroy() {
        this.destroyInternalBuffers();
        this.configured = false;
    }
}
