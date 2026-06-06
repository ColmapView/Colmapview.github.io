// GPU Rasterization Module Types
// ===============================
// Pluggable GPU billboard rasterization interface for Gaussian splatting renderers.
//
// Data flow:
//   Preprocess (compute) → Sort (compute) → Rasterize (vertex+fragment)
//   writes SplatData[i]    reorders indices    reads sorted SplatData via indices
//   writes depths[i]       in ascending order  and draws instanced billboard quads
//
// The preprocess stage writes per-Gaussian SplatData (48 bytes each: screen position,
// conic, color, etc.) and quantized depths. The sort module reorders indices by depth.
// The raster module draws instanced billboard quads using sorted indices to look up
// precomputed SplatData, applying Gaussian falloff in the fragment shader.
//
// This module does NOT own the render target — the caller provides color (and
// optionally depth) texture views to execute(). This enables compositing with
// other render passes (e.g. Three.js scenes).
//
// Buffer requirements:
//   sortedIndices: GPUBufferUsage.STORAGE (read-only by raster)
//   splatData:     GPUBufferUsage.STORAGE (read-only by raster)
export {};
