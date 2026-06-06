// Depth-of-Field Output Module
// ============================
// Fullscreen post-processing pass that applies depth-of-field blur to the
// Gaussian rasterization output using a separable (two-pass) approach.
//
// Circle-of-Confusion (CoC) formula:
//   coc = aperture * |linearDepth - focalDistance| / linearDepth
//
// Execution is two render passes (horizontal then vertical) using a
// ping-pong intermediate texture:
//   Pass 1: colorTexture + depthTexture → intermediateTexture (horizontal blur)
//   Pass 2: intermediateTexture + depthTexture → target (vertical blur)
//
// Each pass reads the depth texture to compute per-pixel CoC, then applies
// a 9-tap weighted Gaussian blur along the pass direction axis.
import { dofShaderSource } from './shaders';
/**
 * GPU depth-of-field output module for Gaussian splatting.
 *
 * Applies separable circle-of-confusion blur as a two-pass post-process.
 * Requires a depth texture from the rasterization stage.
 *
 * @example
 * ```typescript
 * const dof = new DofOutputModule(device);
 *
 * dof.configure({
 *   buffers: { colorTexture: rasterColor, depthTexture: rasterDepth },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * dof.setUniforms({
 *   viewportWidth: canvas.width,
 *   viewportHeight: canvas.height,
 *   focalDistance: 5.0,
 *   aperture: 0.05,
 *   nearPlane: 0.1,
 *   farPlane: 100.0,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * dof.execute(encoder, canvasTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export class DofOutputModule {
    constructor(device, _options) {
        this.name = 'Depth of Field';
        // Per-configure state
        this.configured = false;
        this.pipeline = null;
        this.horizontalBindGroup = null;
        this.verticalBindGroup = null;
        // Intermediate ping-pong texture for two-pass blur
        this.intermediateTexture = null;
        // Track format and size to avoid unnecessary recreation
        this.currentFormat = null;
        this.currentWidth = 0;
        this.currentHeight = 0;
        // Cached depth texture view for bind group creation
        this.depthTextureView = null;
        this.device = device;
        this.shaderModule = device.createShaderModule({ code: dofShaderSource });
        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });
        // Two uniform buffers — one per blur direction (H=0, V=1)
        this.uniformBufferH = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.uniformBufferV = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // Dummy 1x1 depth texture (mid-range depth, produces mild uniform blur when no real depth)
        this.dummyDepthTexture = device.createTexture({
            size: [1, 1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture({ texture: this.dummyDepthTexture }, new Uint8Array([128, 128, 128, 255]), { bytesPerRow: 4 }, { width: 1, height: 1 });
        this.dummyDepthView = this.dummyDepthTexture.createView();
    }
    configure(config) {
        const colorTex = config.buffers.colorTexture;
        const width = colorTex.width;
        const height = colorTex.height;
        // Recreate pipeline only if format changed
        const formatChanged = config.format !== this.currentFormat;
        if (formatChanged || !this.pipeline) {
            this.currentFormat = config.format;
            this.createPipeline(config.format);
        }
        // Recreate intermediate texture if size or format changed
        const sizeChanged = width !== this.currentWidth || height !== this.currentHeight;
        if (sizeChanged || formatChanged || !this.intermediateTexture) {
            this.currentWidth = width;
            this.currentHeight = height;
            if (this.intermediateTexture) {
                this.intermediateTexture.destroy();
            }
            this.intermediateTexture = this.device.createTexture({
                size: [width, height, 1],
                format: config.format,
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            });
        }
        // Create bind groups for both passes
        const colorView = colorTex.createView();
        const depthView = config.buffers.depthTexture?.createView() ?? null;
        this.depthTextureView = depthView;
        this.createBindGroups(colorView, depthView);
        this.configured = true;
    }
    setUniforms(uniforms) {
        const u = uniforms;
        // Pack 32 bytes matching WGSL DofUniforms struct
        const dataH = new Float32Array(8);
        dataH[0] = u.viewportWidth;
        dataH[1] = u.viewportHeight;
        dataH[2] = u.focalDistance;
        dataH[3] = u.aperture;
        dataH[4] = u.nearPlane;
        dataH[5] = u.farPlane;
        dataH[6] = u.maxCoC ?? 20.0;
        this.device.queue.writeBuffer(this.uniformBufferH, 0, dataH);
        // Vertical buffer (passDirection = 1)
        const dataV = new Float32Array(8);
        dataV.set(dataH);
        new Uint32Array(dataV.buffer)[7] = 1;
        this.device.queue.writeBuffer(this.uniformBufferV, 0, dataV);
    }
    execute(encoder, target) {
        if (!this.configured || !this.pipeline || !this.horizontalBindGroup || !this.verticalBindGroup || !this.intermediateTexture)
            return;
        // Pass 1: Horizontal blur (colorTexture → intermediateTexture)
        const intermediateView = this.intermediateTexture.createView();
        const pass1 = encoder.beginRenderPass({
            colorAttachments: [{
                    view: intermediateView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
        });
        pass1.setPipeline(this.pipeline);
        pass1.setBindGroup(0, this.horizontalBindGroup);
        pass1.draw(3); // Fullscreen triangle
        pass1.end();
        // Pass 2: Vertical blur (intermediateTexture → target)
        const pass2 = encoder.beginRenderPass({
            colorAttachments: [{
                    view: target,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
        });
        pass2.setPipeline(this.pipeline);
        pass2.setBindGroup(0, this.verticalBindGroup);
        pass2.draw(3); // Fullscreen triangle
        pass2.end();
    }
    destroy() {
        this.uniformBufferH.destroy();
        this.uniformBufferV.destroy();
        this.dummyDepthTexture.destroy();
        if (this.intermediateTexture) {
            this.intermediateTexture.destroy();
            this.intermediateTexture = null;
        }
        this.pipeline = null;
        this.horizontalBindGroup = null;
        this.verticalBindGroup = null;
        this.depthTextureView = null;
        this.configured = false;
    }
    // ---- Private helpers ----
    createPipeline(format) {
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: this.shaderModule,
                entryPoint: 'vs_main',
            },
            fragment: {
                module: this.shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
        });
    }
    createBindGroups(colorView, depthView) {
        if (!this.pipeline || !this.intermediateTexture)
            return;
        const effectiveDepthView = depthView ?? this.dummyDepthView;
        const layout = this.pipeline.getBindGroupLayout(0);
        this.horizontalBindGroup = this.device.createBindGroup({
            layout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBufferH } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: colorView },
                { binding: 3, resource: effectiveDepthView },
            ],
        });
        const intermediateView = this.intermediateTexture.createView();
        this.verticalBindGroup = this.device.createBindGroup({
            layout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBufferV } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: intermediateView },
                { binding: 3, resource: effectiveDepthView },
            ],
        });
    }
}
