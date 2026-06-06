// Tiled Rasterization Module
// ===========================
// Compute-based tiled Gaussian splatting rasterization.
//
// Algorithm: The screen is divided into 16x16 tiles. Each Gaussian is
// intersected with its overlapping tiles, producing (tile_id|depth, gaussianId)
// pairs. These are sorted by a radix sort so Gaussians are grouped by tile
// with depth ordering within each tile. Per-tile rasterization uses shared
// memory batching and early transmittance termination.
//
// Internal pipeline (all within execute()):
//   0. Clear — fill intersection keys and tile offsets with sentinel
//   1. Intersect — compute tile-Gaussian overlaps, write key/value pairs
//   2. Sort — radix sort keys (reorders values in parallel)
//   3a. Offset Encode — detect tile boundaries in sorted keys
//   3b. Offset Fix — fill gaps for empty tiles (backward propagation)
//   4. Rasterize — per-tile alpha blending with shared memory batching
//   5. Blit — copy storage buffer to render target texture
//
// The external sort module is NOT used — this module handles sorting internally.
import { RadixSortModule } from '../../sort/gpu/radix-sort';
import { tileClearSource, tileIntersectSource, offsetEncodeSource, offsetFixSource, tiledRasterSource, blitSource, } from './tiled-shaders';
const RENDER_MODE_MAP = {
    'rgb': 0,
    'depth': 1,
    'rgbd': 2,
};
/**
 * GPU tiled rasterization module for Gaussian splatting.
 *
 * Self-contained compute pipeline that handles tile intersection, internal
 * sorting, offset encoding, and per-tile rasterization. Implements the
 * GPURasterModule interface for drop-in use with the existing pipeline.
 *
 * The external sort module should be SKIPPED when using this rasterizer —
 * sorting is handled internally with a radix sort on packed (tile_id, depth) keys.
 *
 * @example
 * ```typescript
 * const raster = new TiledRasterModule(device);
 * raster.configure({
 *   count: gaussianCount,
 *   buffers: { sortedIndices: indexBuf, splatData: splatBuf },
 *   format: 'bgra8unorm',
 * });
 * raster.setUniforms({ viewportWidth: 1920, viewportHeight: 1080, ... });
 *
 * const encoder = device.createCommandEncoder();
 * // Skip sortModule.execute(encoder) — tiled handles sorting internally
 * raster.execute(encoder, colorTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export class TiledRasterModule {
    constructor(device, options) {
        this.name = 'Tiled';
        this.blitPipeline = null;
        this.currentFormat = null;
        // Per-configure state
        this.configured = false;
        this.count = 0;
        this.maxIsects = 0;
        this.splatDataBuffer = null;
        // Viewport-dependent state
        this.tileWidth = 0;
        this.tileHeight = 0;
        this.viewportWidth = 0;
        this.viewportHeight = 0;
        // Internal GPU buffers
        this.isectKeys = null;
        this.isectVals = null;
        this.tileOffsets = null;
        this.outputColor = null;
        this.atomicCounter = null;
        // Bind groups (recreated when buffers change)
        this.clearBindGroup = null;
        this.intersectBindGroup = null;
        this.offsetEncodeBindGroup = null;
        this.offsetFixBindGroup = null;
        this.rasterBindGroup = null;
        this.blitBindGroup = null;
        this.needsRebuild = false;
        this.device = device;
        this.tileSize = options?.tileSize ?? 16;
        this.intersectionRatio = options?.intersectionRatio ?? 8;
        const shaderNames = ['clear', 'intersect', 'offsetEncode', 'offsetFix', 'raster', 'blit'];
        const shaderSources = [tileClearSource, tileIntersectSource, offsetEncodeSource, offsetFixSource, tiledRasterSource, blitSource];
        const shaderModules = [];
        for (let i = 0; i < shaderSources.length; i++) {
            const mod = device.createShaderModule({ code: shaderSources[i] });
            shaderModules.push(mod);
            mod.getCompilationInfo().then(info => {
                for (const msg of info.messages) {
                    if (msg.type === 'error') {
                        console.error(`[Tiled] Shader "${shaderNames[i]}" compilation ERROR: ${msg.message} (line ${msg.lineNum}:${msg.linePos})`);
                    }
                    else if (msg.type === 'warning') {
                        console.warn(`[Tiled] Shader "${shaderNames[i]}" warning: ${msg.message}`);
                    }
                }
            });
        }
        this.clearPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModules[0], entryPoint: 'main' },
        });
        this.intersectPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModules[1], entryPoint: 'main' },
        });
        this.offsetEncodePipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModules[2], entryPoint: 'main' },
        });
        this.offsetFixPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModules[3], entryPoint: 'main' },
        });
        this.rasterPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: shaderModules[4], entryPoint: 'main' },
        });
        this.blitShaderModule = shaderModules[5];
        this.sortModule = new RadixSortModule(device, { passes: 4 });
        this.clearUniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.intersectUniformBuffer = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.rasterUniformBuffer = device.createBuffer({
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.offsetFixUniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.blitUniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }
    configure(config) {
        this.count = config.count;
        this.maxIsects = config.count * this.intersectionRatio;
        this.splatDataBuffer = config.buffers.splatData;
        if (config.format !== this.currentFormat) {
            this.currentFormat = config.format;
            this.blitPipeline = this.device.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: this.blitShaderModule,
                    entryPoint: 'vs_blit',
                },
                fragment: {
                    module: this.blitShaderModule,
                    entryPoint: 'fs_blit',
                    targets: [{ format: config.format }],
                },
                primitive: { topology: 'triangle-list' },
            });
        }
        this.destroyInternalBuffers();
        this.isectKeys = this.device.createBuffer({
            size: Math.max(16, this.maxIsects * 4),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.isectVals = this.device.createBuffer({
            size: Math.max(16, this.maxIsects * 4),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.atomicCounter = this.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.sortModule.configure({
            count: this.maxIsects,
            buffers: { depth: this.isectKeys, index: this.isectVals },
        });
        this.needsRebuild = true;
        this.configured = true;
    }
    setUniforms(uniforms) {
        const vw = uniforms.viewportWidth;
        const vh = uniforms.viewportHeight;
        const tw = Math.ceil(vw / this.tileSize);
        const th = Math.ceil(vh / this.tileSize);
        if (vw !== this.viewportWidth || vh !== this.viewportHeight) {
            this.viewportWidth = vw;
            this.viewportHeight = vh;
            this.tileWidth = tw;
            this.tileHeight = th;
            const numTiles = tw * th;
            if (this.tileOffsets)
                this.tileOffsets.destroy();
            this.tileOffsets = this.device.createBuffer({
                size: Math.max(16, (numTiles + 1) * 4),
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            if (this.outputColor)
                this.outputColor.destroy();
            this.outputColor = this.device.createBuffer({
                size: Math.max(16, vw * vh * 16),
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            });
            this.needsRebuild = true;
        }
        if (this.needsRebuild) {
            this.createBindGroups();
            this.needsRebuild = false;
        }
        const numTiles = tw * th;
        const clearData = new Uint32Array([this.maxIsects, numTiles + 1, 0, 0]);
        this.device.queue.writeBuffer(this.clearUniformBuffer, 0, clearData);
        const intersectData = new Float32Array(8);
        const intersectIntView = new Uint32Array(intersectData.buffer);
        intersectIntView[0] = this.count;
        intersectIntView[1] = tw;
        intersectIntView[2] = th;
        intersectIntView[3] = this.maxIsects;
        intersectData[4] = uniforms.farPlane;
        intersectIntView[5] = this.tileSize;
        intersectIntView[6] = 0;
        intersectIntView[7] = 0;
        this.device.queue.writeBuffer(this.intersectUniformBuffer, 0, intersectData);
        const rasterData = new Float32Array(12);
        const rasterIntView = new Uint32Array(rasterData.buffer);
        rasterIntView[0] = vw;
        rasterIntView[1] = vh;
        rasterIntView[2] = tw;
        rasterIntView[3] = th;
        rasterData[4] = uniforms.nearPlane;
        rasterData[5] = uniforms.farPlane;
        rasterIntView[6] = (uniforms.antialiasing ?? true) ? 1 : 0;
        rasterIntView[7] = RENDER_MODE_MAP[uniforms.renderMode ?? 'rgb'];
        rasterData[8] = uniforms.alphaThreshold ?? (1.0 / 255.0);
        rasterIntView[9] = 0;
        rasterIntView[10] = 0;
        rasterIntView[11] = 0;
        this.device.queue.writeBuffer(this.rasterUniformBuffer, 0, rasterData);
        const fixData = new Uint32Array([numTiles, 0, 0, 0]);
        this.device.queue.writeBuffer(this.offsetFixUniformBuffer, 0, fixData);
        const blitData = new Uint32Array([vw, vh, 0, 0]);
        this.device.queue.writeBuffer(this.blitUniformBuffer, 0, blitData);
    }
    execute(encoder, colorTarget, depthTarget, clearColor, loadOp) {
        if (!this.configured || !this.clearBindGroup || !this.blitPipeline)
            return;
        const numTiles = this.tileWidth * this.tileHeight;
        const clearCount = Math.max(this.maxIsects, numTiles + 1);
        const clearWorkgroups = Math.min(65535, Math.ceil(clearCount / 256));
        const intersectWorkgroups = Math.min(65535, Math.ceil(this.count / 256));
        const offsetEncodeWorkgroups = Math.min(65535, Math.ceil(this.maxIsects / 256));
        // Stage 0: Clear keys + tile offsets, zero atomic counter
        encoder.clearBuffer(this.atomicCounter, 0, 4);
        {
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.clearPipeline);
            pass.setBindGroup(0, this.clearBindGroup);
            pass.dispatchWorkgroups(clearWorkgroups);
            pass.end();
        }
        // Stage 1: Tile intersection
        {
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.intersectPipeline);
            pass.setBindGroup(0, this.intersectBindGroup);
            pass.dispatchWorkgroups(intersectWorkgroups);
            pass.end();
        }
        // Stage 2: Internal radix sort (sorts isectKeys, reorders isectVals)
        this.sortModule.execute(encoder);
        // Stage 3a: Offset encode (detect tile boundaries)
        {
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.offsetEncodePipeline);
            pass.setBindGroup(0, this.offsetEncodeBindGroup);
            pass.dispatchWorkgroups(offsetEncodeWorkgroups);
            pass.end();
        }
        // Stage 3b: Offset fix (fill gaps for empty tiles)
        {
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.offsetFixPipeline);
            pass.setBindGroup(0, this.offsetFixBindGroup);
            pass.dispatchWorkgroups(1);
            pass.end();
        }
        // Stage 4: Tiled rasterization
        {
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.rasterPipeline);
            pass.setBindGroup(0, this.rasterBindGroup);
            pass.dispatchWorkgroups(this.tileWidth, this.tileHeight);
            pass.end();
        }
        // Stage 5: Blit storage buffer to render target
        {
            const pass = encoder.beginRenderPass({
                colorAttachments: [{
                        view: colorTarget,
                        clearValue: clearColor ?? { r: 0, g: 0, b: 0, a: 0 },
                        loadOp: loadOp ?? 'clear',
                        storeOp: 'store',
                    }],
            });
            pass.setPipeline(this.blitPipeline);
            pass.setBindGroup(0, this.blitBindGroup);
            pass.draw(3);
            pass.end();
        }
    }
    destroy() {
        this.destroyInternalBuffers();
        this.tileOffsets?.destroy();
        this.outputColor?.destroy();
        this.tileOffsets = null;
        this.outputColor = null;
        this.sortModule.destroy();
        this.clearUniformBuffer.destroy();
        this.intersectUniformBuffer.destroy();
        this.rasterUniformBuffer.destroy();
        this.offsetFixUniformBuffer.destroy();
        this.blitUniformBuffer.destroy();
        this.blitPipeline = null;
        this.configured = false;
    }
    // ---- Private helpers ----
    createBindGroups() {
        if (!this.isectKeys || !this.isectVals || !this.atomicCounter ||
            !this.tileOffsets || !this.outputColor || !this.splatDataBuffer) {
            return;
        }
        this.clearBindGroup = this.device.createBindGroup({
            layout: this.clearPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.isectKeys } },
                { binding: 1, resource: { buffer: this.tileOffsets } },
                { binding: 2, resource: { buffer: this.clearUniformBuffer } },
            ],
        });
        this.intersectBindGroup = this.device.createBindGroup({
            layout: this.intersectPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.splatDataBuffer } },
                { binding: 1, resource: { buffer: this.isectKeys } },
                { binding: 2, resource: { buffer: this.isectVals } },
                { binding: 3, resource: { buffer: this.atomicCounter } },
                { binding: 4, resource: { buffer: this.intersectUniformBuffer } },
            ],
        });
        this.offsetEncodeBindGroup = this.device.createBindGroup({
            layout: this.offsetEncodePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.isectKeys } },
                { binding: 1, resource: { buffer: this.tileOffsets } },
                { binding: 2, resource: { buffer: this.atomicCounter } },
            ],
        });
        this.offsetFixBindGroup = this.device.createBindGroup({
            layout: this.offsetFixPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.tileOffsets } },
                { binding: 1, resource: { buffer: this.atomicCounter } },
                { binding: 2, resource: { buffer: this.offsetFixUniformBuffer } },
            ],
        });
        this.rasterBindGroup = this.device.createBindGroup({
            layout: this.rasterPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.rasterUniformBuffer } },
                { binding: 1, resource: { buffer: this.splatDataBuffer } },
                { binding: 2, resource: { buffer: this.isectVals } },
                { binding: 3, resource: { buffer: this.tileOffsets } },
                { binding: 4, resource: { buffer: this.outputColor } },
            ],
        });
        if (this.blitPipeline) {
            this.blitBindGroup = this.device.createBindGroup({
                layout: this.blitPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.outputColor } },
                    { binding: 1, resource: { buffer: this.blitUniformBuffer } },
                ],
            });
        }
    }
    destroyInternalBuffers() {
        this.isectKeys?.destroy();
        this.isectVals?.destroy();
        this.atomicCounter?.destroy();
        this.isectKeys = null;
        this.isectVals = null;
        this.atomicCounter = null;
        // Note: tileOffsets and outputColor are viewport-dependent,
        // destroyed separately in setUniforms when viewport changes
        this.clearBindGroup = null;
        this.intersectBindGroup = null;
        this.offsetEncodeBindGroup = null;
        this.offsetFixBindGroup = null;
        this.rasterBindGroup = null;
        this.blitBindGroup = null;
    }
}
