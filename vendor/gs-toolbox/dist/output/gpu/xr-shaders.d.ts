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
export declare const xrPassthroughShaderSource = "\nstruct XRPassthroughUniforms {\n    viewport: vec2<f32>,   // offset 0 (8B) -- width, height\n    opacity: f32,          // offset 8 (4B) -- global opacity multiplier [0,1]\n    _pad0: u32,            // offset 12 (4B)\n};\n\n@group(0) @binding(0) var<uniform> uniforms: XRPassthroughUniforms;\n@group(0) @binding(1) var colorSampler: sampler;\n@group(0) @binding(2) var colorTexture: texture_2d<f32>;\n\nstruct VertexOutput {\n    @builtin(position) position: vec4<f32>,\n    @location(0) uv: vec2<f32>,\n};\n\n@vertex\nfn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {\n    var output: VertexOutput;\n    let x = f32(i32(vertexIndex & 1u) * 4 - 1);\n    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);\n    output.position = vec4<f32>(x, y, 0.0, 1.0);\n    output.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);\n    return output;\n}\n\n@fragment\nfn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {\n    let gs = textureSample(colorTexture, colorSampler, input.uv);\n\n    // Scale all channels (premultiplied RGB + alpha) by global opacity\n    return gs * uniforms.opacity;\n}\n";
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
export declare const sideBySideShaderSource = "\nstruct SideBySideUniforms {\n    viewport: vec2<f32>,   // offset 0 (8B) -- width, height\n    swapEyes: u32,         // offset 8 (4B) -- 0=normal (L|R), 1=swapped (R|L)\n    _pad0: u32,            // offset 12 (4B)\n};\n\n@group(0) @binding(0) var<uniform> uniforms: SideBySideUniforms;\n@group(0) @binding(1) var colorSampler: sampler;\n@group(0) @binding(2) var leftTexture: texture_2d<f32>;\n@group(0) @binding(3) var rightTexture: texture_2d<f32>;\n\nstruct VertexOutput {\n    @builtin(position) position: vec4<f32>,\n    @location(0) uv: vec2<f32>,\n};\n\n@vertex\nfn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {\n    var output: VertexOutput;\n    let x = f32(i32(vertexIndex & 1u) * 4 - 1);\n    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);\n    output.position = vec4<f32>(x, y, 0.0, 1.0);\n    output.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);\n    return output;\n}\n\n@fragment\nfn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {\n    let uv = input.uv;\n\n    // Determine which half: left (u < 0.5) or right (u >= 0.5)\n    let isRight = select(false, true, uv.x >= 0.5);\n\n    // Remap u from [0, 0.5) -> [0, 1] for left, [0.5, 1] -> [0, 1] for right\n    let eyeU = select(uv.x * 2.0, (uv.x - 0.5) * 2.0, isRight);\n    let eyeUV = vec2<f32>(eyeU, uv.y);\n\n    // Optionally swap eyes\n    let swapped = uniforms.swapEyes != 0u;\n    let sampleRight = select(isRight, !isRight, swapped);\n\n    if (sampleRight) {\n        return textureSample(rightTexture, colorSampler, eyeUV);\n    } else {\n        return textureSample(leftTexture, colorSampler, eyeUV);\n    }\n}\n";
