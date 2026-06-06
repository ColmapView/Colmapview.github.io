// Stereo Render Targets
// =====================
// Factory for dual render targets used in stereo rendering.
//
// Wraps `createRenderTargets()` twice (once per eye) and wires up
// the GPUOutputBuffers for stereo output modules (side-by-side, XR passthrough).
import { createRenderTargets, destroyRenderTargets } from '../pipeline';
/**
 * Create dual render targets for stereo rendering.
 *
 * Calls `createRenderTargets()` once per eye with the given resolution,
 * then wires up the output buffers so the left eye's color becomes
 * `colorTexture` and the right eye's color becomes `colorTextureRight`.
 *
 * @param device - WebGPU device for texture creation
 * @param eyeWidth - Per-eye render target width in pixels
 * @param eyeHeight - Per-eye render target height in pixels
 * @param format - Color texture format (e.g. 'rgba8unorm')
 * @param options - Optional: include depth texture, depth format
 * @returns StereoRenderTargets with dual textures and pre-wired output buffers
 */
export function createStereoRenderTargets(device, eyeWidth, eyeHeight, format, options) {
    const left = createRenderTargets(device, eyeWidth, eyeHeight, format, options);
    const right = createRenderTargets(device, eyeWidth, eyeHeight, format, options);
    return {
        left,
        right,
        eyeWidth,
        eyeHeight,
        output: {
            colorTexture: left.colorTexture,
            colorTextureRight: right.colorTexture,
            depthTexture: left.depthTexture ?? undefined,
            depthTextureRight: right.depthTexture ?? undefined,
        },
    };
}
/**
 * Destroy all GPU textures in a StereoRenderTargets.
 * The StereoRenderTargets object should not be used after calling this.
 */
export function destroyStereoRenderTargets(targets) {
    destroyRenderTargets(targets.left);
    destroyRenderTargets(targets.right);
}
