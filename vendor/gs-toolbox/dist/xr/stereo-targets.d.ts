import type { RenderTargetOptions } from '../pipeline';
import type { StereoRenderTargets } from './types';
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
export declare function createStereoRenderTargets(device: GPUDevice, eyeWidth: number, eyeHeight: number, format: GPUTextureFormat, options?: RenderTargetOptions): StereoRenderTargets;
/**
 * Destroy all GPU textures in a StereoRenderTargets.
 * The StereoRenderTargets object should not be used after calling this.
 */
export declare function destroyStereoRenderTargets(targets: StereoRenderTargets): void;
