// GPU Output Module Types
// =======================
// Pluggable GPU post-processing interface for Gaussian splatting renderers.
//
// Data flow:
//   Preprocess (compute) -> Sort (compute) -> Rasterize (render) -> Output (render)
//   The rasterization stage writes color (+ optional depth) to textures.
//   The output module samples these textures and produces the final composited result.
//
// This module enables:
//   - Background compositing (solid color or texture, for Three.js/Babylon.js integration)
//   - Depth-aware compositing (Gaussians interleaved with mesh geometry by depth)
//   - Post-processing effects (depth-of-field blur)
//
// Input textures from rasterization are premultiplied-alpha RGBA.
// The output module writes to a caller-provided render target (typically the canvas).
export {};
