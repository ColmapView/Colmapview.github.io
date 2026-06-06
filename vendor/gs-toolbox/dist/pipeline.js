// Pipeline Bridge Utilities
// =========================
// Helpers to wire together the 5 pipeline stages:
//   Data -> Projection -> Sort -> Rasterization -> Output
//
// createPipelineBuffers: packs GaussianCloud into GPU struct format,
//   allocates all shared buffers, and returns pre-wired stage views.
//
// createRenderTargets: creates textures with dual usage flags
//   (RENDER_ATTACHMENT | TEXTURE_BINDING) for the raster->output bridge.
// =============================================
// Constants
// =============================================
/** Bytes per Gaussian in the GPU struct layout. */
const GAUSSIAN_BYTES = 64;
/** Floats per Gaussian (64 / 4). */
const FLOATS_PER_GAUSSIAN = 16;
/** Bytes per SplatData entry. */
const SPLATDATA_BYTES = 48;
/** Bytes per depth/index entry (u32). */
const U32_BYTES = 4;
// =============================================
// createPipelineBuffers
// =============================================
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
export function createPipelineBuffers(cloud, device) {
    const N = cloud.count;
    // --- Pack Gaussian struct ---
    const gaussianData = new Float32Array(N * FLOATS_PER_GAUSSIAN);
    for (let i = 0; i < N; i++) {
        const o = i * FLOATS_PER_GAUSSIAN;
        const i3 = i * 3;
        const i4 = i * 4;
        // position.xyz (3 floats)
        gaussianData[o + 0] = cloud.positions[i3];
        gaussianData[o + 1] = cloud.positions[i3 + 1];
        gaussianData[o + 2] = cloud.positions[i3 + 2];
        // opacity (1 float)
        gaussianData[o + 3] = cloud.opacities[i];
        // scale.xyz (3 floats)
        gaussianData[o + 4] = cloud.scales[i3];
        gaussianData[o + 5] = cloud.scales[i3 + 1];
        gaussianData[o + 6] = cloud.scales[i3 + 2];
        // _pad0
        gaussianData[o + 7] = 0;
        // rotation.wxyz (4 floats)
        gaussianData[o + 8] = cloud.rotations[i4];
        gaussianData[o + 9] = cloud.rotations[i4 + 1];
        gaussianData[o + 10] = cloud.rotations[i4 + 2];
        gaussianData[o + 11] = cloud.rotations[i4 + 3];
        // sh0.xyz (3 floats)
        gaussianData[o + 12] = cloud.sh0[i3];
        gaussianData[o + 13] = cloud.sh0[i3 + 1];
        gaussianData[o + 14] = cloud.sh0[i3 + 2];
        // _pad1
        gaussianData[o + 15] = 0;
    }
    const gaussians = device.createBuffer({
        size: N * GAUSSIAN_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(gaussians.getMappedRange()).set(gaussianData);
    gaussians.unmap();
    // --- Pack SH coefficients (if degree > 0) ---
    let shCoeffs = null;
    if (cloud.shDegree > 0 && cloud.shN) {
        const shBuf = device.createBuffer({
            size: cloud.shN.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Float32Array(shBuf.getMappedRange()).set(cloud.shN);
        shBuf.unmap();
        shCoeffs = shBuf;
    }
    // --- Allocate output buffers ---
    const splatData = device.createBuffer({
        size: N * SPLATDATA_BYTES,
        usage: GPUBufferUsage.STORAGE,
    });
    const depths = device.createBuffer({
        size: N * U32_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const indices = device.createBuffer({
        size: N * U32_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    // --- Build stage-specific views ---
    const projection = {
        gaussians,
        splatData,
        depths,
        indices,
        ...(shCoeffs ? { shCoeffs } : {}),
    };
    const sort = {
        depth: depths,
        index: indices,
    };
    const raster = {
        sortedIndices: indices,
        splatData,
    };
    return {
        count: N,
        gaussians,
        shCoeffs,
        splatData,
        depths,
        indices,
        projection,
        sort,
        raster,
    };
}
// =============================================
// createRenderTargets
// =============================================
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
export function createRenderTargets(device, width, height, format, options) {
    const colorTexture = device.createTexture({
        size: { width, height },
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const colorView = colorTexture.createView();
    let depthTexture = null;
    let depthView = null;
    if (options?.includeDepth) {
        const depthFormat = options.depthFormat ?? 'rgba8unorm';
        depthTexture = device.createTexture({
            size: { width, height },
            format: depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        depthView = depthTexture.createView();
    }
    const output = {
        colorTexture,
        ...(depthTexture ? { depthTexture } : {}),
    };
    return {
        colorTexture,
        colorView,
        depthTexture,
        depthView,
        width,
        height,
        format,
        output,
    };
}
// =============================================
// Cleanup
// =============================================
/**
 * Destroy all GPU buffers in a PipelineBuffers.
 * The PipelineBuffers object should not be used after calling this.
 */
export function destroyPipelineBuffers(buffers) {
    buffers.gaussians.destroy();
    if (buffers.shCoeffs)
        buffers.shCoeffs.destroy();
    buffers.splatData.destroy();
    buffers.depths.destroy();
    buffers.indices.destroy();
}
/**
 * Destroy all GPU textures in a RenderTargets.
 * The RenderTargets object should not be used after calling this.
 */
export function destroyRenderTargets(targets) {
    targets.colorTexture.destroy();
    if (targets.depthTexture)
        targets.depthTexture.destroy();
}
