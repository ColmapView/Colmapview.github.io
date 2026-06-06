import type { GPUSortConfig, GPUSortIndirectConfig, GPUSortModule } from './types';
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
export declare class BitonicSortModule implements GPUSortModule {
    readonly name = "Bitonic";
    readonly capabilities: import("./types").GPUSortCapabilities;
    private device;
    private pipeline;
    private configured;
    private realCount;
    private sortCount;
    private uniformBuffers;
    private bindGroups;
    private paddedDepth;
    private paddedIndex;
    private primaryDepth;
    private primaryIndex;
    private needsPadding;
    constructor(device: GPUDevice);
    /**
     * (Re)configure bind groups for all (j, k) pairs.
     *
     * Creates one uniform buffer + bind group per (j, k) step. The total number
     * of steps is log2(n) * (log2(n)+1) / 2, where n = nextPowerOf2(count).
     *
     * When count is not a power of 2, internal padded buffers are created.
     * Padding depths are set to 0xFFFFFFFF so phantom elements sort to the back.
     */
    configure(config: GPUSortConfig): void;
    /**
     * Encode bitonic sort dispatches.
     *
     * When padding is needed: copies primary→internal, sorts on internal buffers,
     * then copies sorted results back to primary buffers.
     */
    executeFixed(encoder: GPUCommandEncoder): void;
    executeIndirect(_encoder: GPUCommandEncoder, _config: GPUSortIndirectConfig): void;
    execute(encoder: GPUCommandEncoder): void;
    private destroyInternalBuffers;
    destroy(): void;
}
