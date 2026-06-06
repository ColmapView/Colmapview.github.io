// Preprocess Projection Shader
// =============================
// Full preprocess compute shader for Gaussian splatting projection.
// Composes all shared WGSL modules (constants, structs, math, projection,
// spherical-harmonics) with the preprocess-full main body into a single
// string constant — no bundler imports needed.
//
// This shader transforms raw Gaussian data into screen-space SplatData
// (48 bytes each), quantized u32 depths for radix sort, and initialized
// indices [0..N).
//
// Adapted from webgpu/src/shaders/ with all shared modules inlined.
// Uniform layout matches renderer.ts packing (56 floats = 224 bytes).
/**
 * Preprocess WGSL shader source for GPU Gaussian projection.
 *
 * Bindings:
 * - group(0) binding(0): Uniforms (uniform buffer, 224 bytes)
 * - group(0) binding(1): gaussians (storage buffer, Gaussian array, read-only)
 * - group(0) binding(2): shCoeffs (storage buffer, f32 array, read-only)
 * - group(0) binding(3): splatData (storage buffer, SplatData array, read-write)
 * - group(0) binding(4): depths (storage buffer, u32 array, read-write)
 * - group(0) binding(5): indices (storage buffer, u32 array, read-write)
 *
 * Entry points:
 * - main: @compute @workgroup_size(256)
 */
