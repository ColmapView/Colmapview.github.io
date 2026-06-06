// Stochastic Rasterization Module
// ================================
// Sort-independent stochastic transparency rasterization for Gaussian splatting.
//
// Algorithm: Each Gaussian is drawn as a screen-aligned quad (same as billboard).
// Instead of alpha blending, the fragment shader uses a PCG hash to make a
// per-fragment binary keep/discard decision based on opacity. Kept fragments
// are written as fully opaque with hardware depth testing, so no sorting is
// needed for correct occlusion (though sorting still helps visual quality).
//
// The stochastic approach produces per-pixel noise that averages out when
// accumulating over multiple frames (temporal anti-aliasing). The frameIndex
// uniform should increment each frame to vary the noise pattern.
//
// Depth testing is always enabled (this is fundamental to stochastic transparency).
import { stochasticShaderSource } from './stochastic-shaders';
/**
 * GPU stochastic rasterization module for Gaussian splatting.
 *
 * Uses PCG hash stochastic alpha test with hardware depth testing instead
 * of sorted alpha blending. Produces noisy but sort-order-independent results
 * that converge with temporal accumulation.
 *
 * @example
 * ```typescript
 * const raster = new StochasticRasterModule(device);
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
 *   projMatrix: projMat,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * raster.execute(encoder, colorTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export class StochasticRasterModule {
    constructor(device) {
        this.name = 'Stochastic';
        // Per-configure state
        this.configured = false;
        this.count = 0;
        this.pipeline = null;
        this.bindGroup = null;
        // Track format to avoid unnecessary pipeline recreation
        this.currentFormat = null;
        this.currentDepthFormat = null;
        // Internal depth texture (created when no external depth target is provided)
        this.internalDepthTexture = null;
        this.internalDepthWidth = 0;
        this.internalDepthHeight = 0;
        // Auto-incrementing frame counter for temporal noise variation
        this.frameCounter = 0;
        // Cached viewport for internal depth texture sizing
        this.viewportWidth = 0;
        this.viewportHeight = 0;
        // Cached view for the internal depth texture (avoids createView() every frame)
        this.internalDepthView = null;
        this.device = device;
        this.shaderModule = device.createShaderModule({ code: stochasticShaderSource });
        this.uniformBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }
    configure(config) {
        this.count = config.count;
        // Always use depth — default to depth24plus if not specified
        const depthFormat = config.depthFormat ?? 'depth24plus';
        const formatChanged = config.format !== this.currentFormat;
        const depthFormatChanged = depthFormat !== this.currentDepthFormat;
        if (formatChanged || depthFormatChanged || !this.pipeline) {
            this.currentFormat = config.format;
            this.currentDepthFormat = depthFormat;
            this.createPipeline(config.format, depthFormat);
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
        intView[21] = 0; // Always RGB mode for stochastic
        intView[22] = uniforms.numGaussians;
        intView[23] = 0; // No reverse sort needed
        intView[24] = 1; // Always use depth test
        data[25] = uniforms.alphaThreshold ?? (1.0 / 255.0);
        // frameIndex: use provided value or auto-increment
        intView[26] = uniforms.frameIndex ?? this.frameCounter;
        this.frameCounter++;
        this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
        // Cache viewport dimensions for internal depth texture
        this.viewportWidth = uniforms.viewportWidth;
        this.viewportHeight = uniforms.viewportHeight;
    }
    execute(encoder, colorTarget, depthTarget, clearColor, loadOp) {
        if (!this.configured || !this.pipeline || !this.bindGroup)
            return;
        // Ensure depth target exists (create internal one if not provided)
        const depthView = depthTarget ?? this.ensureInternalDepthTexture();
        const colorAttachment = {
            view: colorTarget,
            clearValue: clearColor ?? { r: 0, g: 0, b: 0, a: 0 },
            loadOp: loadOp ?? 'clear',
            storeOp: 'store',
        };
        const descriptor = {
            colorAttachments: [colorAttachment],
            depthStencilAttachment: {
                view: depthView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear', // depth is always reset per frame
                depthStoreOp: 'store',
            },
        };
        const pass = encoder.beginRenderPass(descriptor);
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.draw(6 * this.count);
        pass.end();
    }
    destroy() {
        this.uniformBuffer.destroy();
        if (this.internalDepthTexture) {
            this.internalDepthTexture.destroy();
            this.internalDepthTexture = null;
        }
        this.pipeline = null;
        this.bindGroup = null;
        this.configured = false;
    }
    // ---- Private helpers ----
    createPipeline(format, depthFormat) {
        const descriptor = {
            layout: 'auto',
            vertex: {
                module: this.shaderModule,
                entryPoint: 'vs_main',
            },
            fragment: {
                module: this.shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format }], // No blend state — stochastic outputs opaque fragments
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
            depthStencil: {
                format: depthFormat,
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
        };
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
    ensureInternalDepthTexture() {
        const w = this.viewportWidth || 1;
        const h = this.viewportHeight || 1;
        if (this.internalDepthTexture && this.internalDepthWidth === w && this.internalDepthHeight === h) {
            return this.internalDepthView;
        }
        if (this.internalDepthTexture)
            this.internalDepthTexture.destroy();
        this.internalDepthTexture = this.device.createTexture({
            size: { width: w, height: h },
            format: this.currentDepthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.internalDepthWidth = w;
        this.internalDepthHeight = h;
        this.internalDepthView = this.internalDepthTexture.createView();
        return this.internalDepthView;
    }
}
