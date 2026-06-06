import type { GPUProjectionModule, GPUProjectionUniforms } from '../projection';
import type { GPUSortModule } from '../sort';
import type { GPURasterModule, GPURasterUniforms } from '../rasterization';
import type { StereoEyes, StereoStrategy } from './types';
/** Per-frame uniforms for stereo rendering (minus per-eye camera state). */
export interface StereoFrameUniforms {
    /** Stereo eye matrices (from computeStereoEyes or WebXR). */
    eyes: StereoEyes;
    /** Projection uniforms shared between eyes (excludes viewMatrix, projMatrix, camPos). */
    projection: Omit<GPUProjectionUniforms, 'viewMatrix' | 'projMatrix' | 'camPos'>;
    /** Rasterization uniforms (same for both eyes). */
    raster: GPURasterUniforms;
}
/**
 * Encode and submit a stereo frame (both eyes).
 *
 * Sequence:
 * 1. Left eye: setUniforms -> encode projection+sort+raster -> submit
 * 2. Right eye: setUniforms -> encode projection+(sort if full)+raster -> submit
 *
 * Each eye is submitted separately so that uniform buffer writes
 * (via device.queue.writeBuffer) are flushed before the GPU commands execute.
 *
 * @param device - GPU device (used for creating encoders and submitting)
 * @param modules - Borrowed pipeline modules (not owned, not destroyed)
 * @param leftTarget - Left eye color texture view
 * @param rightTarget - Right eye color texture view
 * @param uniforms - Per-frame uniforms with stereo eye matrices
 * @param strategy - 'full' or 'shared-sort' (default: 'shared-sort')
 */
export declare function encodeStereoFrame(device: GPUDevice, modules: {
    projection: GPUProjectionModule;
    sort: GPUSortModule;
    raster: GPURasterModule;
}, leftTarget: GPUTextureView, rightTarget: GPUTextureView, uniforms: StereoFrameUniforms, strategy?: StereoStrategy): void;
