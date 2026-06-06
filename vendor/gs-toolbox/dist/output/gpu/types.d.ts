/**
 * GPU textures consumed by the output module.
 *
 * The color texture is always required (from rasterization output).
 * Depth and background textures are optional depending on the algorithm.
 */
export interface GPUOutputBuffers {
    /** Input: color texture from rasterization (premultiplied alpha RGBA). */
    colorTexture: GPUTexture;
    /** Input: depth texture from rasterization (optional, needed for DoF + depth-aware compositing). */
    depthTexture?: GPUTexture;
    /** Input: background texture for compositing (optional, solid color used if absent). */
    backgroundTexture?: GPUTexture;
    /** Input: right-eye color texture for stereo output (optional, used by side-by-side module). */
    colorTextureRight?: GPUTexture;
    /** Input: right-eye depth texture for stereo output (optional, matches depthTexture for right eye). */
    depthTextureRight?: GPUTexture;
}
/**
 * Base per-frame uniform parameters for the output module.
 *
 * Call `setUniforms()` every frame before `execute()`.
 */
export interface GPUOutputUniforms {
    /** Viewport width in pixels. */
    viewportWidth: number;
    /** Viewport height in pixels. */
    viewportHeight: number;
}
/**
 * Uniforms specific to the composite algorithm.
 *
 * Extends base uniforms with background color, depth-aware compositing options.
 */
export interface GPUCompositeUniforms extends GPUOutputUniforms {
    /** Background color when no background texture is provided (default: [0,0,0,1]). */
    backgroundColor?: [number, number, number, number];
    /**
     * Enable depth-aware compositing.
     * When true + depthTexture + backgroundTexture provided, composites based on depth
     * comparison (for integrating Gaussians with mesh-based 3D scenes).
     * Default: false.
     */
    depthAware?: boolean;
    /** Near plane for depth linearization (required when depthAware=true). */
    nearPlane?: number;
    /** Far plane for depth linearization (required when depthAware=true). */
    farPlane?: number;
}
/**
 * Uniforms specific to the depth-of-field algorithm.
 *
 * Extends base uniforms with focal distance, aperture, and depth range.
 */
export interface GPUDofUniforms extends GPUOutputUniforms {
    /** Focal distance in view-space units. */
    focalDistance: number;
    /** Aperture size (controls blur strength). Larger = more blur. */
    aperture: number;
    /** Near plane for depth linearization. */
    nearPlane: number;
    /** Far plane for depth linearization. */
    farPlane: number;
    /** Maximum circle-of-confusion radius in pixels (default: 20). */
    maxCoC?: number;
}
/**
 * Configuration passed to `GPUOutputModule.configure()`.
 *
 * Call configure() when input textures change (new scene loaded, window resize,
 * or render target format changes). The module creates/recreates the render
 * pipeline and bind group as needed.
 */
export interface GPUOutputConfig {
    /** GPU textures from the rasterization stage. */
    buffers: GPUOutputBuffers;
    /** Output texture format (e.g. 'bgra8unorm'). */
    format: GPUTextureFormat;
}
/**
 * Pluggable GPU output module interface.
 *
 * All GPU output/post-processing algorithms implement this interface, allowing
 * the renderer to swap algorithms without changing pipeline code. Lifecycle:
 *
 * ```typescript
 * const output = createGPUOutputModule('composite', device);
 * output.configure({
 *   buffers: { colorTexture: rasterColorTex },
 *   format: 'bgra8unorm',
 * });
 *
 * // Every frame:
 * output.setUniforms({ viewportWidth: 1920, viewportHeight: 1080 });
 * const encoder = device.createCommandEncoder();
 * output.execute(encoder, canvasTextureView);
 * device.queue.submit([encoder.finish()]);
 *
 * output.destroy();
 * ```
 */
export interface GPUOutputModule {
    /** Human-readable name (e.g. "Composite", "Depth of Field"). */
    readonly name: string;
    /**
     * (Re)configure the render pipeline and bind group for the given textures.
     * Must be called before the first `execute()` and whenever textures or format change.
     */
    configure(config: GPUOutputConfig): void;
    /**
     * Update per-frame uniform parameters.
     * Must be called every frame before `execute()`.
     */
    setUniforms(uniforms: GPUOutputUniforms): void;
    /**
     * Encode render pass(es) into the command encoder.
     * Writes the final composited result to the target texture view.
     *
     * @param encoder - Command encoder to record into
     * @param target - Texture view for the output (typically the canvas)
     */
    execute(encoder: GPUCommandEncoder, target: GPUTextureView): void;
    /** Release all internal GPU resources. The module cannot be used after this. */
    destroy(): void;
}
/**
 * Uniforms specific to the XR passthrough algorithm.
 *
 * Extends base uniforms with an opacity multiplier for the AR overlay.
 */
export interface GPUXRPassthroughUniforms extends GPUOutputUniforms {
    /** Global opacity multiplier for the GS overlay (default: 1.0). */
    opacity?: number;
    /** Load operation for the render pass (default: 'clear'). Use 'load' for WebXR pre-filled layer textures. */
    loadOp?: GPULoadOp;
}
/**
 * Uniforms specific to the side-by-side stereo algorithm.
 *
 * Extends base uniforms with an eye-swap option.
 */
export interface GPUSideBySideUniforms extends GPUOutputUniforms {
    /** Swap left and right eyes (for cross-eye viewing, default: false). */
    swapEyes?: boolean;
}
/**
 * Available GPU output algorithm identifiers.
 *
 * | Algorithm        | Description                                         |
 * |-----------------|------------------------------------------------------|
 * | `composite`     | Background compositing (solid color or texture)      |
 * | `dof`           | Depth-of-field blur post-processing                  |
 * | `xr-passthrough`| AR passthrough (preserves alpha, no background)      |
 * | `side-by-side`  | Stereo side-by-side (left + right eye)               |
 */
export type GPUOutputAlgorithm = 'composite' | 'dof' | 'xr-passthrough' | 'side-by-side';
/** Options for the XR passthrough output module constructor. Reserved for future use. */
export interface XRPassthroughOptions {
}
/**
 * Options for the side-by-side stereo output module constructor.
 */
export interface SideBySideOptions {
    /**
     * Fallback behavior when `colorTextureRight` is missing.
     * - `'mirror'`: Use left eye texture for both sides (mono preview).
     * - `'black'`: Show transparent black on the right side.
     * Default: `'mirror'`.
     */
    fallback?: 'mirror' | 'black';
}
