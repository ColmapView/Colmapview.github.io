// Output Post-Processing Shaders
// ===============================
// WGSL shaders for fullscreen post-processing passes after Gaussian rasterization.
//
// Both shaders use the fullscreen triangle technique: 3 vertices with no vertex buffer,
// generating a single triangle that covers the entire viewport via vertex_index math.
// This avoids the overhead of a vertex buffer and is the standard approach for
// fullscreen passes in modern GPU rendering.
//
// Input textures are sampled via texture bindings + sampler (not storage buffers),
// because the rasterization stage writes to texture views.
/**
 * Composite WGSL shader source for background compositing.
 *
 * Composites the Gaussian rasterization output (premultiplied alpha) over a background.
 * Supports solid color background, texture background, and depth-aware compositing.
 *
 * Bindings:
 * - group(0) binding(0): CompositeUniforms (uniform buffer, 48 bytes)
 * - group(0) binding(1): colorSampler (sampler)
 * - group(0) binding(2): colorTexture (texture_2d<f32>) — rasterization output
 * - group(0) binding(3): backgroundTexture (texture_2d<f32>) — background (1x1 fallback if absent)
 * - group(0) binding(4): depthTexture (texture_2d<f32>) — depth (1x1 fallback if absent)
 *
 * Entry points:
 * - vs_main: Fullscreen triangle (3 vertices, no vertex buffer)
 * - fs_main: Premultiplied alpha "over" compositing
 */
export const compositeShaderSource = /* wgsl */ `
struct CompositeUniforms {
    viewport: vec2<f32>,         // offset 0 (8B) — width, height
    depthAware: u32,             // offset 8 (4B) — 0=off, 1=on
    _pad0: u32,                  // offset 12 (4B)
    backgroundColor: vec4<f32>,  // offset 16 (16B)
    nearPlane: f32,              // offset 32 (4B)
    farPlane: f32,               // offset 36 (4B)
    _pad1: u32,                  // offset 40 (4B)
    _pad2: u32,                  // offset 44 (4B)
};

@group(0) @binding(0) var<uniform> uniforms: CompositeUniforms;
@group(0) @binding(1) var colorSampler: sampler;
@group(0) @binding(2) var colorTexture: texture_2d<f32>;
@group(0) @binding(3) var backgroundTexture: texture_2d<f32>;
@group(0) @binding(4) var depthTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Fullscreen triangle: 3 vertices covering the entire viewport
// vertex 0: (-1, -1) uv (0, 1)
// vertex 1: ( 3, -1) uv (2, 1)
// vertex 2: (-1,  3) uv (0,-1)
// The GPU clips the oversized triangle to the viewport automatically.
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let x = f32(i32(vertexIndex & 1u) * 4 - 1);
    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    // UV: map NDC [-1,1] to [0,1], flip Y for texture coordinates
    output.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return output;
}

// Linearize a non-linear depth value using near/far planes.
// depth is in [0,1] range from the depth texture.
fn linearizeDepth(depth: f32, near: f32, far: f32) -> f32 {
    return near * far / (far - depth * (far - near));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;

    // Sample Gaussian render (premultiplied alpha RGBA)
    let gs = textureSample(colorTexture, colorSampler, uv);

    // Sample background texture (1x1 solid color fallback when no texture provided)
    let bg = textureSample(backgroundTexture, colorSampler, uv);

    // Depth-aware compositing: attenuate Gaussians that are behind background geometry
    if (uniforms.depthAware != 0u) {
        let gsDepth = textureSample(depthTexture, colorSampler, uv).r;
        let gsLinear = linearizeDepth(gsDepth, uniforms.nearPlane, uniforms.farPlane);

        // Background is assumed at far plane when no real depth is available
        let bgLinear = uniforms.farPlane;

        // Where the Gaussian median depth is behind the background,
        // suppress Gaussian contribution and show background instead
        let behindBg = select(0.0, 1.0, gsLinear > bgLinear);
        let effectiveAlpha = gs.a * (1.0 - behindBg);

        // Re-composite: use effective alpha to blend Gaussian and background
        // gs.rgb is premultiplied by gs.a, so scale by (effectiveAlpha / gs.a)
        let gsScaled = select(gs.rgb * (effectiveAlpha / gs.a), vec3<f32>(0.0), gs.a < 0.001);
        let result = vec4<f32>(gsScaled + bg.rgb * (1.0 - effectiveAlpha), 1.0);
        return result;
    }

    // Standard "over" compositing (no depth awareness)
    // gs is premultiplied, so: result = gs + bg * (1 - gs.a)
    let result = gs + bg * (1.0 - gs.a);
    return result;
}
`;
/**
 * Depth-of-field WGSL shader source for blur post-processing.
 *
 * Implements separable (two-pass) circle-of-confusion blur.
 * Execute twice: horizontal pass (passDirection=0), then vertical pass (passDirection=1).
 *
 * Bindings:
 * - group(0) binding(0): DofUniforms (uniform buffer, 32 bytes)
 * - group(0) binding(1): colorSampler (sampler)
 * - group(0) binding(2): colorTexture (texture_2d<f32>) — input color
 * - group(0) binding(3): depthTexture (texture_2d<f32>) — depth for CoC computation
 *
 * Entry points:
 * - vs_main: Fullscreen triangle (3 vertices, no vertex buffer)
 * - fs_main: Weighted Gaussian blur with per-sample CoC
 */
