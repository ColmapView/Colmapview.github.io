// XR Output Shaders
// =================
// WGSL shaders for WebXR-related output modes.
//
// xr-passthrough: Outputs the Gaussian rasterization result with its
//   premultiplied alpha preserved (no background compositing). The XR
//   compositor blends this over the camera passthrough feed. An optional
//   global opacity multiplier lets the app fade the GS overlay.
//
// side-by-side: Renders two color textures (left and right eye) into the
//   left and right halves of a single render target. Useful for stereo
//   preview on a flat screen or for WebXR multiview fallback.
/**
 * XR Passthrough WGSL shader source.
 *
 * Outputs the Gaussian rasterization color (premultiplied alpha) directly,
 * optionally scaled by a global opacity multiplier. No background is composited;
 * transparent regions remain transparent for the XR compositor.
 *
 * Bindings:
 * - group(0) binding(0): XRPassthroughUniforms (uniform buffer, 16 bytes)
 * - group(0) binding(1): colorSampler (sampler)
 * - group(0) binding(2): colorTexture (texture_2d<f32>) -- rasterization output
 *
 * Entry points:
 * - vs_main: Fullscreen triangle (3 vertices, no vertex buffer)
 * - fs_main: Passthrough with optional opacity scaling
 */
export const xrPassthroughShaderSource = /* wgsl */ `
struct XRPassthroughUniforms {
    viewport: vec2<f32>,   // offset 0 (8B) -- width, height
    opacity: f32,          // offset 8 (4B) -- global opacity multiplier [0,1]
    _pad0: u32,            // offset 12 (4B)
};

@group(0) @binding(0) var<uniform> uniforms: XRPassthroughUniforms;
@group(0) @binding(1) var colorSampler: sampler;
@group(0) @binding(2) var colorTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let x = f32(i32(vertexIndex & 1u) * 4 - 1);
    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let gs = textureSample(colorTexture, colorSampler, input.uv);

    // Scale all channels (premultiplied RGB + alpha) by global opacity
    return gs * uniforms.opacity;
}
`;
/**
 * Side-by-side stereo WGSL shader source.
 *
 * Renders two color textures (left and right eye) into the left and right
 * halves of the output target. The fragment shader determines which eye
 * based on the UV x-coordinate (left half < 0.5, right half >= 0.5),
 * then remaps the UV to sample the full texture for that eye.
 *
 * Bindings:
 * - group(0) binding(0): SideBySideUniforms (uniform buffer, 16 bytes)
 * - group(0) binding(1): colorSampler (sampler)
 * - group(0) binding(2): leftTexture (texture_2d<f32>) -- left eye color
 * - group(0) binding(3): rightTexture (texture_2d<f32>) -- right eye color
 *
 * Entry points:
 * - vs_main: Fullscreen triangle (3 vertices, no vertex buffer)
 * - fs_main: Side-by-side stereo compositing
 */
export const sideBySideShaderSource = /* wgsl */ `
struct SideBySideUniforms {
    viewport: vec2<f32>,   // offset 0 (8B) -- width, height
    swapEyes: u32,         // offset 8 (4B) -- 0=normal (L|R), 1=swapped (R|L)
    _pad0: u32,            // offset 12 (4B)
};

@group(0) @binding(0) var<uniform> uniforms: SideBySideUniforms;
@group(0) @binding(1) var colorSampler: sampler;
@group(0) @binding(2) var leftTexture: texture_2d<f32>;
@group(0) @binding(3) var rightTexture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let x = f32(i32(vertexIndex & 1u) * 4 - 1);
    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;

    // Determine which half: left (u < 0.5) or right (u >= 0.5)
    let isRight = select(false, true, uv.x >= 0.5);

    // Remap u from [0, 0.5) -> [0, 1] for left, [0.5, 1] -> [0, 1] for right
    let eyeU = select(uv.x * 2.0, (uv.x - 0.5) * 2.0, isRight);
    let eyeUV = vec2<f32>(eyeU, uv.y);

    // Optionally swap eyes
    let swapped = uniforms.swapEyes != 0u;
    let sampleRight = select(isRight, !isRight, swapped);

    if (sampleRight) {
        return textureSample(rightTexture, colorSampler, eyeUV);
    } else {
        return textureSample(leftTexture, colorSampler, eyeUV);
    }
}
`;
