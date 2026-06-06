// Output — GPU post-processing for Gaussian splatting
// ====================================================
//
// This module provides pluggable GPU post-processing passes that run after
// Gaussian rasterization. Includes background compositing and depth-of-field blur.
export { createGPUOutputModule, CompositeOutputModule, DofOutputModule, XRPassthroughOutputModule, SideBySideOutputModule } from './gpu';
