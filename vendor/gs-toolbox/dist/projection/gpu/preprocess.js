// Preprocess Projection Module
// =============================
// GPU compute module that projects raw Gaussian data into screen-space SplatData,
// quantized depths, and initialized indices for the sort + raster stages.
//
// Lifecycle follows the sort/raster module pattern:
//   constructor(device) → configure(config) → setUniforms(uniforms) → execute(encoder)
//
// The compute shader evaluates: view transform, frustum cull, 3D→2D covariance
// projection, anti-aliasing blur, eigenvalue radius, conic computation,
// spherical harmonics color, and depth quantization — all in a single dispatch.
import { preprocessShaderSource } from './shaders';
import { getWorkgroupCounts } from '../../sort/gpu/types';
/** Camera model enum values matching the WGSL constants. */
const CAMERA_MODEL_MAP = {
    'pinhole': 0,
    'ortho': 1,
};
/**
 * GPU preprocess projection module for Gaussian splatting.
 *
 * Transforms raw Gaussian data into screen-space SplatData (48 bytes each),
 * quantized u32 depths for radix sort, and initialized indices [0..N).
 *
 * @example
 * ```typescript
 * const proj = new PreprocessProjectionModule(device);
 *
 * proj.configure({
 *   count: gaussianCount,
 *   buffers: { gaussians: gaussianBuf, splatData: splatBuf, depths: depthBuf, indices: indexBuf },
 * });
 *
 * // Each frame:
 * proj.setUniforms({
 *   viewMatrix, projMatrix,
 *   viewportWidth: canvas.width, viewportHeight: canvas.height,
 *   focalX, focalY, camPos: [x, y, z],
 *   shDegree: 0, nearPlane: 0.1, farPlane: 100,
 *   numGaussians: count,
 * });
 *
 * const encoder = device.createCommandEncoder();
 * proj.execute(encoder);
 * // ... sort pass ...
 * // ... render pass ...
 * device.queue.submit([encoder.finish()]);
 * ```
 */
export class PreprocessProjectionModule {
    constructor(device, _options) {
        this.name = 'Preprocess';
        // Per-configure state
        this.configured = false;
        this.count = 0;
        this.bindGroup = null;
        this.device = device;
        // Create shader module
        this.shaderModule = device.createShaderModule({ code: preprocessShaderSource });
        // Create compute pipeline
        this.pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.shaderModule,
                entryPoint: 'main',
            },
        });
        // Create uniform buffer (256 bytes for comfortable alignment)
        this.uniformBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // Create dummy SH buffer (16 bytes minimum for binding)
        this.dummySHBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.STORAGE,
        });
    }
    configure(config) {
        this.count = config.count;
        const shCoeffsBuffer = config.buffers.shCoeffs ?? this.dummySHBuffer;
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: config.buffers.gaussians } },
                { binding: 2, resource: { buffer: shCoeffsBuffer } },
                { binding: 3, resource: { buffer: config.buffers.splatData } },
                { binding: 4, resource: { buffer: config.buffers.depths } },
                { binding: 5, resource: { buffer: config.buffers.indices } },
            ],
        });
        this.configured = true;
    }
    setUniforms(uniforms) {
        // Pack uniforms matching the WGSL Uniforms struct layout.
        // Total: 56 floats = 224 bytes
        //
        // Layout:
        //   [0..15]   viewMatrix (mat4x4<f32>, 64 bytes)
        //   [16..31]  projMatrix (mat4x4<f32>, 64 bytes)
        //   [32..35]  viewport (vec4<f32>, 16 bytes): width, height, focalX, focalY
        //   [36..38]  camPos (vec3<f32>, 12 bytes)
        //   [39]      shDegree (u32, 4 bytes)
        //   [40]      nearPlane (f32, 4 bytes)
        //   [41]      farPlane (f32, 4 bytes)
        //   [42]      eps2d (f32, 4 bytes)
        //   [43]      antialiasing (u32, 4 bytes)
        //   [44]      cameraModel (u32, 4 bytes)
        //   [45]      renderMode (u32, 4 bytes)
        //   [46]      numGaussians (u32, 4 bytes)
        //   [47]      reverseSort (u32, 4 bytes)
        //   [48]      useDepthTest (u32, 4 bytes)
        //   [49]      linearOutput (u32, 4 bytes)
        //   [50]      cullNear (f32, 4 bytes)
        //   [51]      cullAlpha (f32, 4 bytes)
        //   [52]      cullMargin (f32, 4 bytes)
        //   [53]      writeIndices (u32, 4 bytes)
        const data = new Float32Array(56);
        const intView = new Uint32Array(data.buffer);
        data.set(uniforms.viewMatrix, 0); // [0..15]
        data.set(uniforms.projMatrix, 16); // [16..31]
        data[32] = uniforms.viewportWidth; // viewport.x
        data[33] = uniforms.viewportHeight; // viewport.y
        data[34] = uniforms.focalX; // viewport.z
        data[35] = uniforms.focalY; // viewport.w
        data[36] = uniforms.camPos[0]; // camPos.x
        data[37] = uniforms.camPos[1]; // camPos.y
        data[38] = uniforms.camPos[2]; // camPos.z
        intView[39] = uniforms.shDegree; // shDegree (u32)
        data[40] = uniforms.nearPlane;
        data[41] = uniforms.farPlane;
        data[42] = uniforms.eps2d ?? 0.3;
        intView[43] = (uniforms.antialiasing ?? true) ? 1 : 0;
        intView[44] = CAMERA_MODEL_MAP[uniforms.cameraModel ?? 'pinhole'];
        intView[45] = uniforms.renderMode ?? 0;
        intView[46] = uniforms.numGaussians;
        intView[47] = 0; // reverseSort (set by raster, not projection)
        intView[48] = 0; // useDepthTest (set by raster, not projection)
        intView[49] = (uniforms.linearOutput ?? false) ? 1 : 0;
        data[50] = uniforms.cullNear ?? -0.1;
        data[51] = uniforms.cullAlpha ?? (1 / 255);
        data[52] = uniforms.cullMargin ?? 1.2;
        intView[53] = (uniforms.writeIndices ?? true) ? 1 : 0;
        this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
    }
    execute(encoder) {
        if (!this.configured || !this.bindGroup)
            return;
        const [wgX, wgY] = getWorkgroupCounts(this.count, 256);
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.dispatchWorkgroups(wgX, wgY);
        pass.end();
    }
    destroy() {
        this.uniformBuffer.destroy();
        this.dummySHBuffer.destroy();
        this.bindGroup = null;
        this.configured = false;
    }
}
