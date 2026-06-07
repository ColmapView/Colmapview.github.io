// Composite Output Module
// =======================
// Fullscreen post-processing pass that composites the Gaussian rasterization output
// (premultiplied alpha RGBA) over a background color or texture.
//
// Supports:
//   - Solid color background (default: opaque black)
//   - Texture background (for Three.js / Babylon.js integration)
//   - Depth-aware compositing (Gaussians interleaved with mesh geometry)
//
// Uses the "over" compositing formula for premultiplied alpha:
//   result = gs + bg * (1 - gs.a)
//
// When no background texture is provided, a 1x1 fallback texture is used
// (filled with the backgroundColor uniform). Similarly, a 1x1 depth fallback
// (depth=1.0) is used when no depth texture is provided.
import { compositeShaderSource } from './shaders';
/**
 * GPU composite output module for Gaussian splatting.
 *
 * Composites premultiplied-alpha Gaussian output over a background,
 * producing the final image for display.
 *
 * @example
 * ```typescript
 * const composite = new CompositeOutputModule(device);
 *
 * composite.configure({
 *   buffers: { colorTexture: rasterOutput },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * composite.setUniforms({
 *   viewportWidth: canvas.width,
 *   viewportHeight: canvas.height,
 *   backgroundColor: [0.1, 0.1, 0.1, 1.0],
 * });
 *
 * const encoder = device.createCommandEncoder();
 * composite.execute(encoder, canvasTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export class CompositeOutputModule {
    constructor(device, _options) {
        this.name = 'Composite';
        // Per-configure state
        this.configured = false;
        this.pipeline = null;
        this.bindGroup = null;
        // Track format to avoid unnecessary pipeline recreation
        this.currentFormat = null;
        this.device = device;
        // Create shader module
        this.shaderModule = device.createShaderModule({ code: compositeShaderSource });
        // Create sampler (linear filtering for texture sampling)
        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });
        // Create uniform buffer (64 bytes for alignment headroom)
        this.uniformBuffer = device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // Create 1x1 fallback background texture (opaque black)
        this.fallbackBackgroundBytes = new Uint8Array([0, 0, 0, 255]);
        this.fallbackBackgroundTexture = device.createTexture({
            size: [1, 1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture({ texture: this.fallbackBackgroundTexture }, this.fallbackBackgroundBytes, { bytesPerRow: 4 }, [1, 1, 1]);
        // Create 1x1 fallback depth texture (depth = 1.0)
        this.fallbackDepthTexture = device.createTexture({
            size: [1, 1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture({ texture: this.fallbackDepthTexture }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1, 1]);
    }
    configure(config) {
        // Recreate pipeline only if format changed
        const formatChanged = config.format !== this.currentFormat;
        if (formatChanged || !this.pipeline) {
            this.currentFormat = config.format;
            this.createPipeline(config.format);
        }
        // Always recreate bind group (textures may have changed)
        this.createBindGroup(config);
        this.configured = true;
    }
    setUniforms(uniforms) {
        const u = uniforms;
        // Pack uniforms matching the WGSL CompositeUniforms struct layout (48 bytes).
        //   [0]  viewport.x (f32)
        //   [1]  viewport.y (f32)
        //   [2]  depthAware (u32)
        //   [3]  _pad0 (u32)
        //   [4..7]  backgroundColor (vec4<f32>)
        //   [8]  nearPlane (f32)
        //   [9]  farPlane (f32)
        //   [10] _pad1 (u32)
        //   [11] _pad2 (u32)
        const data = new Float32Array(12);
        const intView = new Uint32Array(data.buffer);
        data[0] = u.viewportWidth;
        data[1] = u.viewportHeight;
        intView[2] = (u.depthAware ?? false) ? 1 : 0;
        // _pad0
        const bg = u.backgroundColor ?? [0, 0, 0, 1];
        data[4] = bg[0];
        data[5] = bg[1];
        data[6] = bg[2];
        data[7] = bg[3];
        data[8] = u.nearPlane ?? 0.1;
        data[9] = u.farPlane ?? 100.0;
        // _pad1, _pad2
        this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
        this.updateFallbackBackgroundTexture(bg);
    }
    execute(encoder, target) {
        if (!this.configured || !this.pipeline || !this.bindGroup)
            return;
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                    view: target,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
        });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.draw(3); // Fullscreen triangle
        pass.end();
    }
    destroy() {
        this.uniformBuffer.destroy();
        this.fallbackBackgroundTexture.destroy();
        this.fallbackDepthTexture.destroy();
        this.pipeline = null;
        this.bindGroup = null;
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
    createBindGroup(config) {
        if (!this.pipeline)
            return;
        const colorView = config.buffers.colorTexture.createView();
        const bgView = (config.buffers.backgroundTexture ?? this.fallbackBackgroundTexture).createView();
        const depthView = (config.buffers.depthTexture ?? this.fallbackDepthTexture).createView();
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: colorView },
                { binding: 3, resource: bgView },
                { binding: 4, resource: depthView },
            ],
        });
    }
    updateFallbackBackgroundTexture(backgroundColor) {
        const next = new Uint8Array([
            floatToUnorm8(backgroundColor[0]),
            floatToUnorm8(backgroundColor[1]),
            floatToUnorm8(backgroundColor[2]),
            floatToUnorm8(backgroundColor[3]),
        ]);
        if (this.fallbackBackgroundBytes[0] === next[0]
            && this.fallbackBackgroundBytes[1] === next[1]
            && this.fallbackBackgroundBytes[2] === next[2]
            && this.fallbackBackgroundBytes[3] === next[3]) {
            return;
        }
        this.fallbackBackgroundBytes = next;
        this.device.queue.writeTexture({ texture: this.fallbackBackgroundTexture }, next, { bytesPerRow: 4 }, [1, 1, 1]);
    }
}
function floatToUnorm8(value) {
    const safeValue = Number.isFinite(value) ? value : 0;
    return Math.round(Math.max(0, Math.min(1, safeValue)) * 255);
}
