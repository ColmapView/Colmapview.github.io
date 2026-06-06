import type { EyeMatrices, StereoEyes, StereoCameraOptions } from './types';
/**
 * Compute per-eye matrices for a single eye offset from the mono camera.
 *
 * @param viewMatrix - Mono 4x4 view matrix (column-major)
 * @param projMatrix - Mono 4x4 projection matrix (column-major)
 * @param camPos - Mono camera world position
 * @param eyeOffset - Signed offset along right axis (negative=left, positive=right)
 * @param convergence - Convergence distance for frustum shift (Infinity=parallel)
 * @returns Per-eye camera matrices
 */
export declare function computeEyeMatrices(viewMatrix: Float32Array, projMatrix: Float32Array, camPos: [number, number, number], eyeOffset: number, convergence: number): EyeMatrices;
/**
 * Compute stereo eye matrices from a mono camera.
 *
 * @param viewMatrix - Mono 4x4 view matrix (column-major, 16 floats)
 * @param projMatrix - Mono 4x4 projection matrix (column-major, 16 floats)
 * @param camPos - Mono camera world position [x, y, z]
 * @param options - Stereo options (IPD, convergence, method)
 * @returns Left and right eye matrices
 */
export declare function computeStereoEyes(viewMatrix: Float32Array, projMatrix: Float32Array, camPos: [number, number, number], options?: StereoCameraOptions): StereoEyes;
