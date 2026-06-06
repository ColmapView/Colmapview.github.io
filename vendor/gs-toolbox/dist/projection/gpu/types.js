// GPU Projection Module Types
// ============================
// Pluggable GPU projection/preprocess interface for Gaussian splatting renderers.
//
// Data flow:
//   Load (data/) → Projection (compute) → Sort (compute) → Rasterize (vertex+fragment)
//   Gaussian data    projects 3D→2D        reorders by depth   draws billboard quads
//                    writes SplatData       via depth/index     via sorted indices
//                    + depths + indices     buffers             + SplatData
//
// The projection stage transforms raw Gaussian data (position, rotation, scale,
// opacity, SH coefficients) into screen-space SplatData (48 bytes each), quantized
// u32 depths for sorting, and initialized indices [0..N).
//
// Buffer requirements:
//   gaussians:  GPUBufferUsage.STORAGE (read-only, 64 bytes per Gaussian)
//   shCoeffs:   GPUBufferUsage.STORAGE (read-only, optional for shDegree > 0)
//   splatData:  GPUBufferUsage.STORAGE (read-write, 48 bytes per Gaussian)
//   depths:     GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
//   indices:    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
export {};
