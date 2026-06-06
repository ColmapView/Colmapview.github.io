import type { RenderTargets } from '../pipeline';
import type { GPUOutputBuffers } from '../output';
/** Per-eye camera matrices and position. */
export interface EyeMatrices {
    /** 4x4 view matrix, column-major (16 floats). */
    viewMatrix: Float32Array;
    /** 4x4 projection matrix, column-major (16 floats). */
    projMatrix: Float32Array;
    /** Camera world position for this eye. */
    camPos: [number, number, number];
}
/** Stereo pair of eye matrices. */
export interface StereoEyes {
    left: EyeMatrices;
    right: EyeMatrices;
}
/** Options for computing stereo eye matrices from a mono camera. */
export interface StereoCameraOptions {
    /** Inter-pupillary distance in world units (default: 0.063 = 63mm). */
    ipd?: number;
    /** Convergence distance in world units (default: Infinity = parallel axes). */
    convergence?: number;
    /** Stereo method (default: 'offset'). */
    method?: 'offset' | 'toe-in';
}
/**
 * Dual render targets for stereo rendering.
 *
 * Wraps a left and right `RenderTargets` pair plus a pre-wired
 * `GPUOutputBuffers` for stereo output modules (side-by-side, XR passthrough).
 */
export interface StereoRenderTargets {
    left: RenderTargets;
    right: RenderTargets;
    /** Per-eye resolution width. */
    eyeWidth: number;
    /** Per-eye resolution height. */
    eyeHeight: number;
    /** Pre-wired output buffers with left color + right color + optional depth. */
    output: GPUOutputBuffers;
}
/**
 * Stereo rendering strategy.
 *
 * | Strategy       | Description                                                    |
 * |---------------|----------------------------------------------------------------|
 * | `full`        | Full projection + sort + raster per eye (highest quality)      |
 * | `shared-sort` | Full projection per eye, skip sort for right eye (faster)      |
 */
export type StereoStrategy = 'full' | 'shared-sort';
/** Convenience type for passing two color texture views (e.g. from WebXR sub-images). */
export interface StereoColorTargets {
    left: GPUTextureView;
    right: GPUTextureView;
}
