import type { GaussianCloud } from './types';
import type { GPUProjectionBuffers } from './projection';
import type { GPUSortBuffers } from './sort';
import type { GPURasterBuffers } from './rasterization';
import type { GPUOutputBuffers } from './output';
/**
 * Pre-wired GPU buffer sets for all pipeline stages.
 *
 * Created by `createPipelineBuffers()` from a GaussianCloud.
 * The same underlying GPUBuffers are referenced by multiple stage views
 * with appropriate field naming for each stage's interface.
 */
export interface PipelineBuffers {
    /** Number of Gaussians packed into the buffers. */
    count: number;
    /** Gaussian struct array (64 bytes each). STORAGE | COPY_DST. */
    gaussians: GPUBuffer;
    /** Higher-order SH coefficients. STORAGE | COPY_DST. Null when shDegree=0. */
    shCoeffs: GPUBuffer | null;
    /** SplatData output from projection (48 bytes each). STORAGE. */
    splatData: GPUBuffer;
    /** u32 quantized depths. STORAGE | COPY_DST. */
    depths: GPUBuffer;
    /** u32 Gaussian indices. STORAGE | COPY_DST. */
    indices: GPUBuffer;
    /** Pre-wired buffers for projection.configure(). */
    projection: GPUProjectionBuffers;
    /** Pre-wired buffers for sort.configure(). */
    sort: GPUSortBuffers;
    /** Pre-wired buffers for raster.configure(). */
    raster: GPURasterBuffers;
}
/** Options for createRenderTargets(). */
export interface RenderTargetOptions {
    /** Create a depth texture for RGBD / DoF modes (default: false). */
    includeDepth?: boolean;
    /** Depth texture format (default: 'rgba8unorm' — sampleable, stores normalized depth). */
    depthFormat?: GPUTextureFormat;
}
/**
 * Render target textures for the rasterization -> output bridge.
 *
 * Created by `createRenderTargets()`. Textures have dual usage flags
 * (RENDER_ATTACHMENT | TEXTURE_BINDING) so rasterization can write to them
 * and the output module can sample them.
 */
export interface RenderTargets {
    /** Color texture — rasterization writes, output reads. */
    colorTexture: GPUTexture;
    /** Pre-created color texture view for raster.execute(). */
    colorView: GPUTextureView;
    /** Depth texture (null when includeDepth=false). */
    depthTexture: GPUTexture | null;
    /** Pre-created depth texture view (null when includeDepth=false). */
    depthView: GPUTextureView | null;
    /** Render target width in pixels. */
    width: number;
    /** Render target height in pixels. */
    height: number;
    /** Color texture format. */
    format: GPUTextureFormat;
    /** Pre-wired buffers for output.configure(). */
    output: GPUOutputBuffers;
}
/**
 * Pack a GaussianCloud into GPU buffers for the full rendering pipeline.
 *
 * Packs positions, opacities, scales, rotations, and SH0 into the 64-byte
 * Gaussian struct layout expected by the projection shader:
 * ```
 * [position.xyz, opacity, scale.xyz, _pad0, rotation.wxyz, sh0.xyz, _pad1]
 * ```
 *
 * Allocates splatData, depths, and indices output buffers with correct usage
 * flags for downstream stages. Returns pre-wired buffer views for each stage.
 *
 * @param cloud - Loaded GaussianCloud data
 * @param device - WebGPU device for buffer creation
 * @returns PipelineBuffers with all buffers and stage-specific views
 */
export declare function createPipelineBuffers(cloud: GaussianCloud, device: GPUDevice): PipelineBuffers;
/**
 * Create render target textures for the rasterization -> output bridge.
 *
 * Both textures are created with `RENDER_ATTACHMENT | TEXTURE_BINDING` usage
 * so rasterization can write to them as render targets and the output module
 * can sample them as input textures.
 *
 * @param device - WebGPU device for texture creation
 * @param width - Render target width in pixels
 * @param height - Render target height in pixels
 * @param format - Color texture format (e.g. 'rgba8unorm', 'bgra8unorm')
 * @param options - Optional: include depth texture, depth format
 * @returns RenderTargets with textures, views, and pre-wired output buffers
 */
export declare function createRenderTargets(device: GPUDevice, width: number, height: number, format: GPUTextureFormat, options?: RenderTargetOptions): RenderTargets;
/**
 * Destroy all GPU buffers in a PipelineBuffers.
 * The PipelineBuffers object should not be used after calling this.
 */
export declare function destroyPipelineBuffers(buffers: PipelineBuffers): void;
/**
 * Destroy all GPU textures in a RenderTargets.
 * The RenderTargets object should not be used after calling this.
 */
export declare function destroyRenderTargets(targets: RenderTargets): void;
