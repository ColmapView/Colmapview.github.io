// Billboard Rasterization Module
// ==============================
// Instanced billboard quad rasterization for Gaussian splatting.
//
// Algorithm: Each Gaussian is drawn as a screen-aligned quad (6 vertices,
// 2 triangles) using the vertex shader to expand precomputed SplatData
// into billboard geometry. The fragment shader evaluates 2D Gaussian falloff
// using the inverse covariance matrix (conic) and applies alpha blending.
//
// Blend modes:
//   Front-to-back ("under"): src * (1 - dstAlpha) + dst
//     Natural pairing with ascending radix sort output. Near splats composite
//     first; once alpha saturates, later splats contribute nothing.
//
//   Back-to-front ("over"): src + dst * (1 - srcAlpha)
//     Classic painter's algorithm. Requires reading sorted indices in reverse.
//     Standard alpha compositing order used in most graphics literature.
//
// Performance: The billboard approach has zero compute overhead (no tiling,
// no per-tile sort). GPU handles overdraw via early fragment discard and
// alpha saturation. Suitable for scenes up to ~5M Gaussians on modern GPUs.
import { billboardShaderSource } from './shaders';
/** Render mode enum values matching the WGSL constants. */
const RENDER_MODE_MAP = {
    'rgb': 0,
    'depth': 1,
    'rgbd': 2,
};
/**
 * GPU billboard rasterization module for Gaussian splatting.
 *
 * Draws Gaussians as instanced screen-aligned quads with 2D Gaussian falloff.
 * Supports front-to-back ("under") and back-to-front ("over") alpha blending.
 *
 * @example
 * ```typescript
 * // Front-to-back (pairs with ascending radix sort)
 * const raster = new BillboardRasterModule(device, { blend: 'front-to-back' });
 *
 * raster.configure({
 *   count: gaussianCount,
 *   buffers: { sortedIndices: indexBuf, splatData: splatBuf },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * raster.setUniforms({
 *   viewportWidth: canvas.width,
 *   viewportHeight: canvas.height,
 *   nearPlane: 0.1,
 *   farPlane: 100,
 *   numGaussians: activeCount,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * raster.execute(encoder, colorTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export class BillboardRasterModule {
    constructor(device, options) {
        // Per-configure state
        this.configured = false;
        this.count = 0;
        this.pipeline = null;
        this.bindGroup = null;
        // Track format to avoid unnecessary pipeline recreation
        this.currentFormat = null;
        this.currentDepthFormat = null;
        this.device = device;
        this.blend = options?.blend ?? 'front-to-back';
        this.reverseSort = this.blend === 'back-to-front';
        this.name = this.blend === 'front-to-back' ? 'Billboard FTB' : 'Billboard BTF';
        this.shaderModule = device.createShaderModule({ code: billboardShaderSource });
        this.uniformBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }
    configure(config) {
        this.count = config.count;
        // Recreate pipeline only if format changed
        const formatChanged = config.format !== this.currentFormat;
        const depthFormatChanged = config.depthFormat !== this.currentDepthFormat;
        if (formatChanged || depthFormatChanged || !this.pipeline) {
            this.currentFormat = config.format;
            this.currentDepthFormat = config.depthFormat ?? null;
            this.createPipeline(config.format, config.depthFormat);
        }
        this.createBindGroup(config.buffers);
        this.configured = true;
    }
    setUniforms(uniforms) {
        // 112 bytes matching WGSL Uniforms struct
        const data = new Float32Array(28);
        const intView = new Uint32Array(data.buffer);
        if (uniforms.projMatrix) {
            data.set(uniforms.projMatrix, 0);
        }
        else {
            data[0] = 1;
            data[5] = 1;
            data[10] = 1;
            data[15] = 1;
        }
        data[16] = uniforms.viewportWidth;
        data[17] = uniforms.viewportHeight;
        data[18] = uniforms.nearPlane;
        data[19] = uniforms.farPlane;
        intView[20] = (uniforms.antialiasing ?? true) ? 1 : 0;
        intView[21] = RENDER_MODE_MAP[uniforms.renderMode ?? 'rgb'];
        intView[22] = uniforms.numGaussians;
        intView[23] = this.reverseSort ? 1 : 0;
        intView[24] = (uniforms.useDepthTest ?? false) ? 1 : 0;
        data[25] = uniforms.alphaThreshold ?? (1.0 / 255.0);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
    }
    execute(encoder, colorTarget, depthTarget, clearColor, loadOp) {
        if (!this.configured || !this.pipeline || !this.bindGroup)
            return;
        const colorAttachment = {
            view: colorTarget,
            clearValue: clearColor ?? { r: 0, g: 0, b: 0, a: 0 },
            loadOp: loadOp ?? 'clear',
            storeOp: 'store',
        };
        const descriptor = {
            colorAttachments: [colorAttachment],
        };
        // Add depth attachment if configured
        if (depthTarget && this.currentDepthFormat) {
            descriptor.depthStencilAttachment = {
                view: depthTarget,
                depthClearValue: 1.0,
                depthLoadOp: 'clear', // depth is always reset per frame
                depthStoreOp: 'store',
            };
        }
        const pass = encoder.beginRenderPass(descriptor);
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.draw(6 * this.count);
        pass.end();
    }
    destroy() {
        this.uniformBuffer.destroy();
        this.pipeline = null;
        this.bindGroup = null;
        this.configured = false;
    }
    // ---- Private helpers ----
    createPipeline(format, depthFormat) {
        const blendState = this.getBlendState();
        const descriptor = {
            layout: 'auto',
            vertex: {
                module: this.shaderModule,
                entryPoint: 'vs_main',
            },
            fragment: {
                module: this.shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format, blend: blendState }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
        };
        if (depthFormat) {
            descriptor.depthStencil = {
                format: depthFormat,
                depthWriteEnabled: true,
                depthCompare: 'less',
            };
        }
        this.pipeline = this.device.createRenderPipeline(descriptor);
    }
    createBindGroup(buffers) {
        if (!this.pipeline)
            return;
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: buffers.sortedIndices } },
                { binding: 2, resource: { buffer: buffers.splatData } },
            ],
        });
    }
    getBlendState() {
        if (this.blend === 'front-to-back') {
            // "Under" blending: result = src * (1 - dstAlpha) + dst
            return {
                color: {
                    srcFactor: 'one-minus-dst-alpha',
                    dstFactor: 'one',
                    operation: 'add',
                },
                alpha: {
                    srcFactor: 'one-minus-dst-alpha',
                    dstFactor: 'one',
                    operation: 'add',
                },
            };
        }
        else {
            // "Over" blending: result = src + dst * (1 - srcAlpha)
            return {
                color: {
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                    operation: 'add',
                },
                alpha: {
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                    operation: 'add',
                },
            };
        }
    }
}
