// Projection — GPU preprocess projection for Gaussian splatting
// ==============================================================
//
// This module provides pluggable GPU projection for transforming raw Gaussian
// data into screen-space SplatData, quantized depths, and sorted indices.
// The preprocess compute shader handles: view transform, frustum culling,
// 3D→2D covariance projection, anti-aliasing, SH evaluation, and depth quantization.
export { createGPUProjectionModule, PreprocessProjectionModule } from './gpu';
