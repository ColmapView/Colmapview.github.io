// XR Passthrough Output Module
// ============================
// Fullscreen post-processing pass for WebXR AR passthrough mode.
//
// Outputs the Gaussian rasterization result (premultiplied alpha RGBA) directly
// without compositing over a background. Transparent regions remain transparent,
// allowing the XR compositor to blend the GS overlay with the camera passthrough.
//
// An optional global opacity multiplier lets the app fade the entire GS overlay
// (e.g. during transitions or for ghost-mode visualization).
import { xrPassthroughShaderSource } from './xr-shaders';
/**
 * GPU XR passthrough output module for Gaussian splatting.
 *
 * Outputs premultiplied-alpha Gaussian render without background compositing,
 * suitable for WebXR AR passthrough where the browser compositor blends the
 * result over the camera feed.
 *
 * @example
 * ```typescript
 * const xrOutput = new XRPassthroughOutputModule(device);
 *
 * xrOutput.configure({
 *   buffers: { colorTexture: rasterOutput },
 *   format: 'bgra8unorm',
 * });
 *
 * // Each frame:
 * xrOutput.setUniforms({
 *   viewportWidth: xrViewport.width,
 *   viewportHeight: xrViewport.height,
 *   opacity: 1.0,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * xrOutput.execute(encoder, xrLayerTextureView);
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export class XRPassthroughOutputModule {
    constructor(device, _options) {
        this.name = 'XR Passthrough';
        this.configured = false;
        this.pipeline = null;
        this.bindGroup = null;
        this.currentFormat = null;
        this.loadOp = 'clear';
        this.device = device;
        this.shaderModule = device.createShaderModule({ code: xrPassthroughShaderSource });
        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });
        // 16 bytes: viewport (8B) + opacity (4B) + pad (4B)
        this.uniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
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
        // Pack: viewport.x, viewport.y, opacity, _pad
        const data = new Float32Array(4);
        data[0] = u.viewportWidth;
        data[1] = u.viewportHeight;
        data[2] = u.opacity ?? 1.0;
        // data[3] = pad
        this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
        this.loadOp = u.loadOp ?? 'clear';
    }
    execute(encoder, target) {
        if (!this.configured || !this.pipeline || !this.bindGroup)
            return;
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                    view: target,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: this.loadOp,
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
        const colorView = config.buffers.colorTexture.createView();
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: colorView },
            ],
        });
    }
}
