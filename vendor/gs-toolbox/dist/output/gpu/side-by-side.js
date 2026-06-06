// Side-by-Side Stereo Output Module
// ==================================
// Fullscreen post-processing pass that renders two color textures (left and
// right eye) into the left and right halves of a single render target.
//
// Use cases:
//   - Stereo preview on a flat screen (VR debug view)
//   - WebXR multiview fallback (when multiview extension is unavailable)
//   - Cross-eye / parallel-eye stereoscopic viewing
//
// The left eye texture is rendered to the left half (u: 0-0.5) and the right
// eye texture to the right half (u: 0.5-1.0). An optional `swapEyes` flag
// reverses this for cross-eye viewing.
import { sideBySideShaderSource } from './xr-shaders';
/**
 * GPU side-by-side stereo output module for Gaussian splatting.
 *
 * Renders left and right eye color textures side-by-side into a single target.
 * Requires `colorTexture` (left eye) and `colorTextureRight` (right eye) in
 * the output buffers.
 *
 * @example
 * ```typescript
 * const stereo = new SideBySideOutputModule(device);
 *
 * stereo.configure({
 *   buffers: {
 *     colorTexture: leftEyeRaster,       // Left eye
 *     colorTextureRight: rightEyeRaster,  // Right eye
 *   },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * stereo.setUniforms({
 *   viewportWidth: canvas.width,
 *   viewportHeight: canvas.height,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * stereo.execute(encoder, canvasTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export class SideBySideOutputModule {
    constructor(device, options) {
        this.name = 'Side-by-Side Stereo';
        this.configured = false;
        this.pipeline = null;
        this.bindGroup = null;
        this.currentFormat = null;
        this.device = device;
        this.fallbackMode = options?.fallback ?? 'mirror';
        this.shaderModule = device.createShaderModule({ code: sideBySideShaderSource });
        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });
        // 16 bytes: viewport (8B) + swapEyes (4B) + pad (4B)
        this.uniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // 1x1 fallback (transparent black) for missing right eye
        this.fallbackTexture = device.createTexture({
            size: [1, 1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture({ texture: this.fallbackTexture }, new Uint8Array([0, 0, 0, 0]), { bytesPerRow: 4 }, [1, 1, 1]);
    }
    configure(config) {
        const formatChanged = config.format !== this.currentFormat;
        if (formatChanged || !this.pipeline) {
            this.currentFormat = config.format;
            this.createPipeline(config.format);
        }
        this.createBindGroup(config);
        this.configured = true;
    }
    setUniforms(uniforms) {
        const u = uniforms;
        // Pack: viewport.x, viewport.y, swapEyes, _pad
        const data = new Float32Array(4);
        const intView = new Uint32Array(data.buffer);
        data[0] = u.viewportWidth;
        data[1] = u.viewportHeight;
        intView[2] = (u.swapEyes ?? false) ? 1 : 0;
        // intView[3] = pad
        this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
    }
    execute(encoder, target) {
        if (!this.configured || !this.pipeline || !this.bindGroup)
            return;
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                    view: target,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
        });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.draw(3);
        pass.end();
    }
    destroy() {
        this.uniformBuffer.destroy();
        this.fallbackTexture.destroy();
        this.pipeline = null;
        this.bindGroup = null;
        this.configured = false;
    }
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
        const leftView = config.buffers.colorTexture.createView();
        // When right eye texture is missing: 'mirror' uses left eye, 'black' uses 1x1 transparent
        const rightTexture = config.buffers.colorTextureRight
            ?? (this.fallbackMode === 'mirror' ? config.buffers.colorTexture : this.fallbackTexture);
        const rightView = rightTexture.createView();
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: leftView },
                { binding: 3, resource: rightView },
            ],
        });
    }
}