export const preprocessShaderSource = /* wgsl */ `
// =============================================
// Shared Constants
// =============================================

// Camera models
const CAMERA_PINHOLE: u32 = 0u;
const CAMERA_ORTHO: u32 = 1u;

// Render modes
const RENDER_MODE_RGB: u32 = 0u;
const RENDER_MODE_DEPTH: u32 = 1u;
const RENDER_MODE_RGBD: u32 = 2u;

// Alpha threshold (1/255 for early fragment rejection)
const ALPHA_THRESHOLD: f32 = 0.00392156862745098;

// Spherical Harmonics coefficients
const SH_C0: f32 = 0.2820947917738781;
const SH_C1: f32 = 0.48860251190292;
const SH_C2_0: f32 = 1.092548430592079;
const SH_C2_1: f32 = 0.9461746957575601;
const SH_C2_2: f32 = 0.3153915652525201;
const SH_C2_3: f32 = 0.5462742152960395;
const SH_C3_0: f32 = 2.285228997322329;
const SH_C3_1: f32 = 0.4570457994644658;
const SH_C3_2: f32 = 1.445305721320277;
const SH_C3_3: f32 = 1.865881662950577;
const SH_C3_4: f32 = 1.119528997770346;
const SH_C3_5: f32 = 0.5900435899266435;

// =============================================
// Shared Structs
// =============================================

struct Uniforms {
    viewMatrix: mat4x4<f32>,
    projMatrix: mat4x4<f32>,
    viewport: vec4<f32>,      // width, height, focalX, focalY
    camPos: vec3<f32>,
    shDegree: u32,
    nearPlane: f32,
    farPlane: f32,
    eps2d: f32,
    antialiasing: u32,
    cameraModel: u32,
    renderMode: u32,
    numGaussians: u32,
    reverseSort: u32,
    useDepthTest: u32,
    linearOutput: u32,
    cullNear: f32,
    cullAlpha: f32,
    cullMargin: f32,
    writeIndices: u32,
};

struct Gaussian {
    position: vec3<f32>,
    opacity: f32,
    scale: vec3<f32>,
    _pad0: f32,
    rotation: vec4<f32>,     // quaternion (w, x, y, z)
    sh0: vec3<f32>,          // DC spherical harmonic term
    _pad1: f32,
};

struct SplatData {
    mean2d: vec2<f32>,       // Screen-space center (pixels)
    depth: f32,              // View-space depth
    radius: f32,             // Pixel radius for billboard
    conic: vec3<f32>,        // Inverse 2D covariance (upper triangle)
    compensation: f32,       // Anti-aliasing compensation factor
    color: vec4<f32>,        // Pre-evaluated RGB + opacity
};

// =============================================
// Shared Math Utilities
// =============================================

fn quatToMat3(q: vec4<f32>) -> mat3x3<f32> {
    let w = q.x;
    let x = q.y;
    let y = q.z;
    let z = q.w;
    return mat3x3<f32>(
        1.0 - 2.0*(y*y + z*z), 2.0*(x*y + w*z),       2.0*(x*z - w*y),
        2.0*(x*y - w*z),       1.0 - 2.0*(x*x + z*z), 2.0*(y*z + w*x),
        2.0*(x*z + w*y),       2.0*(y*z - w*x),       1.0 - 2.0*(x*x + y*y),
    );
}

fn computeCov3D(scale: vec3<f32>, rot: vec4<f32>) -> mat3x3<f32> {
    let R = quatToMat3(rot);
    let S = mat3x3<f32>(
        scale.x, 0.0, 0.0,
        0.0, scale.y, 0.0,
        0.0, 0.0, scale.z,
    );
    let RS = R * S;
    return RS * transpose(RS);
}

fn calcEigenvalues(a: f32, b: f32, c: f32) -> vec2<f32> {
    let delta = sqrt(a*a - 2.0*a*c + 4.0*b*b + c*c);
    return vec2<f32>(0.5 * (a + c + delta), 0.5 * (a + c - delta));
}

fn addBlur(cov2d: ptr<function, mat2x2<f32>>, eps2d: f32) -> vec2<f32> {
    let det_orig = (*cov2d)[0][0] * (*cov2d)[1][1] - (*cov2d)[0][1] * (*cov2d)[1][0];
    (*cov2d)[0][0] += eps2d;
    (*cov2d)[1][1] += eps2d;
    let det_blur = (*cov2d)[0][0] * (*cov2d)[1][1] - (*cov2d)[0][1] * (*cov2d)[1][0];
    let compensation = sqrt(max(0.0, det_orig / det_blur));
    return vec2<f32>(det_blur, compensation);
}

fn computeRadiusExtend(opacity: f32, compensation: f32, alphaThreshold: f32) -> f32 {
    let effectiveOpacity = opacity * compensation;
    if (effectiveOpacity < alphaThreshold) {
        return 0.0;
    }
    return min(3.33, sqrt(2.0 * log(effectiveOpacity / alphaThreshold)));
}

fn quantizeDepth(depth: f32, near: f32, far: f32) -> u32 {
    let normalized = clamp((depth - near) / (far - near), 0.0, 1.0);
    return u32(min(normalized * 4294967295.0, 4294967294.0));
}

fn srgbToLinear(c: vec3<f32>) -> vec3<f32> {
    let cutoff = vec3<f32>(0.04045);
    let low = c / 12.92;
    let high = pow((c + 0.055) / 1.055, vec3<f32>(2.4));
    return select(high, low, c <= cutoff);
}

// =============================================
// Shared Projection Functions
// =============================================

fn computeCov2D_Pinhole(viewPos: vec3<f32>, cov3D: mat3x3<f32>) -> mat2x2<f32> {
    let focalX = uniforms.viewport.z;
    let focalY = uniforms.viewport.w;

    let rz = 1.0 / viewPos.z;
    let rz2 = rz * rz;

    let J00 = focalX * rz;
    let J02 = -focalX * viewPos.x * rz2;
    let J11 = focalY * rz;
    let J12 = -focalY * viewPos.y * rz2;

    let W = mat3x3<f32>(
        uniforms.viewMatrix[0].xyz,
        uniforms.viewMatrix[1].xyz,
        uniforms.viewMatrix[2].xyz,
    );
    let cov_view = W * cov3D * transpose(W);

    let JC00 = J00 * cov_view[0][0] + J02 * cov_view[2][0];
    let JC01 = J00 * cov_view[0][1] + J02 * cov_view[2][1];
    let JC02 = J00 * cov_view[0][2] + J02 * cov_view[2][2];
    let JC10 = J11 * cov_view[1][0] + J12 * cov_view[2][0];
    let JC11 = J11 * cov_view[1][1] + J12 * cov_view[2][1];
    let JC12 = J11 * cov_view[1][2] + J12 * cov_view[2][2];

    let cov00 = JC00 * J00 + JC02 * J02;
    let cov01 = JC01 * J11 + JC02 * J12;
    let cov11 = JC11 * J11 + JC12 * J12;

    return mat2x2<f32>(cov00, cov01, cov01, cov11);
}

fn computeCov2D_Ortho(cov3D: mat3x3<f32>) -> mat2x2<f32> {
    let focalX = uniforms.viewport.z;
    let focalY = uniforms.viewport.w;

    let W = mat3x3<f32>(
        uniforms.viewMatrix[0].xyz,
        uniforms.viewMatrix[1].xyz,
        uniforms.viewMatrix[2].xyz,
    );
    let cov_view = W * cov3D * transpose(W);

    return mat2x2<f32>(
        focalX * focalX * cov_view[0][0], focalX * focalY * cov_view[0][1],
        focalX * focalY * cov_view[1][0], focalY * focalY * cov_view[1][1],
    );
}

// =============================================
// Shared Spherical Harmonics Evaluation
// =============================================

fn getSHCoeff(gaussianIdx: u32, coeffIdx: u32, numCoeffsPerGaussian: u32) -> vec3<f32> {
    let baseIdx = gaussianIdx * numCoeffsPerGaussian * 3u + coeffIdx * 3u;
    return vec3<f32>(shCoeffs[baseIdx], shCoeffs[baseIdx + 1u], shCoeffs[baseIdx + 2u]);
}

fn evalSH_Degree0(sh0: vec3<f32>) -> vec3<f32> {
    return sh0 * SH_C0 + 0.5;
}

fn evalSH_Degree1(sh0: vec3<f32>, gaussianIdx: u32, dir: vec3<f32>) -> vec3<f32> {
    var result = sh0 * SH_C0;
    let sh1_0 = getSHCoeff(gaussianIdx, 0u, 3u);
    let sh1_1 = getSHCoeff(gaussianIdx, 1u, 3u);
    let sh1_2 = getSHCoeff(gaussianIdx, 2u, 3u);
    result += SH_C1 * (-dir.y * sh1_0 + dir.z * sh1_1 - dir.x * sh1_2);
    return result + 0.5;
}

fn evalSH_Degree2(sh0: vec3<f32>, gaussianIdx: u32, dir: vec3<f32>) -> vec3<f32> {
    var result = sh0 * SH_C0;
    let sh1_0 = getSHCoeff(gaussianIdx, 0u, 8u);
    let sh1_1 = getSHCoeff(gaussianIdx, 1u, 8u);
    let sh1_2 = getSHCoeff(gaussianIdx, 2u, 8u);
    result += SH_C1 * (-dir.y * sh1_0 + dir.z * sh1_1 - dir.x * sh1_2);

    let x2 = dir.x * dir.x;
    let y2 = dir.y * dir.y;
    let z2 = dir.z * dir.z;
    let fTmp0B = -SH_C2_0 * dir.z;
    let fC1 = x2 - y2;
    let fS1 = 2.0 * dir.x * dir.y;
    let pSH6 = SH_C2_1 * z2 - SH_C2_2;
    let pSH7 = fTmp0B * dir.x;
    let pSH5 = fTmp0B * dir.y;
    let pSH8 = SH_C2_3 * fC1;
    let pSH4 = SH_C2_3 * fS1;

    let sh2_0 = getSHCoeff(gaussianIdx, 3u, 8u);
    let sh2_1 = getSHCoeff(gaussianIdx, 4u, 8u);
    let sh2_2 = getSHCoeff(gaussianIdx, 5u, 8u);
    let sh2_3 = getSHCoeff(gaussianIdx, 6u, 8u);
    let sh2_4 = getSHCoeff(gaussianIdx, 7u, 8u);
    result += pSH4 * sh2_0 + pSH5 * sh2_1 + pSH6 * sh2_2 + pSH7 * sh2_3 + pSH8 * sh2_4;

    return result + 0.5;
}

fn evalSH_Degree3(sh0: vec3<f32>, gaussianIdx: u32, dir: vec3<f32>) -> vec3<f32> {
    var result = sh0 * SH_C0;
    let sh1_0 = getSHCoeff(gaussianIdx, 0u, 15u);
    let sh1_1 = getSHCoeff(gaussianIdx, 1u, 15u);
    let sh1_2 = getSHCoeff(gaussianIdx, 2u, 15u);
    result += SH_C1 * (-dir.y * sh1_0 + dir.z * sh1_1 - dir.x * sh1_2);

    let x2 = dir.x * dir.x;
    let y2 = dir.y * dir.y;
    let z2 = dir.z * dir.z;
    let fTmp0B = -SH_C2_0 * dir.z;
    let fC1 = x2 - y2;
    let fS1 = 2.0 * dir.x * dir.y;
    let pSH6 = SH_C2_1 * z2 - SH_C2_2;
    let pSH7 = fTmp0B * dir.x;
    let pSH5 = fTmp0B * dir.y;
    let pSH8 = SH_C2_3 * fC1;
    let pSH4 = SH_C2_3 * fS1;

    let sh2_0 = getSHCoeff(gaussianIdx, 3u, 15u);
    let sh2_1 = getSHCoeff(gaussianIdx, 4u, 15u);
    let sh2_2 = getSHCoeff(gaussianIdx, 5u, 15u);
    let sh2_3 = getSHCoeff(gaussianIdx, 6u, 15u);
    let sh2_4 = getSHCoeff(gaussianIdx, 7u, 15u);
    result += pSH4 * sh2_0 + pSH5 * sh2_1 + pSH6 * sh2_2 + pSH7 * sh2_3 + pSH8 * sh2_4;

    let fTmp0C = -SH_C3_0 * z2 + SH_C3_1;
    let fTmp1B = SH_C3_2 * dir.z;
    let fC2 = dir.x * fC1 - dir.y * fS1;
    let fS2 = dir.x * fS1 + dir.y * fC1;
    let pSH12 = dir.z * (SH_C3_3 * z2 - SH_C3_4);
    let pSH13 = fTmp0C * dir.x;
    let pSH11 = fTmp0C * dir.y;
    let pSH14 = fTmp1B * fC1;
    let pSH10 = fTmp1B * fS1;
    let pSH15 = -SH_C3_5 * fC2;
    let pSH9 = -SH_C3_5 * fS2;

    let sh3_0 = getSHCoeff(gaussianIdx, 8u, 15u);
    let sh3_1 = getSHCoeff(gaussianIdx, 9u, 15u);
    let sh3_2 = getSHCoeff(gaussianIdx, 10u, 15u);
    let sh3_3 = getSHCoeff(gaussianIdx, 11u, 15u);
    let sh3_4 = getSHCoeff(gaussianIdx, 12u, 15u);
    let sh3_5 = getSHCoeff(gaussianIdx, 13u, 15u);
    let sh3_6 = getSHCoeff(gaussianIdx, 14u, 15u);
    result += pSH9 * sh3_0 + pSH10 * sh3_1 + pSH11 * sh3_2 + pSH12 * sh3_3 +
              pSH13 * sh3_4 + pSH14 * sh3_5 + pSH15 * sh3_6;

    return result + 0.5;
}

// =============================================
// Preprocess Main — Bindings + Compute Entry Point
// =============================================

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> gaussians: array<Gaussian>;
@group(0) @binding(2) var<storage, read> shCoeffs: array<f32>;
@group(0) @binding(3) var<storage, read_write> splatData: array<SplatData>;
@group(0) @binding(4) var<storage, read_write> depths: array<u32>;
@group(0) @binding(5) var<storage, read_write> indices: array<u32>;

// Use 2D dispatch to handle >16M elements (65535 * 256 = 16.7M per dimension)
@compute
@workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // 2D global_id: x varies fastest, then y
    let idx = global_id.x + global_id.y * 65535u * 256u;
    let count = arrayLength(&gaussians);

    if (idx >= count) {
        return;
    }

    let g = gaussians[idx];
    var splat: SplatData;

    // 1. View-space transform
    let viewPos4 = uniforms.viewMatrix * vec4<f32>(g.position, 1.0);
    let viewPos = viewPos4.xyz;
    let sortDepth = quantizeDepth(-viewPos.z, uniforms.nearPlane, uniforms.farPlane);

    // Initialize output only on frames that are about to sort. When sort is
    // skipped, preserving the previous sorted index buffer keeps translation-
    // only camera updates cheap without changing depth order.
    if (uniforms.writeIndices != 0u) {
        indices[idx] = idx;
    }

    // 2. Frustum culling (configurable near plane)
    if (viewPos.z > uniforms.cullNear) {
        splat.radius = 0.0;
        splatData[idx] = splat;
        depths[idx] = sortDepth;
        return;
    }

    // 3. Clip-space projection + NDC culling (configurable margin)
    let clipPos = uniforms.projMatrix * viewPos4;
    let clip = uniforms.cullMargin * clipPos.w;
    if (clipPos.z < -clipPos.w || clipPos.z > clipPos.w ||
        clipPos.x < -clip || clipPos.x > clip ||
        clipPos.y < -clip || clipPos.y > clip) {
        splat.radius = 0.0;
        splatData[idx] = splat;
        depths[idx] = sortDepth;
        return;
    }

    // 4. Compute 3D covariance
    let cov3D = computeCov3D(g.scale, g.rotation);

    // 5. Project to 2D
    var cov2D: mat2x2<f32>;
    if (uniforms.cameraModel == CAMERA_ORTHO) {
        cov2D = computeCov2D_Ortho(cov3D);
    } else {
        cov2D = computeCov2D_Pinhole(viewPos, cov3D);
    }

    // 6. Anti-aliasing blur
    var compensation = 1.0;
    if (uniforms.antialiasing != 0u) {
        let blur_result = addBlur(&cov2D, uniforms.eps2d);
        if (blur_result.x <= 0.0) {
            splat.radius = 0.0;
            splatData[idx] = splat;
            depths[idx] = sortDepth;
            return;
        }
        compensation = blur_result.y;
    } else {
        cov2D[0][0] += uniforms.eps2d;
        cov2D[1][1] += uniforms.eps2d;
    }

    // 7. Eigenvalues for radius
    let a = cov2D[0][0];
    let b = cov2D[0][1];
    let c = cov2D[1][1];
    let eigenvalues = calcEigenvalues(a, b, c);

    // 8. Opacity-aware radius (configurable alpha threshold)
    let extend = computeRadiusExtend(g.opacity, compensation, uniforms.cullAlpha);
    if (extend <= 0.0) {
        splat.radius = 0.0;
        splatData[idx] = splat;
        depths[idx] = sortDepth;
        return;
    }
    let radiusPx = ceil(extend * sqrt(max(eigenvalues.x, eigenvalues.y)));
    if (radiusPx <= 0.0) {
        splat.radius = 0.0;
        splatData[idx] = splat;
        depths[idx] = sortDepth;
        return;
    }

    // 9. Screen-space position
    let ndc = clipPos.xy / clipPos.w;
    let viewportWidth = uniforms.viewport.x;
    let viewportHeight = uniforms.viewport.y;
    var screenX = (ndc.x * 0.5 + 0.5) * viewportWidth;
    var screenY = (0.5 - ndc.y * 0.5) * viewportHeight;

    // 10. Conic (inverse covariance)
    let det = a * c - b * b;
    let conic = vec3<f32>(c / det, -b / det, a / det);

    // 11. SH evaluation (view-dependent color)
    let viewDir = normalize(g.position - uniforms.camPos);
    var color: vec3<f32>;
    if (uniforms.shDegree == 0u) {
        color = evalSH_Degree0(g.sh0);
    } else if (uniforms.shDegree == 1u) {
        color = evalSH_Degree1(g.sh0, idx, viewDir);
    } else if (uniforms.shDegree == 2u) {
        color = evalSH_Degree2(g.sh0, idx, viewDir);
    } else {
        color = evalSH_Degree3(g.sh0, idx, viewDir);
    }

    // 12. Pack output
    splat.mean2d = vec2<f32>(screenX, screenY);
    splat.depth = -viewPos.z;
    splat.radius = radiusPx;
    splat.conic = conic;
    splat.compensation = compensation;

    // Apply sRGB to linear conversion for Three.js compositing
    var finalColor = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));
    if (uniforms.linearOutput != 0u) {
        finalColor = srgbToLinear(finalColor);
    }
    splat.color = vec4<f32>(finalColor, g.opacity);

    splatData[idx] = splat;
    depths[idx] = sortDepth;
}
`;
