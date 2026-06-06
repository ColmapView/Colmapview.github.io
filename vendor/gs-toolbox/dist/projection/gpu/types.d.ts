/** Camera projection model. */
export type CameraModel = 'pinhole' | 'ortho';
/**
 * GPU buffers for the projection/preprocess stage.
 *
 * Input buffers are written by the data loading stage. Output buffers
 * are consumed by the sort and rasterization stages.
 */
export interface GPUProjectionBuffers {
    /** Input: Gaussian struct array (64 bytes each). STORAGE read-only. */
    gaussians: GPUBuffer;
    /** Input: Higher-order SH coefficients (f32 array). STORAGE read-only. Required when shDegree > 0. */
    shCoeffs?: GPUBuffer;
    /** Output: SplatData array (48 bytes each). STORAGE read-write. */
    splatData: GPUBuffer;
    /** Output: u32 quantized depths for sorting. STORAGE | COPY_DST. */
    depths: GPUBuffer;
    /** Output: u32 indices (initialized to [0..N), reordered by sort). STORAGE | COPY_DST. */
    indices: GPUBuffer;
}
/**
 * Per-frame uniform parameters for the projection module.
 *
 * Call `setUniforms()` every frame before `execute()` to update
 * camera matrices, viewport dimensions, and rendering options.
 */
export interface GPUProjectionUniforms {
    /** 4x4 view matrix, column-major (16 floats). */
    viewMatrix: Float32Array;
    /** 4x4 projection matrix, column-major (16 floats). */
    projMatrix: Float32Array;
    /** Viewport width in pixels. */
    viewportWidth: number;
    /** Viewport height in pixels. */
    viewportHeight: number;
    /** Horizontal focal length in pixels. */
    focalX: number;
    /** Vertical focal length in pixels. */
    focalY: number;
    /** Camera world position (for SH view direction). */
    camPos: [number, number, number];
    /** Spherical harmonics degree (0-3). */
    shDegree: number;
    /** Near plane distance for depth quantization. */
    nearPlane: number;
    /** Far plane distance for depth quantization. */
    farPlane: number;
    /** Anti-aliasing blur epsilon (default: 0.3). */
    eps2d?: number;
    /** Enable anti-aliasing compensation (default: true). */
    antialiasing?: boolean;
    /** Camera projection model (default: 'pinhole'). */
    cameraModel?: CameraModel;
    /** Render output mode: 0=RGB, 1=depth, 2=RGBD (default: 0). */
    renderMode?: number;
    /** Total number of Gaussians. */
    numGaussians: number;
    /** Enable sRGB-to-linear conversion (default: false). */
    linearOutput?: boolean;
    /** Near plane culling threshold in view space. Negative value means cull geometry closer than |cullNear| units (default: -0.1). */
    cullNear?: number;
    /** Minimum opacity to keep (default: 1/255). */
    cullAlpha?: number;
    /** Frustum margin multiplier for NDC culling (default: 1.2). */
    cullMargin?: number;
    /** Reset output indices to [0..N) before sorting (default: true). Disable when reusing the previous sorted index buffer. */
    writeIndices?: boolean;
}
/**
 * Configuration passed to `GPUProjectionModule.configure()`.
 *
 * Call configure() whenever the Gaussian count changes (e.g. after loading
 * a new scene). The projection module will create/resize bind groups to match.
 */
export interface GPUProjectionConfig {
    /** Number of Gaussians to process. */
    count: number;
    /** GPU buffers for input/output data. */
    buffers: GPUProjectionBuffers;
}
/**
 * Pluggable GPU projection module interface.
 *
 * All GPU projection algorithms implement this interface, allowing the
 * renderer to swap algorithms without changing pipeline code. Lifecycle:
 *
 * ```typescript
 * const proj = createGPUProjectionModule('preprocess', device);
 * proj.configure({
 *   count: gaussianCount,
 *   buffers: { gaussians, shCoeffs, splatData, depths, indices },
 * });
 *
 * // Every frame:
 * proj.setUniforms({ viewMatrix, projMatrix, viewportWidth: 1920, ... });
 * const encoder = device.createCommandEncoder();
 * proj.execute(encoder);  // encodes projection compute dispatch
 * // ... sort pass ...
 * // ... render pass ...
 * device.queue.submit([encoder.finish()]);
 *
 * proj.destroy();
 * ```
 */
export interface GPUProjectionModule {
    /** Human-readable name (e.g. "Preprocess"). */
    readonly name: string;
    /**
     * (Re)configure bind group for the given scene.
     * Must be called before the first `execute()` and whenever count/buffers change.
     */
    configure(config: GPUProjectionConfig): void;
    /**
     * Update per-frame uniform parameters (camera, viewport, rendering options).
     * Must be called every frame before `execute()`.
     */
    setUniforms(uniforms: GPUProjectionUniforms): void;
    /**
     * Encode projection compute dispatch into the command encoder.
     * Called every frame before sort and render passes.
     * No-op if `configure()` has not been called.
     */
    execute(encoder: GPUCommandEncoder): void;
    /** Release all internal GPU resources. The module cannot be used after this. */
    destroy(): void;
}
/**
 * Available GPU projection algorithm identifiers.
 *
 * | Algorithm      | Description                                              |
 * |----------------|----------------------------------------------------------|
 * | `preprocess`   | Full preprocess: projection, SH eval, cov2D, AA, cull   |
 */
export type GPUProjectionAlgorithm = 'preprocess';
