/**
 * Preprocess WGSL shader source for GPU Gaussian projection.
 *
 * Bindings:
 * - group(0) binding(0): Uniforms (uniform buffer, 224 bytes)
 * - group(0) binding(1): gaussians (storage buffer, Gaussian array, read-only)
 * - group(0) binding(2): shCoeffs (storage buffer, f32 array, read-only)
 * - group(0) binding(3): splatData (storage buffer, SplatData array, read-write)
 * - group(0) binding(4): depths (storage buffer, u32 array, read-write)
 * - group(0) binding(5): indices (storage buffer, u32 array, read-write)
 *
 * Entry points:
 * - main: @compute @workgroup_size(256)
 */
export declare const preprocessShaderSource: string;
