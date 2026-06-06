// Billboard Rasterization Shader
// ==============================
// WGSL vertex+fragment shader for instanced billboard Gaussian splatting.
//
// Vertex shader: Expands each Gaussian into a screen-aligned quad (6 verts per splat).
//   Reads precomputed SplatData (screen position, radius, conic, color) via sorted indices.
//   No redundant projection — all per-Gaussian computation is done in the preprocess stage.
//
// Fragment shader: Evaluates 2D Gaussian falloff using the inverse covariance (conic).
//   alpha = opacity * exp(-0.5 * d^T * Σ^(-1) * d)
//   Supports RGB, depth, and RGBD render modes.
//
// Adapted from webgpu/src/shaders/gaussian-fast.wgsl with a stripped-down uniform struct
// (removed viewMatrix, camPos, shDegree, eps2d, cameraModel, linearOutput which are
// preprocess-only concerns).
/**
 * Billboard WGSL shader source for GPU Gaussian rasterization.
 *
 * Bindings:
 * - group(0) binding(0): Uniforms (uniform buffer, 112 bytes)
 * - group(0) binding(1): sortedIndices (storage buffer, u32 array)
 * - group(0) binding(2): splatData (storage buffer, SplatData array)
 *
 * Entry points:
 * - vs_main: Billboard quad expansion (6 verts per Gaussian)
 * - fs_main: Gaussian falloff + render mode selection
 */
export const billboardShaderSource = /* wgsl */ `
// Render modes
const RENDER_MODE_RGB: u32 = 0u;
const RENDER_MODE_DEPTH: u32 = 1u;
const RENDER_MODE_RGBD: u32 = 2u;

struct Uniforms {
    projMatrix: mat4x4<f32>,   // offset 0 (64 bytes) — for depth test
    viewport: vec4<f32>,       // offset 64: (width, height, nearPlane, farPlane)
    antialiasing: u32,         // offset 80
    renderMode: u32,           // offset 84
    numGaussians: u32,         // offset 88
    reverseSort: u32,          // offset 92
    useDepthTest: u32,         // offset 96
    alphaThreshold: f32,       // offset 100
    // padding to 112 bytes (next 16-byte boundary after 104)
    _pad0: u32,                // offset 104
    _pad1: u32,                // offset 108
};

// Precomputed per-Gaussian data (from preprocess shader)
struct SplatData {
    mean2d: vec2<f32>,
    depth: f32,
    radius: f32,
    conic: vec3<f32>,
    compensation: f32,
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> sortedIndices: array<u32>;
@group(0) @binding(2) var<storage, read> splatData: array<SplatData>;

// Billboard vertices (two triangles forming a quad)
const QUAD_VERTICES = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
);

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) conic: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) depth: f32,
    @location(4) compensation: f32,
};

@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32
) -> VertexOutput {
    var output: VertexOutput;

    // Get splat index from vertex index (6 vertices per splat)
    let vertexInSplat = vertexIndex % 6u;
    var splatIdx = vertexIndex / 6u;

    // Support reverse sort order for "over" blending (back-to-front)
    // Radix sort produces front-to-back order, so reverse for over blending
    if (uniforms.reverseSort != 0u && uniforms.numGaussians > 0u) {
        splatIdx = uniforms.numGaussians - 1u - splatIdx;
    }

    // Get sorted Gaussian index
    let gaussianIdx = sortedIndices[splatIdx];
    let splat = splatData[gaussianIdx];

    // Check if Gaussian was culled (radius = 0)
    if (splat.radius <= 0.0) {
        output.color.w = 0.0;
        return output;
    }

    let viewportWidth = uniforms.viewport.x;
    let viewportHeight = uniforms.viewport.y;

    // Read precomputed screen position and radius
    let screenPos = splat.mean2d;
    let radiusPx = splat.radius;

    // Convert screen position to NDC
    // Note: No Y flip needed for WebGPU (framebuffer Y=0 is at top)
    let ndcX = (screenPos.x / viewportWidth) * 2.0 - 1.0;
    let ndcY = 1.0 - (screenPos.y / viewportHeight) * 2.0;

    // Expand quad by radius
    let quadVert = QUAD_VERTICES[vertexInSplat];
    let radiusNdc = vec2<f32>(
        2.0 * radiusPx / viewportWidth,
        2.0 * radiusPx / viewportHeight
    );
    let finalNdc = vec2<f32>(ndcX, ndcY) + quadVert * radiusNdc;

    // Compute depth based on mode
    var ndcZ = 0.5;  // Default: fixed depth (splats sorted by radix sort)
    if (uniforms.useDepthTest != 0u) {
        // Use projection matrix to compute proper NDC depth
        // splat.depth is stored as positive view-space distance (= -viewPos.z)
        // So view_z = -splat.depth
        let view_z = -splat.depth;

        // Apply projection matrix Z components
        // For perspective: clip_z = proj[2][2] * z + proj[3][2]
        //                  clip_w = proj[2][3] * z + proj[3][3]
        // In WGSL, matrix is column-major: mat[col][row]
        let clip_z = uniforms.projMatrix[2][2] * view_z + uniforms.projMatrix[3][2];
        let clip_w = uniforms.projMatrix[2][3] * view_z + uniforms.projMatrix[3][3];

        // NDC depth (0 to 1 in WebGPU)
        ndcZ = clamp(clip_z / clip_w, 0.0, 1.0);
    }
    output.position = vec4<f32>(finalNdc, ndcZ, 1.0);
    output.uv = radiusPx * quadVert;
    output.conic = splat.conic;
    output.color = splat.color;
    output.depth = splat.depth;
    output.compensation = splat.compensation;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    var opacity = input.color.w;
    if (opacity <= 0.0) {
        discard;
    }

    // Apply anti-aliasing compensation
    if (uniforms.antialiasing != 0u) {
        opacity *= input.compensation;
    }

    // Gaussian falloff using conic (inverse covariance)
    // d2 is the Mahalanobis distance squared (unitless)
    let d = -input.uv;
    let conic = input.conic;
    let d2 = conic.x * d.x * d.x + 2.0 * conic.y * d.x * d.y + conic.z * d.y * d.y;

    let power = -0.5 * d2;

    if (power > 0.0) {
        discard;
    }

    let alpha = min(0.99, opacity * exp(power));

    // Alpha threshold
    if (alpha < uniforms.alphaThreshold) {
        discard;
    }

    // Render mode handling
    let nearPlane = uniforms.viewport.z;
    let farPlane = uniforms.viewport.w;

    if (uniforms.renderMode == RENDER_MODE_DEPTH) {
        let normalizedDepth = clamp((input.depth - nearPlane) / (farPlane - nearPlane), 0.0, 1.0);
        return vec4<f32>(vec3<f32>(normalizedDepth) * alpha, alpha);
    } else if (uniforms.renderMode == RENDER_MODE_RGBD) {
        let normalizedDepth = clamp((input.depth - nearPlane) / (farPlane - nearPlane), 0.0, 1.0);
        return vec4<f32>(input.color.rgb * alpha, normalizedDepth);
    } else {
        return vec4<f32>(input.color.rgb * alpha, alpha);
    }
}
`;
