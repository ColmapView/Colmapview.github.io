/** Blend compositing direction for alpha blending. */
export type BlendDirection = 'front-to-back' | 'back-to-front';
/**
 * Render output mode.
 *
 * | Mode   | Output                                          |
 * |--------|-------------------------------------------------|
 * | `rgb`  | Premultiplied RGB + alpha (standard rendering)  |
 * | `depth`| Normalized depth as grayscale + alpha            |
 * | `rgbd` | RGB in .rgb, normalized depth in .a (incompatible with standard alpha blending) |
 */
export type RenderMode = 'rgb' | 'depth' | 'rgbd';
/**
 * GPU buffers consumed by the raster module.
 *
 * Both buffers are produced by earlier pipeline stages (preprocess + sort)
 * and read by the raster module's vertex/fragment shaders.
 */
export interface GPURasterBuffers {
    /** u32 sorted indices from the sort module (read-only). */
    sortedIndices: GPUBuffer;
    /**
     * SplatData array from the preprocess stage (read-only).
     *
     * Each entry is 48 bytes:
     * ```
     * mean2d: vec2<f32>       //  8B — screen-space center (pixels)
     * depth: f32              //  4B — view-space depth (positive)
     * radius: f32             //  4B — billboard radius (pixels)
     * conic: vec3<f32>        // 12B — inverse 2D covariance (a, b, c)
     * compensation: f32       //  4B — anti-aliasing compensation factor
     * color: vec4<f32>        // 16B — RGB + opacity (premultiplied-ready)
     * ```
     */
    splatData: GPUBuffer;
}
/**
 * Per-frame uniform parameters for the raster module.
 *
 * Call `setUniforms()` every frame before `execute()` to update
 * viewport dimensions, camera state, and rendering options.
 */
export interface GPURasterUniforms {
    /** Viewport width in pixels. */
    viewportWidth: number;
    /** Viewport height in pixels. */
    viewportHeight: number;
    /** Near plane distance for depth normalization. */
    nearPlane: number;
    /** Far plane distance for depth normalization. */
    farPlane: number;
    /** Number of active Gaussians (must match sort output count). */
    numGaussians: number;
    /** Enable anti-aliasing compensation (default: true). */
    antialiasing?: boolean;
    /** Render output mode (default: 'rgb'). */
    renderMode?: RenderMode;
    /** Discard fragments with alpha below this threshold (default: 1/255). */
    alphaThreshold?: number;
    /** Enable hardware depth testing (default: false). */
    useDepthTest?: boolean;
    /** 4x4 projection matrix (column-major Float32Array). Required when useDepthTest=true. */
    projMatrix?: Float32Array;
    /** Frame index for stochastic temporal noise variation. Auto-incremented if not provided. */
    frameIndex?: number;
}
/**
 * Configuration passed to `GPURasterModule.configure()`.
 *
 * Call configure() when the scene changes (new data loaded, buffers resized,
 * or render target format changes). The module creates/recreates the render
 * pipeline and bind group as needed.
 */
export interface GPURasterConfig {
    /** Number of active Gaussians to draw (6 vertices per Gaussian). */
    count: number;
    /** GPU buffers produced by preprocess + sort stages. */
    buffers: GPURasterBuffers;
    /** Render target texture format (e.g. 'bgra8unorm', 'rgba8unorm'). */
    format: GPUTextureFormat;
    /** Optional depth attachment format. Enables depth testing in the pipeline. */
    depthFormat?: GPUTextureFormat;
}
/**
 * Pluggable GPU rasterization module interface.
 *
 * All GPU rasterization algorithms implement this interface, allowing the
 * renderer to swap algorithms without changing pipeline code. Lifecycle:
 *
 * ```typescript
 * const raster = createGPURasterModule('billboard-ftb', device);
 * raster.configure({
 *   count: gaussianCount,
 *   buffers: { sortedIndices: indexBuf, splatData: splatBuf },
 *   format: 'bgra8unorm',
 * });
 *
 * // Every frame:
 * raster.setUniforms({ viewportWidth: 1920, viewportHeight: 1080, ... });
 * const encoder = device.createCommandEncoder();
 * raster.execute(encoder, colorTextureView);
 * device.queue.submit([encoder.finish()]);
 *
 * raster.destroy();
 * ```
 */
export interface GPURasterModule {
    /** Human-readable name (e.g. "Billboard FTB", "Billboard BTF"). */
    readonly name: string;
    /**
     * (Re)configure the render pipeline and bind group for the given scene.
     * Must be called before the first `execute()` and whenever buffers or format change.
     * Pipeline is only recreated when format/depthFormat changes.
     */
    configure(config: GPURasterConfig): void;
    /**
     * Update per-frame uniform parameters (viewport, camera, render options).
     * Must be called every frame before `execute()`.
     */
    setUniforms(uniforms: GPURasterUniforms): void;
    /**
     * Encode render pass into the command encoder.
     * Draws `6 * count` vertices as instanced billboard quads.
     *
     * @param encoder - Command encoder to record into
     * @param colorTarget - Texture view for the color attachment
     * @param depthTarget - Optional texture view for depth attachment (requires depthFormat in config)
     * @param clearColor - Clear color for the render pass (default: transparent black)
     * @param loadOp - Load operation for color attachment (default: 'clear')
     */
    execute(encoder: GPUCommandEncoder, colorTarget: GPUTextureView, depthTarget?: GPUTextureView, clearColor?: GPUColor, loadOp?: GPULoadOp): void;
    /** Release all internal GPU resources. The module cannot be used after this. */
    destroy(): void;
}
/**
 * Available GPU rasterization algorithm identifiers.
 *
 * | Algorithm        | Blend Direction   | Sort Order   | Use Case                    |
 * |------------------|-------------------|--------------|-----------------------------|
 * | `billboard-ftb`  | Front-to-back     | Ascending    | Standard "under" compositing|
 * | `billboard-btf`  | Back-to-front     | Ascending    | "Over" compositing          |
 * | `tiled`          | Front-to-back     | Internal     | Compute tiled rasterization |
 * | `stochastic`     | None (depth test) | Any          | PCG hash stochastic discard |
 *
 * Billboard algorithms use vertex/fragment shaders with hardware alpha blending.
 * The tiled algorithm uses compute shaders with per-tile shared memory batching
 * and early transmittance termination. It handles sorting internally (tile_id +
 * depth radix sort) so the external sort module should be skipped.
 */
export type GPURasterAlgorithm = 'billboard-ftb' | 'billboard-btf' | 'tiled' | 'stochastic';