export const dofShaderSource = /* wgsl */ `
struct DofUniforms {
    viewport: vec2<f32>,    // offset 0 (8B) — width, height
    focalDistance: f32,      // offset 8 (4B)
    aperture: f32,           // offset 12 (4B)
    nearPlane: f32,          // offset 16 (4B)
    farPlane: f32,           // offset 20 (4B)
    maxCoC: f32,             // offset 24 (4B)
    passDirection: u32,      // offset 28 (4B) — 0=horizontal, 1=vertical
};

@group(0) @binding(0) var<uniform> uniforms: DofUniforms;
@group(0) @binding(1) var colorSampler: sampler;
@group(0) @binding(2) var colorTexture: texture_2d<f32>;
@group(0) @binding(3) var depthTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Fullscreen triangle (same as composite shader)
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let x = f32(i32(vertexIndex & 1u) * 4 - 1);
    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return output;
}

// Linearize a non-linear depth value using near/far planes.
fn linearizeDepth(depth: f32, near: f32, far: f32) -> f32 {
    return near * far / (far - depth * (far - near));
}

// Gaussian kernel weight for 1D blur.
fn gaussianWeight(offset: f32, sigma: f32) -> f32 {
    let s = max(sigma, 0.001);
    return exp(-0.5 * (offset * offset) / (s * s));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;

    // Read depth and compute circle-of-confusion radius (pixels)
    // Standard thin-lens CoC: aperture * |depth - focalDistance| / depth
    let depth = textureSample(depthTexture, colorSampler, uv).r;
    let linearDepth = linearizeDepth(depth, uniforms.nearPlane, uniforms.farPlane);
    let coc = clamp(
        uniforms.aperture * abs(linearDepth - uniforms.focalDistance) / max(linearDepth, 0.001),
        0.0,
        uniforms.maxCoC
    );

    // CoC in pixels, used as blur sigma
    let cocPixels = coc;

    // Direction vector: horizontal (1,0) or vertical (0,1)
    let direction = select(
        vec2<f32>(0.0, 1.0 / uniforms.viewport.y),
        vec2<f32>(1.0 / uniforms.viewport.x, 0.0),
        uniforms.passDirection == 0u
    );

    // Weighted Gaussian blur: 9 taps (-4..+4)
    var color = vec4<f32>(0.0);
    var weightSum = 0.0;

    for (var i = -4; i <= 4; i = i + 1) {
        let offset = direction * f32(i) * cocPixels;
        let s = textureSample(colorTexture, colorSampler, uv + offset);

        // Sample neighbor's CoC for weighting (prevents sharp objects bleeding into blur)
        let sampleDepth = textureSample(depthTexture, colorSampler, uv + offset).r;
        let sampleLinear = linearizeDepth(sampleDepth, uniforms.nearPlane, uniforms.farPlane);
        let sampleCoC = clamp(
            uniforms.aperture * abs(sampleLinear - uniforms.focalDistance) / max(sampleLinear, 0.001),
            0.0,
            uniforms.maxCoC
        );

        let w = gaussianWeight(f32(i), max(cocPixels, sampleCoC));
        color = color + s * w;
        weightSum = weightSum + w;
    }

    return color / weightSum;
}
`;
