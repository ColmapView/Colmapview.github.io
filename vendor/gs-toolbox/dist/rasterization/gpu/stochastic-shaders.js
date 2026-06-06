// Stochastic Rasterization Shader
// ================================
// WGSL vertex+fragment shader for stochastic transparency Gaussian splatting.
//
// Vertex shader: Same billboard quad expansion as the standard billboard shader.
//   Reads precomputed SplatData via sorted indices and expands into screen-aligned quads.
//   Passes splatIndex (flat-interpolated) for per-fragment PCG hash seeding.
//
// Fragment shader: Replaces alpha blending with stochastic alpha test.
//   Uses a PCG hash seeded by (frameIndex, pixel position, splatIndex) to generate
//   a per-fragment random number. If rand < alpha, the fragment is kept as fully opaque;
//   otherwise it is discarded. This enables hardware depth testing without sorting,
//   producing noise that averages out over multiple frames.
//
// Reference: Spark's splatFragment.glsl stochastic transparency implementation.
/**
 * Stochastic WGSL shader source for GPU Gaussian rasterization.
 *
 * Bindings:
 * - group(0) binding(0): Uniforms (uniform buffer, 112 bytes)
 * - group(0) binding(1): sortedIndices (storage buffer, u32 array)
 * - group(0) binding(2): splatData (storage buffer, SplatData array)
 *
 * Entry points:
 * - vs_main: Billboard quad expansion (6 verts per Gaussian) with splatIndex output
 * - fs_main: Gaussian falloff + PCG hash stochastic discard
 */
export const stochasticShaderSource = /* wgsl */ `
struct Uniforms {
    projMatrix: mat4x4<f32>,   // offset 0 (64 bytes) — for depth computation
    viewport: vec4<f32>,       // offset 64: (width, height, nearPlane, farPlane)
    antialiasing: u32,         // offset 80
    renderMode: u32,           // offset 84
    numGaussians: u32,         // offset 88
    reverseSort: u32,          // offset 92
    useDepthTest: u32,         // offset 96
    alphaThreshold: f32,       // offset 100
    frameIndex: u32,           // offset 104 (was _pad0 in billboard)
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
    @location(5) @interpolate(flat) splatIndex: u32,
};

@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex: u32
) -> VertexOutput {
    var output: VertexOutput;

    // Get splat index from vertex index (6 vertices per splat)
    let vertexInSplat = vertexIndex % 6u;
    var splatIdx = vertexIndex / 6u;

    // Support reverse sort order for consistency with billboard module
    if (uniforms.reverseSort != 0u && uniforms.numGaussians > 0u) {
        splatIdx = uniforms.numGaussians - 1u - splatIdx;
    }

    // Get sorted Gaussian index
    let gaussianIdx = sortedIndices[splatIdx];
    let splat = splatData[gaussianIdx];

    // Pass splat index for PCG hash in fragment shader
    output.splatIndex = gaussianIdx;

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
    let ndcX = (screenPos.x / viewportWidth) * 2.0 - 1.0;
    let ndcY = 1.0 - (screenPos.y / viewportHeight) * 2.0;

    // Expand quad by radius
    let quadVert = QUAD_VERTICES[vertexInSplat];
    let radiusNdc = vec2<f32>(
        2.0 * radiusPx / viewportWidth,
        2.0 * radiusPx / viewportHeight
    );
    let finalNdc = vec2<f32>(ndcX, ndcY) + quadVert * radiusNdc;

    // Compute proper NDC depth for hardware depth testing
    // splat.depth is stored as positive view-space distance (= -viewPos.z)
    let view_z = -splat.depth;
    let clip_z = uniforms.projMatrix[2][2] * view_z + uniforms.projMatrix[3][2];
    let clip_w = uniforms.projMatrix[2][3] * view_z + uniforms.projMatrix[3][3];
    let ndcZ = clamp(clip_z / clip_w, 0.0, 1.0);

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

    // PCG hash for stochastic alpha test
    let state = uniforms.frameIndex
              + 0x9e3779b9u * u32(input.position.x)
              + 0x85ebca6bu * u32(input.position.y)
              + 0xc2b2ae35u * input.splatIndex;
    var s = state * 747796405u + 2891336453u;
    let hash = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    let rand = f32((hash >> 22u) ^ hash) / 4294967296.0;

    // Stochastic discard: keep fragment with probability = alpha
    if (rand >= alpha) {
        discard;
    }

    // Output fully opaque RGB (depth test handles occlusion)
    return vec4<f32>(input.color.rgb, 1.0);
}
`;
