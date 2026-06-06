// Rasterization — GPU billboard rasterization for Gaussian splatting
// ==================================================================
//
// This module provides pluggable GPU rasterization for drawing sorted Gaussians.
// The billboard approach expands each Gaussian into a screen-aligned quad and
// evaluates 2D Gaussian falloff in the fragment shader.
//
// Supports both front-to-back ("under") and back-to-front ("over") compositing.
export { createGPURasterModule, BillboardRasterModule, TiledRasterModule, StochasticRasterModule, executeTensorRasterizationGPU, renderToTensorsGPU, rasterizationGPU, requestWebGPUDevice, prepareTensorRasterizationInputsCPU, prepareTensorRasterizationGPUInputs, tensorRasterShaderSource, } from './gpu';
export { renderToTensors, rasterizationCPU, fullyFusedProjectionCPU, isectTilesCPU, isectOffsetEncodeCPU, rasterizeToPixelsCPU, } from './cpu';
