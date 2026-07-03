import{n as y,r as k,g as P}from"./webGpuSplatTelemetry-C1RN5ecG.js";import{n as m,t as b,l as X,D as _,E as ie,F as J,A as I}from"./index-DeMjF53s.js";const se=`
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
`;class $ extends Error{constructor(e,t){super(`${e} does not support ${t}`),this.name="UnsupportedGPUSortCapabilityError"}}const h="u32-depth",g="u32-index",oe={radix:{fixedCount:!0,indirectCount:!0,stable:!0,precisionBits:32,keyFormat:h,indexFormat:g,requiresPowerOfTwo:!1},"radix-16bit":{fixedCount:!0,indirectCount:!0,stable:!0,precisionBits:16,keyFormat:h,indexFormat:g,requiresPowerOfTwo:!1},"radix-8bit":{fixedCount:!0,indirectCount:!0,stable:!0,precisionBits:8,keyFormat:h,indexFormat:g,requiresPowerOfTwo:!1},radix4:{fixedCount:!0,indirectCount:!1,stable:!0,precisionBits:32,keyFormat:h,indexFormat:g,requiresPowerOfTwo:!1},"radix4-16bit":{fixedCount:!0,indirectCount:!1,stable:!0,precisionBits:16,keyFormat:h,indexFormat:g,requiresPowerOfTwo:!1},"radix4-8bit":{fixedCount:!0,indirectCount:!1,stable:!0,precisionBits:8,keyFormat:h,indexFormat:g,requiresPowerOfTwo:!1},bitonic:{fixedCount:!0,indirectCount:!1,stable:!0,precisionBits:32,keyFormat:h,indexFormat:g,requiresPowerOfTwo:!0},counting:{fixedCount:!0,indirectCount:!1,stable:!1,precisionBits:16,keyFormat:h,indexFormat:g,requiresPowerOfTwo:!1},"counting-32bit":{fixedCount:!0,indirectCount:!1,stable:!1,precisionBits:32,keyFormat:h,indexFormat:g,requiresPowerOfTwo:!1}};function ae(i){return{...oe[i]}}function O(i){throw new $(i,"indirect-count sorting")}function R(i,e){const t=Math.ceil(i/e),r=65535;if(t<=r)return[t,1];const s=r,o=Math.ceil(t/r);return[s,o]}function ne(i){return Math.pow(2,Math.ceil(Math.log2(Math.max(1,i))))}const ue={pinhole:0,ortho:1};class de{constructor(e,t){this.name="Preprocess",this.configured=!1,this.count=0,this.bindGroup=null,this.device=e,this.shaderModule=e.createShaderModule({code:se}),this.pipeline=e.createComputePipeline({layout:"auto",compute:{module:this.shaderModule,entryPoint:"main"}}),this.uniformBuffer=e.createBuffer({size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.dummySHBuffer=e.createBuffer({size:16,usage:GPUBufferUsage.STORAGE})}configure(e){this.count=e.count;const t=e.buffers.shCoeffs??this.dummySHBuffer;this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:{buffer:e.buffers.gaussians}},{binding:2,resource:{buffer:t}},{binding:3,resource:{buffer:e.buffers.splatData}},{binding:4,resource:{buffer:e.buffers.depths}},{binding:5,resource:{buffer:e.buffers.indices}}]}),this.configured=!0}setUniforms(e){const t=new Float32Array(56),r=new Uint32Array(t.buffer);t.set(e.viewMatrix,0),t.set(e.projMatrix,16),t[32]=e.viewportWidth,t[33]=e.viewportHeight,t[34]=e.focalX,t[35]=e.focalY,t[36]=e.camPos[0],t[37]=e.camPos[1],t[38]=e.camPos[2],r[39]=e.shDegree,t[40]=e.nearPlane,t[41]=e.farPlane,t[42]=e.eps2d??.3,r[43]=e.antialiasing??!0?1:0,r[44]=ue[e.cameraModel??"pinhole"],r[45]=e.renderMode??0,r[46]=e.numGaussians,r[47]=0,r[48]=0,r[49]=e.linearOutput??!1?1:0,t[50]=e.cullNear??-.1,t[51]=e.cullAlpha??1/255,t[52]=e.cullMargin??1.2,r[53]=e.writeIndices??!0?1:0,this.device.queue.writeBuffer(this.uniformBuffer,0,t)}execute(e){if(!this.configured||!this.bindGroup)return;const[t,r]=R(this.count,256),s=e.beginComputePass();s.setPipeline(this.pipeline),s.setBindGroup(0,this.bindGroup),s.dispatchWorkgroups(t,r),s.end()}destroy(){this.uniformBuffer.destroy(),this.dummySHBuffer.destroy(),this.bindGroup=null,this.configured=!1}}function le(i,e){if(i==="preprocess")return new de(e)}const fe=`
// Radix Sort - Histogram Pass
// ============================
// Part 1 of 3-stage radix sort (histogram -> scan -> scatter)
//
// Purpose: Count occurrences of each 8-bit digit (0-255) within each workgroup's
// portion of the data. These local histograms are later combined by the scan pass.
//
// Algorithm:
// 1. Each workgroup processes a contiguous chunk of elements
// 2. Threads collaboratively count digits using shared memory atomics
// 3. Final histogram is written to global memory (256 counts per workgroup)
//
// Performance: O(n/numWorkgroups) per workgroup, highly parallel

struct Uniforms {
    count: u32,
    shift: u32,      // Bit shift for current pass (0, 8, 16, 24)
    numWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depths: array<u32>;
@group(0) @binding(1) var<storage, read_write> histograms: array<u32>;  // 256 * numWorkgroups
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

var<workgroup> localHistogram: array<atomic<u32>, 256>;

@compute
@workgroup_size(256)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    // Initialize local histogram
    atomicStore(&localHistogram[local_id.x], 0u);
    workgroupBarrier();

    // Each thread processes multiple elements
    let elementsPerWorkgroup = (uniforms.count + uniforms.numWorkgroups - 1u) / uniforms.numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, uniforms.count);

    // Count digits for this workgroup's elements
    var idx = startIdx + local_id.x;
    while (idx < endIdx) {
        let depth = depths[idx];
        let digit = (depth >> uniforms.shift) & 0xFFu;
        atomicAdd(&localHistogram[digit], 1u);
        idx += 256u;
    }

    workgroupBarrier();

    // Write local histogram to global memory
    let globalOffset = wg_id.x * 256u + local_id.x;
    histograms[globalOffset] = atomicLoad(&localHistogram[local_id.x]);
}
`,ce=`
// Radix Sort - Prefix Sum (Scan) Pass
// =====================================
// Part 2 of 3-stage radix sort (histogram -> scan -> scatter)
//
// Algorithm: Blelloch Parallel Prefix Sum
// Source: Blelloch, G.E. "Prefix Sums and Their Applications" CMU-CS-90-190, 1990
// Reference: https://www.cs.cmu.edu/~guyb/papers/Ble93.pdf
//
// Purpose: Compute global write offsets for each digit by performing prefix sum
// across all workgroup histograms. This determines where each digit's elements
// should be placed in the final sorted order.
//
// Algorithm (Blelloch parallel scan):
// 1. Sum each digit's count across all workgroups (column sum)
// 2. Perform exclusive prefix sum across 256 digits
// 3. Add global offsets back to per-workgroup histograms
//
// After this pass, histograms[wg * 256 + digit] contains the global starting
// index for elements with that digit in that workgroup.
//
// Performance: O(numWorkgroups * 256), runs on single workgroup

struct Uniforms {
    numWorkgroups: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<storage, read_write> histograms: array<u32>;  // 256 * numWorkgroups
@group(0) @binding(1) var<storage, read_write> globalOffsets: array<u32>;  // 256 digit offsets
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

var<workgroup> temp: array<u32, 256>;

// Single workgroup processes all 256 digits
// Each digit sums its histogram across all workgroups
@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>
) {
    let digit = local_id.x;

    // Sum this digit's count across all workgroups
    var digitTotal = 0u;
    for (var wg = 0u; wg < uniforms.numWorkgroups; wg++) {
        let count = histograms[wg * 256u + digit];
        // Store prefix sum for this workgroup
        histograms[wg * 256u + digit] = digitTotal;
        digitTotal += count;
    }

    // Store digit total in shared memory
    temp[digit] = digitTotal;
    workgroupBarrier();

    // Parallel prefix sum across digits (Blelloch scan)
    // Up-sweep
    for (var stride = 1u; stride < 256u; stride *= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            temp[idx] += temp[idx - stride];
        }
        workgroupBarrier();
    }

    // Clear last element for exclusive scan
    if (digit == 255u) {
        temp[255u] = 0u;
    }
    workgroupBarrier();

    // Down-sweep
    for (var stride = 128u; stride > 0u; stride /= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            let t = temp[idx - stride];
            temp[idx - stride] = temp[idx];
            temp[idx] += t;
        }
        workgroupBarrier();
    }

    // Write global offset for this digit
    globalOffsets[digit] = temp[digit];

    // Update histograms with global offsets
    for (var wg = 0u; wg < uniforms.numWorkgroups; wg++) {
        histograms[wg * 256u + digit] += temp[digit];
    }
}
`,pe=`
// Radix Sort - Stable Scatter Pass
// =================================
// Part 3 of 3-stage radix sort (histogram -> scan -> scatter)
//
// Purpose: Move each element from its source position to its sorted destination
// based on the offsets computed in the scan pass. Uses ping-pong buffers to
// avoid read/write conflicts.
//
// Stability: Uses countBefore (not atomicAdd) to compute destinations, ensuring
// elements with the same digit maintain their relative input order. This is
// critical for multi-pass radix sort correctness.
//
// Algorithm:
// 1. Load pre-computed offsets for this workgroup into shared memory
// 2. For each batch of 256 elements:
//    a. Load elements, compute digit, store digit in shared memory
//    b. Each thread counts same-digit predecessors (countBefore) for stable position
//    c. destIdx = baseOffset[digit] + countBefore (deterministic, stable)
//    d. Write to global output
//    e. Update baseOffset for next batch
//
// Performance: O(n/numWorkgroups) per workgroup

struct Uniforms {
    count: u32,
    shift: u32,
    numWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<storage, read_write> histograms: array<u32>;  // Pre-computed offsets per workgroup
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

var<workgroup> localOffsets: array<u32, 256>;       // Running base offset per digit
var<workgroup> localDigits: array<u32, 256>;        // Digit per thread in current batch
var<workgroup> digitCounts: array<atomic<u32>, 256>; // Per-digit count in current batch

@compute
@workgroup_size(256)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    let tid = local_id.x;

    // Load workgroup's base offsets into shared memory
    localOffsets[tid] = histograms[wg_id.x * 256u + tid];
    workgroupBarrier();

    // Each workgroup processes a contiguous chunk
    let elementsPerWorkgroup = (uniforms.count + uniforms.numWorkgroups - 1u) / uniforms.numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, uniforms.count);

    // Process in batches of 256
    var batchStart = startIdx;
    while (batchStart < endIdx) {
        let batchEnd = min(batchStart + 256u, endIdx);
        let batchSize = batchEnd - batchStart;
        let idx = batchStart + tid;
        let inBounds = tid < batchSize;

        // Reset digit counts
        atomicStore(&digitCounts[tid], 0u);
        workgroupBarrier();

        // Step 1: Load element, compute digit, store in shared memory
        var depth = 0u;
        var origIdx = 0u;
        var digit = 0u;

        if (inBounds) {
            depth = depthsIn[idx];
            origIdx = indicesIn[idx];
            digit = (depth >> uniforms.shift) & 0xFFu;
            atomicAdd(&digitCounts[digit], 1u);
        }
        // Use 256 as sentinel for out-of-bounds threads (no valid digit is 256)
        localDigits[tid] = select(256u, digit, inBounds);
        workgroupBarrier();

        // Step 2: Compute stable destination using countBefore
        // countBefore = number of threads with same digit AND lower tid
        // This guarantees deterministic, stable ordering within each digit
        if (inBounds) {
            var countBefore = 0u;
            for (var t = 0u; t < tid; t++) {
                if (localDigits[t] == digit) {
                    countBefore++;
                }
            }
            let destIdx = localOffsets[digit] + countBefore;
            depthsOut[destIdx] = depth;
            indicesOut[destIdx] = origIdx;
        }
        workgroupBarrier();

        // Step 3: Update base offsets for next batch
        localOffsets[tid] += atomicLoad(&digitCounts[tid]);
        workgroupBarrier();

        batchStart += 256u;
    }
}
`,he=`
// Radix Sort - Indirect Count Histogram Pass

struct Uniforms {
    maxCount: u32,
    shift: u32,
    maxWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depths: array<u32>;
@group(0) @binding(1) var<storage, read_write> histograms: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<storage, read> countBuffer: array<u32>;

var<workgroup> localHistogram: array<atomic<u32>, 256>;

fn activeCount() -> u32 {
    return min(countBuffer[0], uniforms.maxCount);
}

fn activeWorkgroups(count: u32) -> u32 {
    if (count == 0u) {
        return 0u;
    }
    return min(uniforms.maxWorkgroups, (count + 255u) / 256u);
}

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    atomicStore(&localHistogram[local_id.x], 0u);
    workgroupBarrier();

    let count = activeCount();
    let numWorkgroups = activeWorkgroups(count);
    if (wg_id.x >= numWorkgroups) {
        return;
    }

    let elementsPerWorkgroup = (count + numWorkgroups - 1u) / numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, count);

    var idx = startIdx + local_id.x;
    while (idx < endIdx) {
        let depth = depths[idx];
        let digit = (depth >> uniforms.shift) & 0xFFu;
        atomicAdd(&localHistogram[digit], 1u);
        idx += 256u;
    }

    workgroupBarrier();

    let globalOffset = wg_id.x * 256u + local_id.x;
    histograms[globalOffset] = atomicLoad(&localHistogram[local_id.x]);
}
`,ge=`
// Radix Sort - Indirect Count Prefix Sum Pass

struct Uniforms {
    maxCount: u32,
    _shift: u32,
    maxWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read_write> histograms: array<u32>;
@group(0) @binding(1) var<storage, read_write> globalOffsets: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<storage, read> countBuffer: array<u32>;

var<workgroup> temp: array<u32, 256>;

fn activeCount() -> u32 {
    return min(countBuffer[0], uniforms.maxCount);
}

fn activeWorkgroups(count: u32) -> u32 {
    if (count == 0u) {
        return 0u;
    }
    return min(uniforms.maxWorkgroups, (count + 255u) / 256u);
}

@compute
@workgroup_size(256)
fn main(@builtin(local_invocation_id) local_id: vec3<u32>) {
    let digit = local_id.x;
    let count = activeCount();
    let numWorkgroups = activeWorkgroups(count);

    var digitTotal = 0u;
    for (var wg = 0u; wg < numWorkgroups; wg++) {
        let histogramIdx = wg * 256u + digit;
        let binCount = histograms[histogramIdx];
        histograms[histogramIdx] = digitTotal;
        digitTotal += binCount;
    }

    temp[digit] = digitTotal;
    workgroupBarrier();

    for (var stride = 1u; stride < 256u; stride *= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            temp[idx] += temp[idx - stride];
        }
        workgroupBarrier();
    }

    if (digit == 255u) {
        temp[255u] = 0u;
    }
    workgroupBarrier();

    for (var stride = 128u; stride > 0u; stride /= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            let t = temp[idx - stride];
            temp[idx - stride] = temp[idx];
            temp[idx] += t;
        }
        workgroupBarrier();
    }

    globalOffsets[digit] = temp[digit];

    for (var wg = 0u; wg < numWorkgroups; wg++) {
        histograms[wg * 256u + digit] += temp[digit];
    }
}
`,me=`
// Radix Sort - Indirect Count Stable Scatter Pass

struct Uniforms {
    maxCount: u32,
    shift: u32,
    maxWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<storage, read_write> histograms: array<u32>;
@group(0) @binding(5) var<uniform> uniforms: Uniforms;
@group(0) @binding(6) var<storage, read> countBuffer: array<u32>;

var<workgroup> localOffsets: array<u32, 256>;
var<workgroup> localDigits: array<u32, 256>;
var<workgroup> digitCounts: array<atomic<u32>, 256>;

fn activeCount() -> u32 {
    return min(countBuffer[0], uniforms.maxCount);
}

fn activeWorkgroups(count: u32) -> u32 {
    if (count == 0u) {
        return 0u;
    }
    return min(uniforms.maxWorkgroups, (count + 255u) / 256u);
}

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    let tid = local_id.x;
    let count = activeCount();
    let numWorkgroups = activeWorkgroups(count);
    if (wg_id.x >= numWorkgroups) {
        return;
    }

    localOffsets[tid] = histograms[wg_id.x * 256u + tid];
    workgroupBarrier();

    let elementsPerWorkgroup = (count + numWorkgroups - 1u) / numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, count);

    var batchStart = startIdx;
    while (batchStart < endIdx) {
        let batchEnd = min(batchStart + 256u, endIdx);
        let batchSize = batchEnd - batchStart;
        let idx = batchStart + tid;
        let inBounds = tid < batchSize;

        atomicStore(&digitCounts[tid], 0u);
        workgroupBarrier();

        var depth = 0u;
        var origIdx = 0u;
        var digit = 0u;

        if (inBounds) {
            depth = depthsIn[idx];
            origIdx = indicesIn[idx];
            digit = (depth >> uniforms.shift) & 0xFFu;
            atomicAdd(&digitCounts[digit], 1u);
        }
        localDigits[tid] = select(256u, digit, inBounds);
        workgroupBarrier();

        if (inBounds) {
            var countBefore = 0u;
            for (var t = 0u; t < tid; t++) {
                if (localDigits[t] == digit) {
                    countBefore++;
                }
            }
            let destIdx = localOffsets[digit] + countBefore;
            depthsOut[destIdx] = depth;
            indicesOut[destIdx] = origIdx;
        }
        workgroupBarrier();

        localOffsets[tid] += atomicLoad(&digitCounts[tid]);
        workgroupBarrier();

        batchStart += 256u;
    }
}
`,xe=`
// Radix Sort - Indirect Count Copy-Back Pass

struct Uniforms {
    maxCount: u32,
    _shift: u32,
    maxWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<uniform> uniforms: Uniforms;
@group(0) @binding(5) var<storage, read> countBuffer: array<u32>;

fn activeCount() -> u32 {
    return min(countBuffer[0], uniforms.maxCount);
}

fn activeWorkgroups(count: u32) -> u32 {
    if (count == 0u) {
        return 0u;
    }
    return min(uniforms.maxWorkgroups, (count + 255u) / 256u);
}

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    let count = activeCount();
    let numWorkgroups = activeWorkgroups(count);
    if (wg_id.x >= numWorkgroups) {
        return;
    }

    let elementsPerWorkgroup = (count + numWorkgroups - 1u) / numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, count);

    var idx = startIdx + local_id.x;
    while (idx < endIdx) {
        depthsOut[idx] = depthsIn[idx];
        indicesOut[idx] = indicesIn[idx];
        idx += 256u;
    }
}
`,be=`
// Radix4 Sort - Histogram Pass
// =============================
// Part 1 of 3-stage 4-bit radix sort (histogram -> scan -> scatter)
//
// Purpose: Count occurrences of each 4-bit digit (0-15) within each workgroup's
// portion of the data. Uses 16-bin shared memory histogram (vs 256 for 8-bit).
//
// Algorithm:
// 1. Each workgroup processes a contiguous chunk of elements
// 2. Threads collaboratively count digits using 16 shared memory atomics
// 3. Final histogram is written to global memory (16 counts per workgroup)

struct Uniforms {
    count: u32,
    shift: u32,
    numWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depths: array<u32>;
@group(0) @binding(1) var<storage, read_write> histograms: array<u32>;  // 16 * numWorkgroups
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

var<workgroup> localHistogram: array<atomic<u32>, 16>;

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    // Initialize local histogram (only first 16 threads)
    if (local_id.x < 16u) {
        atomicStore(&localHistogram[local_id.x], 0u);
    }
    workgroupBarrier();

    // Each thread processes multiple elements
    let elementsPerWorkgroup = (uniforms.count + uniforms.numWorkgroups - 1u) / uniforms.numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, uniforms.count);

    var idx = startIdx + local_id.x;
    while (idx < endIdx) {
        let depth = depths[idx];
        let digit = (depth >> uniforms.shift) & 0xFu;
        atomicAdd(&localHistogram[digit], 1u);
        idx += 256u;
    }

    workgroupBarrier();

    // Write local histogram to global memory (only first 16 threads)
    if (local_id.x < 16u) {
        histograms[wg_id.x * 16u + local_id.x] = atomicLoad(&localHistogram[local_id.x]);
    }
}
`,ve=`
// Radix4 Sort - Prefix Sum (Scan) Pass
// ======================================
// Part 2 of 3-stage 4-bit radix sort (histogram -> scan -> scatter)
//
// Purpose: Compute global write offsets for each of 16 digits by performing
// prefix sum across all workgroup histograms.
//
// Algorithm:
// 1. Each of 16 threads sums its digit's count across all workgroups
// 2. Blelloch parallel exclusive prefix sum across 16 digits (4 up-sweep + 4 down-sweep)
// 3. Add global offsets back to per-workgroup histograms

struct Uniforms {
    numWorkgroups: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<storage, read_write> histograms: array<u32>;  // 16 * numWorkgroups
@group(0) @binding(1) var<storage, read_write> globalOffsets: array<u32>;  // 16 digit offsets
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

var<workgroup> temp: array<u32, 16>;

@compute
@workgroup_size(16)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>
) {
    let digit = local_id.x;

    // Sum this digit's count across all workgroups
    var digitTotal = 0u;
    for (var wg = 0u; wg < uniforms.numWorkgroups; wg++) {
        let count = histograms[wg * 16u + digit];
        histograms[wg * 16u + digit] = digitTotal;
        digitTotal += count;
    }

    // Store digit total in shared memory
    temp[digit] = digitTotal;
    workgroupBarrier();

    // Parallel prefix sum across 16 digits (Blelloch scan)
    // Up-sweep (4 steps for 16 elements)
    for (var stride = 1u; stride < 16u; stride *= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 16u) {
            temp[idx] += temp[idx - stride];
        }
        workgroupBarrier();
    }

    // Clear last element for exclusive scan
    if (digit == 15u) {
        temp[15u] = 0u;
    }
    workgroupBarrier();

    // Down-sweep (4 steps)
    for (var stride = 8u; stride > 0u; stride /= 2u) {
        let idx = (digit + 1u) * stride * 2u - 1u;
        if (idx < 16u) {
            let t = temp[idx - stride];
            temp[idx - stride] = temp[idx];
            temp[idx] += t;
        }
        workgroupBarrier();
    }

    // Write global offset for this digit
    globalOffsets[digit] = temp[digit];

    // Update histograms with global offsets
    for (var wg = 0u; wg < uniforms.numWorkgroups; wg++) {
        histograms[wg * 16u + digit] += temp[digit];
    }
}
`,Be=`
// Radix4 Sort - Stable Scatter Pass
// ===================================
// Part 3 of 3-stage 4-bit radix sort (histogram -> scan -> scatter)
//
// Purpose: Move each element to its sorted destination using 4-bit digits (16 bins).
// Uses countBefore for stability (same proven approach as 8-bit scatter).
//
// Algorithm:
// 1. Load pre-computed offsets (16 per workgroup) into shared memory
// 2. For each batch of 256 elements:
//    a. Load elements, compute 4-bit digit, store in shared memory
//    b. Each thread counts same-digit predecessors (countBefore)
//    c. destIdx = baseOffset[digit] + countBefore
//    d. Write to output, update baseOffsets per batch

struct Uniforms {
    count: u32,
    shift: u32,
    numWorkgroups: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<storage, read_write> histograms: array<u32>;  // Pre-computed offsets
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

var<workgroup> localOffsets: array<u32, 16>;        // Running base offset per digit
var<workgroup> localDigits: array<u32, 256>;        // Digit per thread in current batch
var<workgroup> digitCounts: array<atomic<u32>, 16>; // Per-digit count in current batch

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) wg_id: vec3<u32>
) {
    let tid = local_id.x;

    // Load workgroup's base offsets into shared memory (only first 16 threads)
    if (tid < 16u) {
        localOffsets[tid] = histograms[wg_id.x * 16u + tid];
    }
    workgroupBarrier();

    // Each workgroup processes a contiguous chunk
    let elementsPerWorkgroup = (uniforms.count + uniforms.numWorkgroups - 1u) / uniforms.numWorkgroups;
    let startIdx = wg_id.x * elementsPerWorkgroup;
    let endIdx = min(startIdx + elementsPerWorkgroup, uniforms.count);

    // Process in batches of 256
    var batchStart = startIdx;
    while (batchStart < endIdx) {
        let batchEnd = min(batchStart + 256u, endIdx);
        let batchSize = batchEnd - batchStart;
        let idx = batchStart + tid;
        let inBounds = tid < batchSize;

        // Reset digit counts (only first 16 threads)
        if (tid < 16u) {
            atomicStore(&digitCounts[tid], 0u);
        }
        workgroupBarrier();

        // Step 1: Load element, compute digit, store in shared memory
        var depth = 0u;
        var origIdx = 0u;
        var digit = 0u;

        if (inBounds) {
            depth = depthsIn[idx];
            origIdx = indicesIn[idx];
            digit = (depth >> uniforms.shift) & 0xFu;
            atomicAdd(&digitCounts[digit], 1u);
        }
        // Use 16 as sentinel for out-of-bounds threads (no valid digit is 16)
        localDigits[tid] = select(16u, digit, inBounds);
        workgroupBarrier();

        // Step 2: Compute stable destination using countBefore
        if (inBounds) {
            var countBefore = 0u;
            for (var t = 0u; t < tid; t++) {
                if (localDigits[t] == digit) {
                    countBefore++;
                }
            }
            let destIdx = localOffsets[digit] + countBefore;
            depthsOut[destIdx] = depth;
            indicesOut[destIdx] = origIdx;
        }
        workgroupBarrier();

        // Step 3: Update base offsets for next batch (only first 16 threads)
        if (tid < 16u) {
            localOffsets[tid] += atomicLoad(&digitCounts[tid]);
        }
        workgroupBarrier();

        batchStart += 256u;
    }
}
`,we=`
// Bitonic Sort for Gaussian depth ordering
// Based on https://en.wikipedia.org/wiki/Bitonic_sorter

struct SortUniforms {
    j: u32,
    k: u32,
    count: u32,
    _pad: u32,
};

@group(0) @binding(0) var<storage, read_write> indices: array<u32>;
@group(0) @binding(1) var<storage, read_write> depths: array<u32>;  // Quantized depths for faster integer comparison
@group(0) @binding(2) var<uniform> uniforms: SortUniforms;

// Use 2D dispatch to handle >16M elements
@compute
@workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // 2D global_id: x varies fastest, then y
    let i = global_id.x + global_id.y * 65535u * 256u;
    if (i >= uniforms.count) {
        return;
    }

    let j = uniforms.j;
    let k = uniforms.k;

    // XOR partner index
    let i_xor_j = i ^ j;

    // Only process if we're the lower index of the pair
    if (i_xor_j <= i) {
        return;
    }

    // Bounds check for partner
    if (i_xor_j >= uniforms.count) {
        return;
    }

    // Determine sort direction based on k
    let ascending = (i & k) == 0;

    // Compare and swap
    let depth_i = depths[i];
    let depth_partner = depths[i_xor_j];

    let should_swap = select(
        (depth_i < depth_partner),  // descending: swap if i < partner
        (depth_i > depth_partner),  // ascending: swap if i > partner
        ascending
    );

    if (should_swap) {
        // Swap depths
        depths[i] = depth_partner;
        depths[i_xor_j] = depth_i;

        // Swap indices
        let idx_i = indices[i];
        let idx_partner = indices[i_xor_j];
        indices[i] = idx_partner;
        indices[i_xor_j] = idx_i;
    }
}
`,ye=`
// Counting Sort - Histogram Pass
// ===============================
// Part 1 of 3-stage counting sort (histogram -> prefix sum -> scatter)
//
// Purpose: Count occurrences of each 16-bit bucket (top 16 bits of depth).
// Uses 65536 global atomic counters -- no per-workgroup histograms needed.
//
// Performance: O(n) with high parallelism, single pass over data

struct Uniforms {
    count: u32,
    shift: u32,      // Bit shift (16 for top 16 bits)
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<storage, read> depths: array<u32>;
@group(0) @binding(1) var<storage, read_write> histogram: array<atomic<u32>>;  // 65536 entries
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@compute
@workgroup_size(256)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(num_workgroups) num_wgs: vec3<u32>,
) {
    let totalThreads = num_wgs.x * num_wgs.y * 256u;
    let threadIdx = global_id.y * (num_wgs.x * 256u) + global_id.x;

    var idx = threadIdx;
    while (idx < uniforms.count) {
        let depth = depths[idx];
        let bucket = (depth >> uniforms.shift) & 0xFFFFu;
        atomicAdd(&histogram[bucket], 1u);
        idx += totalThreads;
    }
}
`,Pe=`
// Counting Sort - Prefix Sum Pass
// =================================
// Part 2 of 3-stage counting sort (histogram -> prefix sum -> scatter)
//
// Purpose: Convert 65536 bucket counts into exclusive prefix sums (write offsets).
// Single workgroup of 256 threads, each processes 256 sequential buckets.
//
// Algorithm:
// Phase 1: Each thread sequentially prefix-sums its 256 buckets, stores thread total
// Phase 2: Blelloch parallel scan across 256 partial sums
// Phase 3: Each thread adds its global offset back to its 256 entries
//
// After this pass, histogram[bucket] = starting index for that bucket in sorted output.

@group(0) @binding(0) var<storage, read_write> histogram: array<u32>;  // 65536 entries (in-place)

var<workgroup> threadTotals: array<u32, 256>;
var<workgroup> temp: array<u32, 256>;

@compute
@workgroup_size(256)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
) {
    let tid = local_id.x;
    let bucketStart = tid * 256u;
    let bucketEnd = bucketStart + 256u;

    // Phase 1: Sequential prefix sum within this thread's 256 buckets
    var runningSum = 0u;
    for (var b = bucketStart; b < bucketEnd; b++) {
        let count = histogram[b];
        histogram[b] = runningSum;
        runningSum += count;
    }

    // Store thread total for parallel scan
    threadTotals[tid] = runningSum;
    temp[tid] = runningSum;
    workgroupBarrier();

    // Phase 2: Blelloch parallel exclusive prefix sum across 256 thread totals
    // Up-sweep (reduce)
    for (var stride = 1u; stride < 256u; stride *= 2u) {
        let idx = (tid + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            temp[idx] += temp[idx - stride];
        }
        workgroupBarrier();
    }

    // Clear last element for exclusive scan
    if (tid == 255u) {
        temp[255u] = 0u;
    }
    workgroupBarrier();

    // Down-sweep
    for (var stride = 128u; stride > 0u; stride /= 2u) {
        let idx = (tid + 1u) * stride * 2u - 1u;
        if (idx < 256u) {
            let t = temp[idx - stride];
            temp[idx - stride] = temp[idx];
            temp[idx] += t;
        }
        workgroupBarrier();
    }

    // Phase 3: Add global offset to each thread's local prefix sums
    let globalOffset = temp[tid];
    for (var b = bucketStart; b < bucketEnd; b++) {
        histogram[b] += globalOffset;
    }
}
`,_e=`
// Counting Sort - Scatter Pass
// =============================
// Part 3 of 3-stage counting sort (histogram -> prefix sum -> scatter)
//
// Purpose: Place each element at its sorted position using atomic offsets.
// Each thread reads its depth, determines bucket, atomicAdds the offset to get
// a unique write position, and writes depth+index to output buffers.
//
// Note: Unstable within buckets (elements with same top-16-bit depth may be
// reordered). This is acceptable for Gaussian splatting where sub-bucket
// ordering has negligible visual impact.

struct Uniforms {
    count: u32,
    shift: u32,
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<storage, read> depthsIn: array<u32>;
@group(0) @binding(1) var<storage, read> indicesIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> depthsOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> indicesOut: array<u32>;
@group(0) @binding(4) var<storage, read_write> offsets: array<atomic<u32>>;  // 65536 entries
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

@compute
@workgroup_size(256)
fn main(
    @builtin(global_invocation_id) global_id: vec3<u32>,
    @builtin(num_workgroups) num_wgs: vec3<u32>,
) {
    let totalThreads = num_wgs.x * num_wgs.y * 256u;
    let threadIdx = global_id.y * (num_wgs.x * 256u) + global_id.x;

    var idx = threadIdx;
    while (idx < uniforms.count) {
        let depth = depthsIn[idx];
        let index = indicesIn[idx];
        let bucket = (depth >> uniforms.shift) & 0xFFFFu;
        let pos = atomicAdd(&offsets[bucket], 1u);
        depthsOut[pos] = depth;
        indicesOut[pos] = index;
        idx += totalThreads;
    }
}
`;class w{constructor(e,t){this.configured=!1,this.count=0,this.numWorkgroups=0,this.buffers=null,this.depthAlt=null,this.indexAlt=null,this.histogramBuffer=null,this.globalOffsetsBuffer=null,this.histogramBindGroups=[],this.scanBindGroups=[],this.scatterBindGroups=[],this.uniformBuffers=[],this.indirectCountBuffer=null,this.indirectMaxCount=0,this.indirectHistogramBindGroups=[],this.indirectScanBindGroups=[],this.indirectScatterBindGroups=[],this.indirectCopyBackBindGroup=null,this.indirectUniformBuffers=[],this.device=e,this.passes=t?.passes??4,t?.startShift!==void 0?this.startShift=t.startShift:this.startShift=(4-this.passes)*8;const r=this.passes*8;this.name=`Radix ${r}-bit`,this.capabilities={fixedCount:!0,indirectCount:!0,stable:!0,precisionBits:r,keyFormat:"u32-depth",indexFormat:"u32-index",requiresPowerOfTwo:!1};const s=e.createShaderModule({code:fe});this.histogramPipeline=e.createComputePipeline({layout:"auto",compute:{module:s,entryPoint:"main"}});const o=e.createShaderModule({code:ce});this.scanPipeline=e.createComputePipeline({layout:"auto",compute:{module:o,entryPoint:"main"}});const a=e.createShaderModule({code:pe});this.scatterPipeline=e.createComputePipeline({layout:"auto",compute:{module:a,entryPoint:"main"}});const u=e.createShaderModule({code:he});this.indirectHistogramPipeline=e.createComputePipeline({layout:"auto",compute:{module:u,entryPoint:"main"}});const n=e.createShaderModule({code:ge});this.indirectScanPipeline=e.createComputePipeline({layout:"auto",compute:{module:n,entryPoint:"main"}});const l=e.createShaderModule({code:me});this.indirectScatterPipeline=e.createComputePipeline({layout:"auto",compute:{module:l,entryPoint:"main"}});const f=e.createShaderModule({code:xe});this.indirectCopyBackPipeline=e.createComputePipeline({layout:"auto",compute:{module:f,entryPoint:"main"}})}configure(e){if(this.destroyInternalBuffers(),e.count===0){this.configured=!1;return}this.count=e.count,this.buffers=e.buffers,this.numWorkgroups=Math.min(1024,Math.ceil(e.count/256)),this.depthAlt=this.device.createBuffer({size:e.count*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),this.indexAlt=this.device.createBuffer({size:e.count*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),this.histogramBuffer=this.device.createBuffer({size:256*this.numWorkgroups*4,usage:GPUBufferUsage.STORAGE}),this.globalOffsetsBuffer=this.device.createBuffer({size:256*4,usage:GPUBufferUsage.STORAGE}),this.createBindGroups(),this.configured=!0}createBindGroups(){const{depth:e,index:t}=this.buffers;this.histogramBindGroups=[],this.scanBindGroups=[],this.scatterBindGroups=[];for(let r=0;r<this.passes;r++){const s=this.startShift+r*8,o=r%2!==0,a=o?this.depthAlt:e,u=o?this.indexAlt:t,n=o?e:this.depthAlt,l=o?t:this.indexAlt,f=new Uint32Array([this.count,s,this.numWorkgroups,0]),d=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(d,0,f),this.uniformBuffers.push(d),this.histogramBindGroups.push(this.device.createBindGroup({layout:this.histogramPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:{buffer:this.histogramBuffer}},{binding:2,resource:{buffer:d}}]}));const p=new Uint32Array([this.numWorkgroups,0,0,0]),c=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(c,0,p),this.uniformBuffers.push(c),this.scanBindGroups.push(this.device.createBindGroup({layout:this.scanPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.histogramBuffer}},{binding:1,resource:{buffer:this.globalOffsetsBuffer}},{binding:2,resource:{buffer:c}}]})),this.scatterBindGroups.push(this.device.createBindGroup({layout:this.scatterPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:{buffer:u}},{binding:2,resource:{buffer:n}},{binding:3,resource:{buffer:l}},{binding:4,resource:{buffer:this.histogramBuffer}},{binding:5,resource:{buffer:d}}]}))}}executeFixed(e){if(this.configured){for(let t=0;t<this.passes;t++){{const r=e.beginComputePass();r.setPipeline(this.histogramPipeline),r.setBindGroup(0,this.histogramBindGroups[t]),r.dispatchWorkgroups(this.numWorkgroups),r.end()}{const r=e.beginComputePass();r.setPipeline(this.scanPipeline),r.setBindGroup(0,this.scanBindGroups[t]),r.dispatchWorkgroups(1),r.end()}{const r=e.beginComputePass();r.setPipeline(this.scatterPipeline),r.setBindGroup(0,this.scatterBindGroups[t]),r.dispatchWorkgroups(this.numWorkgroups),r.end()}}this.passes%2!==0&&(e.copyBufferToBuffer(this.depthAlt,0,this.buffers.depth,0,this.count*4),e.copyBufferToBuffer(this.indexAlt,0,this.buffers.index,0,this.count*4))}}createIndirectBindGroups(e,t){this.destroyIndirectBuffers(),this.indirectCountBuffer=e,this.indirectMaxCount=t;const{depth:r,index:s}=this.buffers;for(let o=0;o<this.passes;o++){const a=this.startShift+o*8,u=o%2!==0,n=u?this.depthAlt:r,l=u?this.indexAlt:s,f=u?r:this.depthAlt,d=u?s:this.indexAlt,p=new Uint32Array([t,a,this.numWorkgroups,0]),c=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(c,0,p),this.indirectUniformBuffers.push(c),this.indirectHistogramBindGroups.push(this.device.createBindGroup({layout:this.indirectHistogramPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:n}},{binding:1,resource:{buffer:this.histogramBuffer}},{binding:2,resource:{buffer:c}},{binding:3,resource:{buffer:e}}]})),this.indirectScanBindGroups.push(this.device.createBindGroup({layout:this.indirectScanPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.histogramBuffer}},{binding:1,resource:{buffer:this.globalOffsetsBuffer}},{binding:2,resource:{buffer:c}},{binding:3,resource:{buffer:e}}]})),this.indirectScatterBindGroups.push(this.device.createBindGroup({layout:this.indirectScatterPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:n}},{binding:1,resource:{buffer:l}},{binding:2,resource:{buffer:f}},{binding:3,resource:{buffer:d}},{binding:4,resource:{buffer:this.histogramBuffer}},{binding:5,resource:{buffer:c}},{binding:6,resource:{buffer:e}}]}))}this.passes%2!==0&&(this.indirectCopyBackBindGroup=this.device.createBindGroup({layout:this.indirectCopyBackPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.depthAlt}},{binding:1,resource:{buffer:this.indexAlt}},{binding:2,resource:{buffer:r}},{binding:3,resource:{buffer:s}},{binding:4,resource:{buffer:this.indirectUniformBuffers[0]}},{binding:5,resource:{buffer:e}}]}))}executeIndirect(e,t){if(this.configured){if(t.countOffset!==void 0&&t.countOffset!==0)throw new $(this.name,"non-zero indirect count offsets");if(t.maxCount>this.count)throw new Error(`${this.name} indirect maxCount ${t.maxCount} exceeds configured capacity ${this.count}`);(this.indirectCountBuffer!==t.countBuffer||this.indirectMaxCount!==t.maxCount)&&this.createIndirectBindGroups(t.countBuffer,t.maxCount);for(let r=0;r<this.passes;r++){{const s=e.beginComputePass();s.setPipeline(this.indirectHistogramPipeline),s.setBindGroup(0,this.indirectHistogramBindGroups[r]),s.dispatchWorkgroups(this.numWorkgroups),s.end()}{const s=e.beginComputePass();s.setPipeline(this.indirectScanPipeline),s.setBindGroup(0,this.indirectScanBindGroups[r]),s.dispatchWorkgroups(1),s.end()}{const s=e.beginComputePass();s.setPipeline(this.indirectScatterPipeline),s.setBindGroup(0,this.indirectScatterBindGroups[r]),s.dispatchWorkgroups(this.numWorkgroups),s.end()}}if(this.passes%2!==0){const r=e.beginComputePass();r.setPipeline(this.indirectCopyBackPipeline),r.setBindGroup(0,this.indirectCopyBackBindGroup),r.dispatchWorkgroups(this.numWorkgroups),r.end()}}}execute(e){this.executeFixed(e)}destroyInternalBuffers(){this.destroyIndirectBuffers(),this.depthAlt?.destroy(),this.indexAlt?.destroy(),this.histogramBuffer?.destroy(),this.globalOffsetsBuffer?.destroy();for(const e of this.uniformBuffers)e.destroy();this.depthAlt=null,this.indexAlt=null,this.histogramBuffer=null,this.globalOffsetsBuffer=null,this.uniformBuffers=[],this.histogramBindGroups=[],this.scanBindGroups=[],this.scatterBindGroups=[]}destroyIndirectBuffers(){for(const e of this.indirectUniformBuffers)e.destroy();this.indirectUniformBuffers=[],this.indirectHistogramBindGroups=[],this.indirectScanBindGroups=[],this.indirectScatterBindGroups=[],this.indirectCopyBackBindGroup=null,this.indirectCountBuffer=null,this.indirectMaxCount=0}destroy(){this.destroyInternalBuffers(),this.configured=!1}}class G{constructor(e,t){this.configured=!1,this.count=0,this.numWorkgroups=0,this.buffers=null,this.depthAlt=null,this.indexAlt=null,this.histogramBuffer=null,this.globalOffsetsBuffer=null,this.histogramBindGroups=[],this.scanBindGroups=[],this.scatterBindGroups=[],this.uniformBuffers=[],this.device=e,this.passes=t?.passes??8,t?.startShift!==void 0?this.startShift=t.startShift:this.startShift=(8-this.passes)*4;const r=this.passes*4;this.name=`Radix4 ${r}-bit`,this.capabilities={fixedCount:!0,indirectCount:!1,stable:!0,precisionBits:r,keyFormat:"u32-depth",indexFormat:"u32-index",requiresPowerOfTwo:!1};const s=e.createShaderModule({code:be});this.histogramPipeline=e.createComputePipeline({layout:"auto",compute:{module:s,entryPoint:"main"}});const o=e.createShaderModule({code:ve});this.scanPipeline=e.createComputePipeline({layout:"auto",compute:{module:o,entryPoint:"main"}});const a=e.createShaderModule({code:Be});this.scatterPipeline=e.createComputePipeline({layout:"auto",compute:{module:a,entryPoint:"main"}})}configure(e){if(this.destroyInternalBuffers(),e.count===0){this.configured=!1;return}this.count=e.count,this.buffers=e.buffers,this.numWorkgroups=Math.min(1024,Math.ceil(e.count/256)),this.depthAlt=this.device.createBuffer({size:e.count*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),this.indexAlt=this.device.createBuffer({size:e.count*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),this.histogramBuffer=this.device.createBuffer({size:16*this.numWorkgroups*4,usage:GPUBufferUsage.STORAGE}),this.globalOffsetsBuffer=this.device.createBuffer({size:64,usage:GPUBufferUsage.STORAGE}),this.createBindGroups(),this.configured=!0}createBindGroups(){const{depth:e,index:t}=this.buffers;this.histogramBindGroups=[],this.scanBindGroups=[],this.scatterBindGroups=[];for(let r=0;r<this.passes;r++){const s=this.startShift+r*4,o=r%2!==0,a=o?this.depthAlt:e,u=o?this.indexAlt:t,n=o?e:this.depthAlt,l=o?t:this.indexAlt,f=new Uint32Array([this.count,s,this.numWorkgroups,0]),d=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(d,0,f),this.uniformBuffers.push(d),this.histogramBindGroups.push(this.device.createBindGroup({layout:this.histogramPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:{buffer:this.histogramBuffer}},{binding:2,resource:{buffer:d}}]}));const p=new Uint32Array([this.numWorkgroups,0,0,0]),c=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(c,0,p),this.uniformBuffers.push(c),this.scanBindGroups.push(this.device.createBindGroup({layout:this.scanPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.histogramBuffer}},{binding:1,resource:{buffer:this.globalOffsetsBuffer}},{binding:2,resource:{buffer:c}}]})),this.scatterBindGroups.push(this.device.createBindGroup({layout:this.scatterPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:{buffer:u}},{binding:2,resource:{buffer:n}},{binding:3,resource:{buffer:l}},{binding:4,resource:{buffer:this.histogramBuffer}},{binding:5,resource:{buffer:d}}]}))}}executeFixed(e){if(this.configured){for(let t=0;t<this.passes;t++){{const r=e.beginComputePass();r.setPipeline(this.histogramPipeline),r.setBindGroup(0,this.histogramBindGroups[t]),r.dispatchWorkgroups(this.numWorkgroups),r.end()}{const r=e.beginComputePass();r.setPipeline(this.scanPipeline),r.setBindGroup(0,this.scanBindGroups[t]),r.dispatchWorkgroups(1),r.end()}{const r=e.beginComputePass();r.setPipeline(this.scatterPipeline),r.setBindGroup(0,this.scatterBindGroups[t]),r.dispatchWorkgroups(this.numWorkgroups),r.end()}}this.passes%2!==0&&(e.copyBufferToBuffer(this.depthAlt,0,this.buffers.depth,0,this.count*4),e.copyBufferToBuffer(this.indexAlt,0,this.buffers.index,0,this.count*4))}}executeIndirect(e,t){O(this.name)}execute(e){this.executeFixed(e)}destroyInternalBuffers(){this.depthAlt?.destroy(),this.indexAlt?.destroy(),this.histogramBuffer?.destroy(),this.globalOffsetsBuffer?.destroy();for(const e of this.uniformBuffers)e.destroy();this.depthAlt=null,this.indexAlt=null,this.histogramBuffer=null,this.globalOffsetsBuffer=null,this.uniformBuffers=[],this.histogramBindGroups=[],this.scanBindGroups=[],this.scatterBindGroups=[]}destroy(){this.destroyInternalBuffers(),this.configured=!1}}class Se{constructor(e){this.name="Bitonic",this.capabilities=ae("bitonic"),this.configured=!1,this.realCount=0,this.sortCount=0,this.uniformBuffers=[],this.bindGroups=[],this.paddedDepth=null,this.paddedIndex=null,this.primaryDepth=null,this.primaryIndex=null,this.needsPadding=!1,this.device=e;const t=e.createShaderModule({code:we});this.pipeline=e.createComputePipeline({layout:"auto",compute:{module:t,entryPoint:"main"}})}configure(e){if(this.destroyInternalBuffers(),e.count===0){this.configured=!1;return}this.realCount=e.count,this.sortCount=ne(e.count),this.needsPadding=this.sortCount>this.realCount;const{depth:t,index:r}=e.buffers;this.primaryDepth=t,this.primaryIndex=r;let s,o;if(this.needsPadding){const a=this.sortCount*4;this.paddedDepth=this.device.createBuffer({size:a,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST,mappedAtCreation:!0}),new Uint32Array(this.paddedDepth.getMappedRange()).fill(4294967295),this.paddedDepth.unmap(),this.paddedIndex=this.device.createBuffer({size:a,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST}),s=this.paddedDepth,o=this.paddedIndex}else s=t,o=r;for(let a=2;a<=this.sortCount;a*=2)for(let u=a/2;u>0;u=Math.floor(u/2)){const n=new Uint32Array([u,a,this.sortCount,0]),l=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(l,0,n),this.uniformBuffers.push(l);const f=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:o}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:l}}]});this.bindGroups.push(f)}this.configured=!0}executeFixed(e){if(!this.configured)return;const t=this.realCount*4;this.needsPadding&&this.paddedDepth&&this.paddedIndex&&this.primaryDepth&&this.primaryIndex&&(e.copyBufferToBuffer(this.primaryDepth,0,this.paddedDepth,0,t),e.copyBufferToBuffer(this.primaryIndex,0,this.paddedIndex,0,t));const[r,s]=R(this.sortCount,256);for(const o of this.bindGroups){const a=e.beginComputePass();a.setPipeline(this.pipeline),a.setBindGroup(0,o),a.dispatchWorkgroups(r,s),a.end()}this.needsPadding&&this.paddedDepth&&this.paddedIndex&&this.primaryDepth&&this.primaryIndex&&(e.copyBufferToBuffer(this.paddedDepth,0,this.primaryDepth,0,t),e.copyBufferToBuffer(this.paddedIndex,0,this.primaryIndex,0,t))}executeIndirect(e,t){O(this.name)}execute(e){this.executeFixed(e)}destroyInternalBuffers(){for(const e of this.uniformBuffers)e.destroy();this.uniformBuffers=[],this.bindGroups=[],this.paddedDepth?.destroy(),this.paddedIndex?.destroy(),this.paddedDepth=null,this.paddedIndex=null,this.primaryDepth=null,this.primaryIndex=null}destroy(){this.destroyInternalBuffers(),this.configured=!1}}const T=65536;class F{constructor(e,t){this.configured=!1,this.count=0,this.buffers=null,this.histogramBuffers=[],this.offsetsBuffers=[],this.uniformBuffers=[],this.depthAlt=null,this.indexAlt=null,this.histogramBindGroups=[],this.prefixSumBindGroups=[],this.scatterBindGroups=[],this.device=e,this.passes=t?.passes??1;const r=this.passes*16;this.name=`Counting ${r}-bit`,this.capabilities={fixedCount:!0,indirectCount:!1,stable:!1,precisionBits:r,keyFormat:"u32-depth",indexFormat:"u32-index",requiresPowerOfTwo:!1};const s=e.createShaderModule({code:ye});this.histogramPipeline=e.createComputePipeline({layout:"auto",compute:{module:s,entryPoint:"main"}});const o=e.createShaderModule({code:Pe});this.prefixSumPipeline=e.createComputePipeline({layout:"auto",compute:{module:o,entryPoint:"main"}});const a=e.createShaderModule({code:_e});this.scatterPipeline=e.createComputePipeline({layout:"auto",compute:{module:a,entryPoint:"main"}})}configure(e){if(this.destroyInternalBuffers(),e.count===0){this.configured=!1;return}this.count=e.count,this.buffers=e.buffers,this.passes===2&&(this.depthAlt=this.device.createBuffer({size:e.count*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.indexAlt=this.device.createBuffer({size:e.count*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}));for(let t=0;t<this.passes;t++){const r=this.passes===1?16:t*16,s=this.device.createBuffer({size:T*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});this.histogramBuffers.push(s);const o=this.device.createBuffer({size:T*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});this.offsetsBuffers.push(o);const a=new Uint32Array([e.count,r,0,0]),u=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(u,0,a),this.uniformBuffers.push(u);let n,l,f,d;this.passes===1?(n=e.buffers.depth,l=e.buffers.index,this.depthAlt||(this.depthAlt=this.device.createBuffer({size:e.count*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),this.indexAlt=this.device.createBuffer({size:e.count*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC})),f=this.depthAlt,d=this.indexAlt):t%2===0?(n=e.buffers.depth,l=e.buffers.index,f=this.depthAlt,d=this.indexAlt):(n=this.depthAlt,l=this.indexAlt,f=e.buffers.depth,d=e.buffers.index),this.histogramBindGroups.push(this.device.createBindGroup({layout:this.histogramPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:n}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:u}}]})),this.prefixSumBindGroups.push(this.device.createBindGroup({layout:this.prefixSumPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:s}}]})),this.scatterBindGroups.push(this.device.createBindGroup({layout:this.scatterPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:n}},{binding:1,resource:{buffer:l}},{binding:2,resource:{buffer:f}},{binding:3,resource:{buffer:d}},{binding:4,resource:{buffer:o}},{binding:5,resource:{buffer:u}}]}))}this.configured=!0}executeFixed(e){if(!this.configured)return;const[t,r]=R(this.count,256);for(let s=0;s<this.passes;s++){e.clearBuffer(this.histogramBuffers[s]);{const o=e.beginComputePass();o.setPipeline(this.histogramPipeline),o.setBindGroup(0,this.histogramBindGroups[s]),o.dispatchWorkgroups(t,r),o.end()}{const o=e.beginComputePass();o.setPipeline(this.prefixSumPipeline),o.setBindGroup(0,this.prefixSumBindGroups[s]),o.dispatchWorkgroups(1),o.end()}e.copyBufferToBuffer(this.histogramBuffers[s],0,this.offsetsBuffers[s],0,T*4);{const o=e.beginComputePass();o.setPipeline(this.scatterPipeline),o.setBindGroup(0,this.scatterBindGroups[s]),o.dispatchWorkgroups(t,r),o.end()}}this.passes===1&&(e.copyBufferToBuffer(this.depthAlt,0,this.buffers.depth,0,this.count*4),e.copyBufferToBuffer(this.indexAlt,0,this.buffers.index,0,this.count*4))}executeIndirect(e,t){O(this.name)}execute(e){this.executeFixed(e)}destroyInternalBuffers(){for(const e of this.histogramBuffers)e.destroy();for(const e of this.offsetsBuffers)e.destroy();for(const e of this.uniformBuffers)e.destroy();this.depthAlt?.destroy(),this.indexAlt?.destroy(),this.histogramBuffers=[],this.offsetsBuffers=[],this.uniformBuffers=[],this.depthAlt=null,this.indexAlt=null,this.histogramBindGroups=[],this.prefixSumBindGroups=[],this.scatterBindGroups=[]}destroy(){this.destroyInternalBuffers(),this.configured=!1}}function Ce(i,e){switch(i){case"radix":return new w(e);case"radix-16bit":return new w(e,{passes:2,startShift:16});case"radix-8bit":return new w(e,{passes:1,startShift:24});case"radix4":return new G(e);case"radix4-16bit":return new G(e,{passes:4,startShift:16});case"radix4-8bit":return new G(e,{passes:2,startShift:24});case"bitonic":return new Se(e);case"counting":return new F(e);case"counting-32bit":return new F(e,{passes:2})}}const Ge=`
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
`,Te={rgb:0,depth:1,rgbd:2};class A{constructor(e,t){this.configured=!1,this.count=0,this.pipeline=null,this.bindGroup=null,this.currentFormat=null,this.currentDepthFormat=null,this.device=e,this.blend=t?.blend??"front-to-back",this.reverseSort=this.blend==="back-to-front",this.name=this.blend==="front-to-back"?"Billboard FTB":"Billboard BTF",this.shaderModule=e.createShaderModule({code:Ge}),this.uniformBuffer=e.createBuffer({size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}configure(e){this.count=e.count;const t=e.format!==this.currentFormat,r=e.depthFormat!==this.currentDepthFormat;(t||r||!this.pipeline)&&(this.currentFormat=e.format,this.currentDepthFormat=e.depthFormat??null,this.createPipeline(e.format,e.depthFormat)),this.createBindGroup(e.buffers),this.configured=!0}setUniforms(e){const t=new Float32Array(28),r=new Uint32Array(t.buffer);e.projMatrix?t.set(e.projMatrix,0):(t[0]=1,t[5]=1,t[10]=1,t[15]=1),t[16]=e.viewportWidth,t[17]=e.viewportHeight,t[18]=e.nearPlane,t[19]=e.farPlane,r[20]=e.antialiasing??!0?1:0,r[21]=Te[e.renderMode??"rgb"],r[22]=e.numGaussians,r[23]=this.reverseSort?1:0,r[24]=e.useDepthTest??!1?1:0,t[25]=e.alphaThreshold??1/255,this.device.queue.writeBuffer(this.uniformBuffer,0,t)}execute(e,t,r,s,o){if(!this.configured||!this.pipeline||!this.bindGroup)return;const u={colorAttachments:[{view:t,clearValue:s??{r:0,g:0,b:0,a:0},loadOp:o??"clear",storeOp:"store"}]};r&&this.currentDepthFormat&&(u.depthStencilAttachment={view:r,depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"});const n=e.beginRenderPass(u);n.setPipeline(this.pipeline),n.setBindGroup(0,this.bindGroup),n.draw(6*this.count),n.end()}destroy(){this.uniformBuffer.destroy(),this.pipeline=null,this.bindGroup=null,this.configured=!1}createPipeline(e,t){const r=this.getBlendState(),s={layout:"auto",vertex:{module:this.shaderModule,entryPoint:"vs_main"},fragment:{module:this.shaderModule,entryPoint:"fs_main",targets:[{format:e,blend:r}]},primitive:{topology:"triangle-list",cullMode:"none"}};t&&(s.depthStencil={format:t,depthWriteEnabled:!0,depthCompare:"less"}),this.pipeline=this.device.createRenderPipeline(s)}createBindGroup(e){this.pipeline&&(this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:{buffer:e.sortedIndices}},{binding:2,resource:{buffer:e.splatData}}]}))}getBlendState(){return this.blend==="front-to-back"?{color:{srcFactor:"one-minus-dst-alpha",dstFactor:"one",operation:"add"},alpha:{srcFactor:"one-minus-dst-alpha",dstFactor:"one",operation:"add"}}:{color:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"},alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"}}}}const De=`
struct ClearParams {
    keysSize: u32,
    offsetsSize: u32,
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<storage, read_write> isectKeys: array<u32>;
@group(0) @binding(1) var<storage, read_write> tileOffsets: array<u32>;
@group(0) @binding(2) var<uniform> params: ClearParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx < params.keysSize) {
        isectKeys[idx] = 0xFFFFFFFFu;
    }
    if (idx < params.offsetsSize) {
        tileOffsets[idx] = 0xFFFFFFFFu;
    }
}
`,Ue=`
struct SplatData {
    mean2d: vec2<f32>,
    depth: f32,
    radius: f32,
    conic: vec3<f32>,
    compensation: f32,
    color: vec4<f32>,
};

struct IntersectParams {
    numGaussians: u32,
    tileWidth: u32,
    tileHeight: u32,
    maxIsects: u32,
    farPlane: f32,
    tileSize: u32,
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<storage, read> splatData: array<SplatData>;
@group(0) @binding(1) var<storage, read_write> isectKeys: array<u32>;
@group(0) @binding(2) var<storage, read_write> isectVals: array<u32>;
@group(0) @binding(3) var<storage, read_write> atomicCounter: array<atomic<u32>>;
@group(0) @binding(4) var<uniform> params: IntersectParams;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.numGaussians) { return; }

    let splat = splatData[idx];
    if (splat.radius <= 0.0) { return; }

    let mean = splat.mean2d;
    let r = splat.radius;
    let ts = f32(params.tileSize);

    // Compute tile bounding box (clamped to grid)
    let rawMinX = i32(floor((mean.x - r) / ts));
    let rawMinY = i32(floor((mean.y - r) / ts));
    let rawMaxX = i32(ceil((mean.x + r) / ts));
    let rawMaxY = i32(ceil((mean.y + r) / ts));

    let minTileX = u32(max(0, rawMinX));
    let minTileY = u32(max(0, rawMinY));
    let maxTileX = u32(min(i32(params.tileWidth), rawMaxX));
    let maxTileY = u32(min(i32(params.tileHeight), rawMaxY));

    if (maxTileX <= minTileX || maxTileY <= minTileY) { return; }

    let tileCount = (maxTileX - minTileX) * (maxTileY - minTileY);

    // Quantize depth to 16 bits
    let depth16 = u32(clamp(splat.depth / params.farPlane, 0.0, 1.0) * 65535.0);

    // Atomic allocation — one atomicAdd per Gaussian
    let writePos = atomicAdd(&atomicCounter[0], tileCount);

    var pos = writePos;
    for (var ty = minTileY; ty < maxTileY; ty++) {
        for (var tx = minTileX; tx < maxTileX; tx++) {
            if (pos >= params.maxIsects) { return; }
            let tileId = ty * params.tileWidth + tx;
            isectKeys[pos] = (tileId << 16u) | (depth16 & 0xFFFFu);
            isectVals[pos] = idx;
            pos++;
        }
    }
}
`,ke=`
@group(0) @binding(0) var<storage, read> isectKeys: array<u32>;
@group(0) @binding(1) var<storage, read_write> tileOffsets: array<u32>;
@group(0) @binding(2) var<storage, read> counter: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    let totalIsects = counter[0];
    if (idx >= totalIsects) { return; }

    let key = isectKeys[idx];
    let tileId = key >> 16u;

    let isFirst = (idx == 0u) || ((isectKeys[idx - 1u] >> 16u) != tileId);
    if (isFirst) {
        tileOffsets[tileId] = idx;
    }
}
`,Ie=`
@group(0) @binding(0) var<storage, read_write> tileOffsets: array<u32>;
@group(0) @binding(1) var<storage, read> counter: array<u32>;
@group(0) @binding(2) var<uniform> params: vec4<u32>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) lidx: u32) {
    if (lidx != 0u) { return; }

    let numTiles = params.x;
    let totalIsects = counter[0];

    // Set end sentinel
    tileOffsets[numTiles] = totalIsects;

    // Backward propagation: empty tiles inherit next tile's start offset
    for (var i = i32(numTiles) - 1; i >= 0; i--) {
        if (tileOffsets[u32(i)] == 0xFFFFFFFFu) {
            tileOffsets[u32(i)] = tileOffsets[u32(i) + 1u];
        }
    }
}
`,Me=`
const TILE_SIZE = 16u;
const BATCH_SIZE = 256u;

const RENDER_MODE_RGB: u32 = 0u;
const RENDER_MODE_DEPTH: u32 = 1u;
const RENDER_MODE_RGBD: u32 = 2u;

struct SplatData {
    mean2d: vec2<f32>,
    depth: f32,
    radius: f32,
    conic: vec3<f32>,
    compensation: f32,
    color: vec4<f32>,
};

struct RasterUniforms {
    viewportWidth: u32,
    viewportHeight: u32,
    tileWidth: u32,
    tileHeight: u32,
    nearPlane: f32,
    farPlane: f32,
    antialiasing: u32,
    renderMode: u32,
    alphaThreshold: f32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var<uniform> uniforms: RasterUniforms;
@group(0) @binding(1) var<storage, read> splatData: array<SplatData>;
@group(0) @binding(2) var<storage, read> isectVals: array<u32>;
@group(0) @binding(3) var<storage, read> tileOffsets: array<u32>;
@group(0) @binding(4) var<storage, read_write> outputColor: array<vec4<f32>>;

var<workgroup> s_mean2d: array<vec2<f32>, BATCH_SIZE>;
var<workgroup> s_conic: array<vec4<f32>, BATCH_SIZE>;
var<workgroup> s_color: array<vec4<f32>, BATCH_SIZE>;

@compute @workgroup_size(16, 16)
fn main(
    @builtin(workgroup_id) wgid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(local_invocation_index) lidx: u32,
) {
    let tileX = wgid.x;
    let tileY = wgid.y;
    let tileId = tileY * uniforms.tileWidth + tileX;

    let pixelX = tileX * TILE_SIZE + lid.x;
    let pixelY = tileY * TILE_SIZE + lid.y;
    let px = f32(pixelX) + 0.5;
    let py = f32(pixelY) + 0.5;

    let inside = pixelX < uniforms.viewportWidth && pixelY < uniforms.viewportHeight;
    var done = !inside;

    // Tile's intersection range (CSR format)
    let rangeStart = tileOffsets[tileId];
    let rangeEnd = tileOffsets[tileId + 1u];
    let numInTile = rangeEnd - rangeStart;
    let numBatches = (numInTile + BATCH_SIZE - 1u) / BATCH_SIZE;

    // Accumulation state
    var T = 1.0f;
    var color = vec3<f32>(0.0, 0.0, 0.0);
    var accDepth = 0.0f;

    for (var b = 0u; b < numBatches; b++) {
        // Synchronize before loading new batch
        workgroupBarrier();

        // Collaborative load into shared memory
        let batchStart = rangeStart + b * BATCH_SIZE;
        let loadIdx = batchStart + lidx;
        if (loadIdx < rangeEnd) {
            let g = isectVals[loadIdx];
            let splat = splatData[g];
            s_mean2d[lidx] = splat.mean2d;
            // Pack depth into conic.w for depth/rgbd modes
            s_conic[lidx] = vec4<f32>(splat.conic, splat.depth);

            var opacity = splat.color.a;
            if (uniforms.antialiasing != 0u) {
                opacity *= splat.compensation;
            }
            s_color[lidx] = vec4<f32>(splat.color.rgb, opacity);
        }

        // Synchronize after load
        workgroupBarrier();

        // Process batch
        let batchSize = min(BATCH_SIZE, rangeEnd - batchStart);
        for (var t = 0u; t < batchSize; t++) {
            if (done) { break; }

            let mean = s_mean2d[t];
            let conic = s_conic[t].xyz;
            let splatDepth = s_conic[t].w;
            let rgba = s_color[t];

            let delta = mean - vec2<f32>(px, py);
            let sigma = 0.5 * (conic.x * delta.x * delta.x +
                               conic.z * delta.y * delta.y) +
                        conic.y * delta.x * delta.y;

            if (sigma < 0.0) { continue; }

            let alpha = min(0.99, rgba.a * exp(-sigma));
            if (alpha < uniforms.alphaThreshold) { continue; }

            let nextT = T * (1.0 - alpha);
            if (nextT < 1e-4) {
                done = true;
                break;
            }

            let weight = alpha * T;
            color += rgba.rgb * weight;

            if (uniforms.renderMode != RENDER_MODE_RGB) {
                accDepth += splatDepth * weight;
            }

            T = nextT;
        }
    }

    // Write output
    if (inside) {
        let pixelId = pixelY * uniforms.viewportWidth + pixelX;
        let rasterAlpha = 1.0 - T;

        if (uniforms.renderMode == RENDER_MODE_DEPTH) {
            let nearP = uniforms.nearPlane;
            let farP = uniforms.farPlane;
            let normDepth = clamp((accDepth - nearP * (1.0 - T)) / (farP - nearP), 0.0, 1.0);
            outputColor[pixelId] = vec4<f32>(vec3<f32>(normDepth) * rasterAlpha, rasterAlpha);
        } else if (uniforms.renderMode == RENDER_MODE_RGBD) {
            let nearP = uniforms.nearPlane;
            let farP = uniforms.farPlane;
            let normDepth = clamp((accDepth - nearP * (1.0 - T)) / (farP - nearP), 0.0, 1.0);
            outputColor[pixelId] = vec4<f32>(color, normDepth);
        } else {
            outputColor[pixelId] = vec4<f32>(color, rasterAlpha);
        }
    }
}
`,Oe=`
@group(0) @binding(0) var<storage, read> outputColor: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> blitParams: vec4<u32>;

@vertex
fn vs_blit(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
    // Fullscreen triangle: 3 vertices cover clip space
    let x = f32(i32(vid & 1u) * 4 - 1);
    let y = f32(i32(vid & 2u) * 2 - 1);
    return vec4<f32>(x, y, 0.0, 1.0);
}

@fragment
fn fs_blit(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let pixelX = u32(pos.x);
    let pixelY = u32(pos.y);
    let width = blitParams.x;
    let height = blitParams.y;
    if (pixelX >= width || pixelY >= height) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    let idx = pixelY * width + pixelX;
    return outputColor[idx];
}
`,Re={rgb:0,depth:1,rgbd:2};class Ee{constructor(e,t){this.name="Tiled",this.blitPipeline=null,this.currentFormat=null,this.configured=!1,this.count=0,this.maxIsects=0,this.splatDataBuffer=null,this.tileWidth=0,this.tileHeight=0,this.viewportWidth=0,this.viewportHeight=0,this.isectKeys=null,this.isectVals=null,this.tileOffsets=null,this.outputColor=null,this.atomicCounter=null,this.clearBindGroup=null,this.intersectBindGroup=null,this.offsetEncodeBindGroup=null,this.offsetFixBindGroup=null,this.rasterBindGroup=null,this.blitBindGroup=null,this.needsRebuild=!1,this.device=e,this.tileSize=t?.tileSize??16,this.intersectionRatio=t?.intersectionRatio??8;const r=["clear","intersect","offsetEncode","offsetFix","raster","blit"],s=[De,Ue,ke,Ie,Me,Oe],o=[];for(let a=0;a<s.length;a++){const u=e.createShaderModule({code:s[a]});o.push(u),u.getCompilationInfo().then(n=>{for(const l of n.messages)l.type==="error"?console.error(`[Tiled] Shader "${r[a]}" compilation ERROR: ${l.message} (line ${l.lineNum}:${l.linePos})`):l.type==="warning"&&console.warn(`[Tiled] Shader "${r[a]}" warning: ${l.message}`)})}this.clearPipeline=e.createComputePipeline({layout:"auto",compute:{module:o[0],entryPoint:"main"}}),this.intersectPipeline=e.createComputePipeline({layout:"auto",compute:{module:o[1],entryPoint:"main"}}),this.offsetEncodePipeline=e.createComputePipeline({layout:"auto",compute:{module:o[2],entryPoint:"main"}}),this.offsetFixPipeline=e.createComputePipeline({layout:"auto",compute:{module:o[3],entryPoint:"main"}}),this.rasterPipeline=e.createComputePipeline({layout:"auto",compute:{module:o[4],entryPoint:"main"}}),this.blitShaderModule=o[5],this.sortModule=new w(e,{passes:4}),this.clearUniformBuffer=e.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.intersectUniformBuffer=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.rasterUniformBuffer=e.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.offsetFixUniformBuffer=e.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.blitUniformBuffer=e.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}configure(e){this.count=e.count,this.maxIsects=e.count*this.intersectionRatio,this.splatDataBuffer=e.buffers.splatData,e.format!==this.currentFormat&&(this.currentFormat=e.format,this.blitPipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:this.blitShaderModule,entryPoint:"vs_blit"},fragment:{module:this.blitShaderModule,entryPoint:"fs_blit",targets:[{format:e.format}]},primitive:{topology:"triangle-list"}})),this.destroyInternalBuffers(),this.isectKeys=this.device.createBuffer({size:Math.max(16,this.maxIsects*4),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.isectVals=this.device.createBuffer({size:Math.max(16,this.maxIsects*4),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.atomicCounter=this.device.createBuffer({size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.sortModule.configure({count:this.maxIsects,buffers:{depth:this.isectKeys,index:this.isectVals}}),this.needsRebuild=!0,this.configured=!0}setUniforms(e){const t=e.viewportWidth,r=e.viewportHeight,s=Math.ceil(t/this.tileSize),o=Math.ceil(r/this.tileSize);if(t!==this.viewportWidth||r!==this.viewportHeight){this.viewportWidth=t,this.viewportHeight=r,this.tileWidth=s,this.tileHeight=o;const re=s*o;this.tileOffsets&&this.tileOffsets.destroy(),this.tileOffsets=this.device.createBuffer({size:Math.max(16,(re+1)*4),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.outputColor&&this.outputColor.destroy(),this.outputColor=this.device.createBuffer({size:Math.max(16,t*r*16),usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC}),this.needsRebuild=!0}this.needsRebuild&&(this.createBindGroups(),this.needsRebuild=!1);const a=s*o,u=new Uint32Array([this.maxIsects,a+1,0,0]);this.device.queue.writeBuffer(this.clearUniformBuffer,0,u);const n=new Float32Array(8),l=new Uint32Array(n.buffer);l[0]=this.count,l[1]=s,l[2]=o,l[3]=this.maxIsects,n[4]=e.farPlane,l[5]=this.tileSize,l[6]=0,l[7]=0,this.device.queue.writeBuffer(this.intersectUniformBuffer,0,n);const f=new Float32Array(12),d=new Uint32Array(f.buffer);d[0]=t,d[1]=r,d[2]=s,d[3]=o,f[4]=e.nearPlane,f[5]=e.farPlane,d[6]=e.antialiasing??!0?1:0,d[7]=Re[e.renderMode??"rgb"],f[8]=e.alphaThreshold??1/255,d[9]=0,d[10]=0,d[11]=0,this.device.queue.writeBuffer(this.rasterUniformBuffer,0,f);const p=new Uint32Array([a,0,0,0]);this.device.queue.writeBuffer(this.offsetFixUniformBuffer,0,p);const c=new Uint32Array([t,r,0,0]);this.device.queue.writeBuffer(this.blitUniformBuffer,0,c)}execute(e,t,r,s,o){if(!this.configured||!this.clearBindGroup||!this.blitPipeline)return;const a=this.tileWidth*this.tileHeight,u=Math.max(this.maxIsects,a+1),n=Math.min(65535,Math.ceil(u/256)),l=Math.min(65535,Math.ceil(this.count/256)),f=Math.min(65535,Math.ceil(this.maxIsects/256));e.clearBuffer(this.atomicCounter,0,4);{const d=e.beginComputePass();d.setPipeline(this.clearPipeline),d.setBindGroup(0,this.clearBindGroup),d.dispatchWorkgroups(n),d.end()}{const d=e.beginComputePass();d.setPipeline(this.intersectPipeline),d.setBindGroup(0,this.intersectBindGroup),d.dispatchWorkgroups(l),d.end()}this.sortModule.execute(e);{const d=e.beginComputePass();d.setPipeline(this.offsetEncodePipeline),d.setBindGroup(0,this.offsetEncodeBindGroup),d.dispatchWorkgroups(f),d.end()}{const d=e.beginComputePass();d.setPipeline(this.offsetFixPipeline),d.setBindGroup(0,this.offsetFixBindGroup),d.dispatchWorkgroups(1),d.end()}{const d=e.beginComputePass();d.setPipeline(this.rasterPipeline),d.setBindGroup(0,this.rasterBindGroup),d.dispatchWorkgroups(this.tileWidth,this.tileHeight),d.end()}{const d=e.beginRenderPass({colorAttachments:[{view:t,clearValue:s??{r:0,g:0,b:0,a:0},loadOp:o??"clear",storeOp:"store"}]});d.setPipeline(this.blitPipeline),d.setBindGroup(0,this.blitBindGroup),d.draw(3),d.end()}}destroy(){this.destroyInternalBuffers(),this.tileOffsets?.destroy(),this.outputColor?.destroy(),this.tileOffsets=null,this.outputColor=null,this.sortModule.destroy(),this.clearUniformBuffer.destroy(),this.intersectUniformBuffer.destroy(),this.rasterUniformBuffer.destroy(),this.offsetFixUniformBuffer.destroy(),this.blitUniformBuffer.destroy(),this.blitPipeline=null,this.configured=!1}createBindGroups(){!this.isectKeys||!this.isectVals||!this.atomicCounter||!this.tileOffsets||!this.outputColor||!this.splatDataBuffer||(this.clearBindGroup=this.device.createBindGroup({layout:this.clearPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.isectKeys}},{binding:1,resource:{buffer:this.tileOffsets}},{binding:2,resource:{buffer:this.clearUniformBuffer}}]}),this.intersectBindGroup=this.device.createBindGroup({layout:this.intersectPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.splatDataBuffer}},{binding:1,resource:{buffer:this.isectKeys}},{binding:2,resource:{buffer:this.isectVals}},{binding:3,resource:{buffer:this.atomicCounter}},{binding:4,resource:{buffer:this.intersectUniformBuffer}}]}),this.offsetEncodeBindGroup=this.device.createBindGroup({layout:this.offsetEncodePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.isectKeys}},{binding:1,resource:{buffer:this.tileOffsets}},{binding:2,resource:{buffer:this.atomicCounter}}]}),this.offsetFixBindGroup=this.device.createBindGroup({layout:this.offsetFixPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.tileOffsets}},{binding:1,resource:{buffer:this.atomicCounter}},{binding:2,resource:{buffer:this.offsetFixUniformBuffer}}]}),this.rasterBindGroup=this.device.createBindGroup({layout:this.rasterPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.rasterUniformBuffer}},{binding:1,resource:{buffer:this.splatDataBuffer}},{binding:2,resource:{buffer:this.isectVals}},{binding:3,resource:{buffer:this.tileOffsets}},{binding:4,resource:{buffer:this.outputColor}}]}),this.blitPipeline&&(this.blitBindGroup=this.device.createBindGroup({layout:this.blitPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.outputColor}},{binding:1,resource:{buffer:this.blitUniformBuffer}}]})))}destroyInternalBuffers(){this.isectKeys?.destroy(),this.isectVals?.destroy(),this.atomicCounter?.destroy(),this.isectKeys=null,this.isectVals=null,this.atomicCounter=null,this.clearBindGroup=null,this.intersectBindGroup=null,this.offsetEncodeBindGroup=null,this.offsetFixBindGroup=null,this.rasterBindGroup=null,this.blitBindGroup=null}}const Fe=`
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
`;class Ae{constructor(e){this.name="Stochastic",this.configured=!1,this.count=0,this.pipeline=null,this.bindGroup=null,this.currentFormat=null,this.currentDepthFormat=null,this.internalDepthTexture=null,this.internalDepthWidth=0,this.internalDepthHeight=0,this.frameCounter=0,this.viewportWidth=0,this.viewportHeight=0,this.internalDepthView=null,this.device=e,this.shaderModule=e.createShaderModule({code:Fe}),this.uniformBuffer=e.createBuffer({size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}configure(e){this.count=e.count;const t=e.depthFormat??"depth24plus",r=e.format!==this.currentFormat,s=t!==this.currentDepthFormat;(r||s||!this.pipeline)&&(this.currentFormat=e.format,this.currentDepthFormat=t,this.createPipeline(e.format,t)),this.createBindGroup(e.buffers),this.configured=!0}setUniforms(e){const t=new Float32Array(28),r=new Uint32Array(t.buffer);e.projMatrix?t.set(e.projMatrix,0):(t[0]=1,t[5]=1,t[10]=1,t[15]=1),t[16]=e.viewportWidth,t[17]=e.viewportHeight,t[18]=e.nearPlane,t[19]=e.farPlane,r[20]=e.antialiasing??!0?1:0,r[21]=0,r[22]=e.numGaussians,r[23]=0,r[24]=1,t[25]=e.alphaThreshold??1/255,r[26]=e.frameIndex??this.frameCounter,this.frameCounter++,this.device.queue.writeBuffer(this.uniformBuffer,0,t),this.viewportWidth=e.viewportWidth,this.viewportHeight=e.viewportHeight}execute(e,t,r,s,o){if(!this.configured||!this.pipeline||!this.bindGroup)return;const a=r??this.ensureInternalDepthTexture(),n={colorAttachments:[{view:t,clearValue:s??{r:0,g:0,b:0,a:0},loadOp:o??"clear",storeOp:"store"}],depthStencilAttachment:{view:a,depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}},l=e.beginRenderPass(n);l.setPipeline(this.pipeline),l.setBindGroup(0,this.bindGroup),l.draw(6*this.count),l.end()}destroy(){this.uniformBuffer.destroy(),this.internalDepthTexture&&(this.internalDepthTexture.destroy(),this.internalDepthTexture=null),this.pipeline=null,this.bindGroup=null,this.configured=!1}createPipeline(e,t){const r={layout:"auto",vertex:{module:this.shaderModule,entryPoint:"vs_main"},fragment:{module:this.shaderModule,entryPoint:"fs_main",targets:[{format:e}]},primitive:{topology:"triangle-list",cullMode:"none"},depthStencil:{format:t,depthWriteEnabled:!0,depthCompare:"less"}};this.pipeline=this.device.createRenderPipeline(r)}createBindGroup(e){this.pipeline&&(this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:{buffer:e.sortedIndices}},{binding:2,resource:{buffer:e.splatData}}]}))}ensureInternalDepthTexture(){const e=this.viewportWidth||1,t=this.viewportHeight||1;return this.internalDepthTexture&&this.internalDepthWidth===e&&this.internalDepthHeight===t?this.internalDepthView:(this.internalDepthTexture&&this.internalDepthTexture.destroy(),this.internalDepthTexture=this.device.createTexture({size:{width:e,height:t},format:this.currentDepthFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT}),this.internalDepthWidth=e,this.internalDepthHeight=t,this.internalDepthView=this.internalDepthTexture.createView(),this.internalDepthView)}}function ze(i,e){switch(i){case"billboard-ftb":return new A(e,{blend:"front-to-back"});case"billboard-btf":return new A(e,{blend:"back-to-front"});case"tiled":return new Ee(e);case"stochastic":return new Ae(e)}}const We=`
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
`,He=`
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
`;class Ve{constructor(e,t){this.name="Composite",this.configured=!1,this.pipeline=null,this.bindGroup=null,this.currentFormat=null,this.device=e,this.shaderModule=e.createShaderModule({code:We}),this.sampler=e.createSampler({magFilter:"linear",minFilter:"linear"}),this.uniformBuffer=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.fallbackBackgroundBytes=new Uint8Array([0,0,0,255]),this.fallbackBackgroundTexture=e.createTexture({size:[1,1,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),e.queue.writeTexture({texture:this.fallbackBackgroundTexture},this.fallbackBackgroundBytes,{bytesPerRow:4},[1,1,1]),this.fallbackDepthTexture=e.createTexture({size:[1,1,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),e.queue.writeTexture({texture:this.fallbackDepthTexture},new Uint8Array([255,255,255,255]),{bytesPerRow:4},[1,1,1])}configure(e){(e.format!==this.currentFormat||!this.pipeline)&&(this.currentFormat=e.format,this.createPipeline(e.format)),this.createBindGroup(e),this.configured=!0}setUniforms(e){const t=e,r=new Float32Array(12),s=new Uint32Array(r.buffer);r[0]=t.viewportWidth,r[1]=t.viewportHeight,s[2]=t.depthAware??!1?1:0;const o=t.backgroundColor??[0,0,0,1];r[4]=o[0],r[5]=o[1],r[6]=o[2],r[7]=o[3],r[8]=t.nearPlane??.1,r[9]=t.farPlane??100,this.device.queue.writeBuffer(this.uniformBuffer,0,r),this.updateFallbackBackgroundTexture(o)}execute(e,t){if(!this.configured||!this.pipeline||!this.bindGroup)return;const r=e.beginRenderPass({colorAttachments:[{view:t,clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});r.setPipeline(this.pipeline),r.setBindGroup(0,this.bindGroup),r.draw(3),r.end()}destroy(){this.uniformBuffer.destroy(),this.fallbackBackgroundTexture.destroy(),this.fallbackDepthTexture.destroy(),this.pipeline=null,this.bindGroup=null,this.configured=!1}createPipeline(e){this.pipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:this.shaderModule,entryPoint:"vs_main"},fragment:{module:this.shaderModule,entryPoint:"fs_main",targets:[{format:e}]},primitive:{topology:"triangle-list",cullMode:"none"}})}createBindGroup(e){if(!this.pipeline)return;const t=e.buffers.colorTexture.createView(),r=(e.buffers.backgroundTexture??this.fallbackBackgroundTexture).createView(),s=(e.buffers.depthTexture??this.fallbackDepthTexture).createView();this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:this.sampler},{binding:2,resource:t},{binding:3,resource:r},{binding:4,resource:s}]})}updateFallbackBackgroundTexture(e){const t=new Uint8Array([B(e[0]),B(e[1]),B(e[2]),B(e[3])]);this.fallbackBackgroundBytes[0]===t[0]&&this.fallbackBackgroundBytes[1]===t[1]&&this.fallbackBackgroundBytes[2]===t[2]&&this.fallbackBackgroundBytes[3]===t[3]||(this.fallbackBackgroundBytes=t,this.device.queue.writeTexture({texture:this.fallbackBackgroundTexture},t,{bytesPerRow:4},[1,1,1]))}}function B(i){const e=Number.isFinite(i)?i:0;return Math.round(Math.max(0,Math.min(1,e))*255)}class Ne{constructor(e,t){this.name="Depth of Field",this.configured=!1,this.pipeline=null,this.horizontalBindGroup=null,this.verticalBindGroup=null,this.intermediateTexture=null,this.currentFormat=null,this.currentWidth=0,this.currentHeight=0,this.depthTextureView=null,this.device=e,this.shaderModule=e.createShaderModule({code:He}),this.sampler=e.createSampler({magFilter:"linear",minFilter:"linear"}),this.uniformBufferH=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.uniformBufferV=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.dummyDepthTexture=e.createTexture({size:[1,1,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),e.queue.writeTexture({texture:this.dummyDepthTexture},new Uint8Array([128,128,128,255]),{bytesPerRow:4},{width:1,height:1}),this.dummyDepthView=this.dummyDepthTexture.createView()}configure(e){const t=e.buffers.colorTexture,r=t.width,s=t.height,o=e.format!==this.currentFormat;(o||!this.pipeline)&&(this.currentFormat=e.format,this.createPipeline(e.format)),(r!==this.currentWidth||s!==this.currentHeight||o||!this.intermediateTexture)&&(this.currentWidth=r,this.currentHeight=s,this.intermediateTexture&&this.intermediateTexture.destroy(),this.intermediateTexture=this.device.createTexture({size:[r,s,1],format:e.format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT}));const u=t.createView(),n=e.buffers.depthTexture?.createView()??null;this.depthTextureView=n,this.createBindGroups(u,n),this.configured=!0}setUniforms(e){const t=e,r=new Float32Array(8);r[0]=t.viewportWidth,r[1]=t.viewportHeight,r[2]=t.focalDistance,r[3]=t.aperture,r[4]=t.nearPlane,r[5]=t.farPlane,r[6]=t.maxCoC??20,this.device.queue.writeBuffer(this.uniformBufferH,0,r);const s=new Float32Array(8);s.set(r),new Uint32Array(s.buffer)[7]=1,this.device.queue.writeBuffer(this.uniformBufferV,0,s)}execute(e,t){if(!this.configured||!this.pipeline||!this.horizontalBindGroup||!this.verticalBindGroup||!this.intermediateTexture)return;const r=this.intermediateTexture.createView(),s=e.beginRenderPass({colorAttachments:[{view:r,clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});s.setPipeline(this.pipeline),s.setBindGroup(0,this.horizontalBindGroup),s.draw(3),s.end();const o=e.beginRenderPass({colorAttachments:[{view:t,clearValue:{r:0,g:0,b:0,a:0},loadOp:"clear",storeOp:"store"}]});o.setPipeline(this.pipeline),o.setBindGroup(0,this.verticalBindGroup),o.draw(3),o.end()}destroy(){this.uniformBufferH.destroy(),this.uniformBufferV.destroy(),this.dummyDepthTexture.destroy(),this.intermediateTexture&&(this.intermediateTexture.destroy(),this.intermediateTexture=null),this.pipeline=null,this.horizontalBindGroup=null,this.verticalBindGroup=null,this.depthTextureView=null,this.configured=!1}createPipeline(e){this.pipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:this.shaderModule,entryPoint:"vs_main"},fragment:{module:this.shaderModule,entryPoint:"fs_main",targets:[{format:e}]},primitive:{topology:"triangle-list",cullMode:"none"}})}createBindGroups(e,t){if(!this.pipeline||!this.intermediateTexture)return;const r=t??this.dummyDepthView,s=this.pipeline.getBindGroupLayout(0);this.horizontalBindGroup=this.device.createBindGroup({layout:s,entries:[{binding:0,resource:{buffer:this.uniformBufferH}},{binding:1,resource:this.sampler},{binding:2,resource:e},{binding:3,resource:r}]});const o=this.intermediateTexture.createView();this.verticalBindGroup=this.device.createBindGroup({layout:s,entries:[{binding:0,resource:{buffer:this.uniformBufferV}},{binding:1,resource:this.sampler},{binding:2,resource:o},{binding:3,resource:r}]})}}const Le=`
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
`,Ye=`
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
`;class qe{constructor(e,t){this.name="XR Passthrough",this.configured=!1,this.pipeline=null,this.bindGroup=null,this.currentFormat=null,this.loadOp="clear",this.device=e,this.shaderModule=e.createShaderModule({code:Le}),this.sampler=e.createSampler({magFilter:"linear",minFilter:"linear"}),this.uniformBuffer=e.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}configure(e){(e.format!==this.currentFormat||!this.pipeline)&&(this.currentFormat=e.format,this.createPipeline(e.format)),this.createBindGroup(e),this.configured=!0}setUniforms(e){const t=e,r=new Float32Array(4);r[0]=t.viewportWidth,r[1]=t.viewportHeight,r[2]=t.opacity??1,this.device.queue.writeBuffer(this.uniformBuffer,0,r),this.loadOp=t.loadOp??"clear"}execute(e,t){if(!this.configured||!this.pipeline||!this.bindGroup)return;const r=e.beginRenderPass({colorAttachments:[{view:t,clearValue:{r:0,g:0,b:0,a:0},loadOp:this.loadOp,storeOp:"store"}]});r.setPipeline(this.pipeline),r.setBindGroup(0,this.bindGroup),r.draw(3),r.end()}destroy(){this.uniformBuffer.destroy(),this.pipeline=null,this.bindGroup=null,this.configured=!1}createPipeline(e){this.pipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:this.shaderModule,entryPoint:"vs_main"},fragment:{module:this.shaderModule,entryPoint:"fs_main",targets:[{format:e}]},primitive:{topology:"triangle-list",cullMode:"none"}})}createBindGroup(e){if(!this.pipeline)return;const t=e.buffers.colorTexture.createView();this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:this.sampler},{binding:2,resource:t}]})}}class je{constructor(e,t){this.name="Side-by-Side Stereo",this.configured=!1,this.pipeline=null,this.bindGroup=null,this.currentFormat=null,this.device=e,this.fallbackMode=t?.fallback??"mirror",this.shaderModule=e.createShaderModule({code:Ye}),this.sampler=e.createSampler({magFilter:"linear",minFilter:"linear"}),this.uniformBuffer=e.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.fallbackTexture=e.createTexture({size:[1,1,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),e.queue.writeTexture({texture:this.fallbackTexture},new Uint8Array([0,0,0,0]),{bytesPerRow:4},[1,1,1])}configure(e){(e.format!==this.currentFormat||!this.pipeline)&&(this.currentFormat=e.format,this.createPipeline(e.format)),this.createBindGroup(e),this.configured=!0}setUniforms(e){const t=e,r=new Float32Array(4),s=new Uint32Array(r.buffer);r[0]=t.viewportWidth,r[1]=t.viewportHeight,s[2]=t.swapEyes??!1?1:0,this.device.queue.writeBuffer(this.uniformBuffer,0,r)}execute(e,t){if(!this.configured||!this.pipeline||!this.bindGroup)return;const r=e.beginRenderPass({colorAttachments:[{view:t,clearValue:{r:0,g:0,b:0,a:1},loadOp:"clear",storeOp:"store"}]});r.setPipeline(this.pipeline),r.setBindGroup(0,this.bindGroup),r.draw(3),r.end()}destroy(){this.uniformBuffer.destroy(),this.fallbackTexture.destroy(),this.pipeline=null,this.bindGroup=null,this.configured=!1}createPipeline(e){this.pipeline=this.device.createRenderPipeline({layout:"auto",vertex:{module:this.shaderModule,entryPoint:"vs_main"},fragment:{module:this.shaderModule,entryPoint:"fs_main",targets:[{format:e}]},primitive:{topology:"triangle-list",cullMode:"none"}})}createBindGroup(e){if(!this.pipeline)return;const t=e.buffers.colorTexture.createView(),s=(e.buffers.colorTextureRight??(this.fallbackMode==="mirror"?e.buffers.colorTexture:this.fallbackTexture)).createView();this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:this.sampler},{binding:2,resource:t},{binding:3,resource:s}]})}}function Xe(i,e){switch(i){case"composite":return new Ve(e);case"dof":return new Ne(e);case"xr-passthrough":return new qe(e);case"side-by-side":return new je(e)}}function Je(i,e,t,r,s){const o=i.createTexture({size:{width:e,height:t},format:r,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),a=o.createView();let u=null,n=null;if(s?.includeDepth){const f=s.depthFormat??"rgba8unorm";u=i.createTexture({size:{width:e,height:t},format:f,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}),n=u.createView()}const l={colorTexture:o,...u?{depthTexture:u}:{}};return{colorTexture:o,colorView:a,depthTexture:u,depthView:n,width:e,height:t,format:r,output:l}}function $e(i){i.colorTexture.destroy(),i.depthTexture&&i.depthTexture.destroy()}const z=4,W=8,D=128,Ke=16,Ze=48,H=Uint32Array.BYTES_PER_ELEMENT;function St(i){return new Qe(i)}class Qe{device;scene;format;canvasContext;backgroundColor;destroyRenderTargets;renderTargetsFactory;projectionModule;sortModule;rasterModule;outputModule;debugValidation;pipelineBuffers;firstFrameCallbacks=new Set;releaseRenderSessionCounter=m;releasePipelineBufferCounters=m;releaseRenderTargetTextureCounters=m;renderTargets=null;frame=null;sortedDepthAxis=null;createdAtMs=y();readyState="idle";firstFrameReported=!1;disposed=!1;constructor({device:e,scene:t,format:r,canvasContext:s=null,width:o=1,height:a=1,backgroundColor:u=X(),projectionAlgorithm:n="preprocess",sortAlgorithm:l="radix-16bit",rasterAlgorithm:f="billboard-ftb",outputAlgorithm:d="composite",debugValidation:p=!1,deps:c={}}){this.device=e,this.scene=t,this.format=r,this.canvasContext=s,this.backgroundColor=V(u),this.renderTargetsFactory=c.createRenderTargets??Je,this.destroyRenderTargets=c.destroyRenderTargets??$e,this.debugValidation=p,this.readyState="initializing",this.pipelineBuffers=it(e,t.count),this.releasePipelineBufferCounters=b("buffers",3),this.projectionModule=(c.createProjectionModule??le)(n,e),this.sortModule=(c.createSortModule??Ce)(l,e),this.rasterModule=(c.createRasterModule??ze)(f,e),this.outputModule=(c.createOutputModule??Xe)(d,e),this.configurePipeline(),this.resize(o,a),this.releaseRenderSessionCounter=b("renderSessions")}setCamera(e){this.assertNotDisposed(),Z(e.camera.kind),this.frame=e,this.resize(e.viewport.pixelWidth,e.viewport.pixelHeight)}setBackgroundColor(e){this.assertNotDisposed(),this.backgroundColor=V(e)}resize(e,t){this.assertNotDisposed();const r=x(e,"pixelWidth"),s=x(t,"pixelHeight");this.renderTargets?.width===r&&this.renderTargets.height===s||(this.disposeRenderTargets(),this.renderTargets=this.renderTargetsFactory(this.device,r,s,this.format),this.releaseRenderTargetTextureCounters=b("textures",pt(this.renderTargets)),this.configureRasterAndOutput())}async renderToCanvas(e={}){if(this.assertNotDisposed(),!this.canvasContext)throw new Error("Splat render session has no canvas context");const t=this.canvasContext.getCurrentTexture();await this.renderToTarget(t,{targetKind:"canvas",completion:e.completion??"completed"})}async renderToTexture(e,t={}){await this.renderToTarget(e,{targetKind:"texture",completion:t.completion??"completed"})}async renderToTarget(e,t){if(this.assertNotDisposed(),!this.frame)throw new Error("Splat render session requires a camera before rendering");this.renderTargets||this.resize(this.frame.viewport.pixelWidth,this.frame.viewport.pixelHeight);const r=y();try{const s=this.requireRenderTargets(),o=this.shouldSortFrame(this.frame),a=et(this.frame,this.scene,{writeIndices:o}),u=tt(this.frame,this.scene),n=rt(this.frame,this.backgroundColor);this.projectionModule.setUniforms(a),this.rasterModule.setUniforms(u),this.outputModule.setUniforms(n);const l=this.debugValidation?dt(this.device):!1,f=this.device.createCommandEncoder();this.projectionModule.execute(f),o&&(this.sortModule.execute(f),this.sortedDepthAxis=L(this.frame)),this.rasterModule.execute(f,s.colorView,s.depthView??void 0,{r:0,g:0,b:0,a:0},"clear"),this.outputModule.execute(f,e.createView()),this.device.queue.submit([f.finish()]),(t.completion==="completed"||l)&&await ft(this.device),await lt(this.device,l),k({name:"render",durationMs:P(r),details:{target:t.targetKind,completion:t.completion,width:this.frame.viewport.pixelWidth,height:this.frame.viewport.pixelHeight,count:this.scene.count,shDegree:this.scene.shDegree,sorted:o}}),this.reportFirstFrame()}catch(s){throw this.readyState="failed",s}}getReadyState(){return this.readyState}onFirstFrame(e){return this.firstFrameReported?(e(),()=>{}):(this.firstFrameCallbacks.add(e),()=>{this.firstFrameCallbacks.delete(e)})}dispose(){this.disposed||(this.disposed=!0,this.projectionModule.destroy(),this.sortModule.destroy(),this.rasterModule.destroy(),this.outputModule.destroy(),this.pipelineBuffers.splatData.destroy(),this.pipelineBuffers.depths.destroy(),this.pipelineBuffers.indices.destroy(),this.releasePipelineBufferCounters(),this.disposeRenderTargets(),this.scene.release(),this.releaseRenderSessionCounter())}configurePipeline(){this.projectionModule.configure({count:this.scene.count,buffers:{gaussians:this.scene.gaussianBuffer,...this.scene.shDegree>0?{shCoeffs:this.scene.shBuffer}:{},splatData:this.pipelineBuffers.splatData,depths:this.pipelineBuffers.depths,indices:this.pipelineBuffers.indices}}),this.sortModule.configure({count:this.scene.count,buffers:{depth:this.pipelineBuffers.depths,index:this.pipelineBuffers.indices}})}configureRasterAndOutput(){const e=this.requireRenderTargets();this.rasterModule.configure({count:this.scene.count,buffers:{sortedIndices:this.pipelineBuffers.indices,splatData:this.pipelineBuffers.splatData},format:e.format}),this.outputModule.configure({buffers:e.output,format:this.format})}requireRenderTargets(){if(!this.renderTargets)throw new Error("Splat render session has no render targets");return this.renderTargets}disposeRenderTargets(){if(!this.renderTargets)return;const e=this.renderTargets,t=this.releaseRenderTargetTextureCounters;this.renderTargets=null,this.releaseRenderTargetTextureCounters=m;try{this.destroyRenderTargets(e)}finally{t()}}reportFirstFrame(){if(this.firstFrameReported)return;const e=Array.from(this.firstFrameCallbacks);this.firstFrameCallbacks.clear(),this.firstFrameReported=!0,this.readyState="ready",k({name:"first-frame",durationMs:P(this.createdAtMs),details:{count:this.scene.count,width:this.frame?.viewport.pixelWidth??null,height:this.frame?.viewport.pixelHeight??null}});for(const t of e)try{t()}catch(r){ct(r)}}assertNotDisposed(){if(this.disposed)throw new Error("Splat render session has been disposed")}shouldSortFrame(e){const t=L(e);return!this.sortedDepthAxis||!nt(this.sortedDepthAxis,t)}}function et(i,e,t={}){const r=x(i.viewport.pixelWidth,"viewport pixelWidth"),s=x(i.viewport.pixelHeight,"viewport pixelHeight"),o=M(i.camera.viewMatrix,"viewMatrix"),a=M(i.camera.projectionMatrix,"projectionMatrix"),{nearPlane:u,farPlane:n}=K(i,e.bounds);return{viewMatrix:o,projMatrix:a,viewportWidth:r,viewportHeight:s,focalX:a[0]*r*.5,focalY:a[5]*s*.5,camPos:i.camera.position,shDegree:e.shDegree,nearPlane:u,farPlane:n,cameraModel:Z(i.camera.kind),numGaussians:e.count,linearOutput:!1,writeIndices:t.writeIndices??!0}}function tt(i,e){const{nearPlane:t,farPlane:r}=K(i,e.bounds);return{viewportWidth:x(i.viewport.pixelWidth,"viewport pixelWidth"),viewportHeight:x(i.viewport.pixelHeight,"viewport pixelHeight"),nearPlane:t,farPlane:r,numGaussians:e.count,renderMode:"rgb",antialiasing:!0,projMatrix:M(i.camera.projectionMatrix,"projectionMatrix")}}function K(i,e){if(!N(i.camera.position)||!N(e.center)||!at(e.size)){const n=st(i.camera.near);return{nearPlane:n,farPlane:ot(i.camera.far,n)}}const t=i.camera.position[0]-e.center[0],r=i.camera.position[1]-e.center[1],s=i.camera.position[2]-e.center[2],o=Math.sqrt(t*t+r*r+s*s),a=Math.max(.1,o-e.size),u=Math.max(a+.001,o+e.size);return{nearPlane:a,farPlane:u}}function rt(i,e=X()){return{viewportWidth:x(i.viewport.pixelWidth,"viewport pixelWidth"),viewportHeight:x(i.viewport.pixelHeight,"viewport pixelHeight"),backgroundColor:e,depthAware:!1}}function it(i,e){const t=ut(e,"gaussianCount");return _(i,ie(t)),{splatData:i.createBuffer({label:"webgpu splat renderer: splat data",size:U(t*Ze),usage:D}),depths:i.createBuffer({label:"webgpu splat renderer: depths",size:U(t*H),usage:D|W|z}),indices:i.createBuffer({label:"webgpu splat renderer: indices",size:U(t*H),usage:D|W|z})}}function U(i){return Math.max(Ke,i)}function M(i,e){if(i.length!==16)throw new Error(`Invalid splat renderer ${e}: expected 16 values, got ${i.length}`);return new Float32Array(i)}function V(i){return[i[0],i[1],i[2],i[3]]}function Z(i){if(i==="perspective")return"pinhole";if(i==="orthographic")return"ortho";throw new Error("Splat render session requires a perspective or orthographic camera")}function st(i){return Number.isFinite(i)&&i!==null&&i>0?i:.1}function ot(i,e){const t=e+1,r=Number.isFinite(i)&&i!==null?i:t;return Math.max(e+.001,r)}function N(i){return i.length>=3&&Number.isFinite(i[0])&&Number.isFinite(i[1])&&Number.isFinite(i[2])}function at(i){return Number.isFinite(i)&&i>0}function L(i){const e=i.camera.viewMatrix,t=-e[2],r=-e[6],s=-e[10],o=Math.hypot(t,r,s);return!Number.isFinite(o)||o<=0?[0,0,-1]:[t/o,r/o,s/o]}function nt(i,e){return Math.abs(i[0]-e[0])<=1e-7&&Math.abs(i[1]-e[1])<=1e-7&&Math.abs(i[2]-e[2])<=1e-7}function x(i,e){if(!Number.isInteger(i)||i<=0)throw new Error(`Invalid splat renderer ${e}: expected a positive integer`);return i}function ut(i,e){if(!Number.isInteger(i)||i<0)throw new Error(`Invalid splat renderer ${e}: expected a non-negative integer`);return i}function dt(i){const e=i;return e.pushErrorScope?(e.pushErrorScope("validation"),!0):!1}async function lt(i,e){if(!e)return;const r=await i.popErrorScope?.();if(r)throw new Error(`Splat render session WebGPU validation failed: ${r.message}`)}async function ft(i){await i.queue.onSubmittedWorkDone?.()}function ct(i){console.error("Splat render session first-frame callback failed",i)}function pt(i){const e=new Set;return Q(i,e,new Set),e.size}function Q(i,e,t){if(!(!i||typeof i!="object")&&!t.has(i)){if(t.add(i),ht(i)){e.add(i);return}for(const r of Object.values(i))Q(r,e,t)}}function ht(i){const e=i;return typeof e.createView=="function"&&typeof e.destroy=="function"}const S=8,v=128,gt=16;function mt(i){return{limits:i.limits,createBuffer(e){return i.createBuffer({label:e.label,size:e.size,usage:e.usage})},writeBuffer(e,t,r=0){i.queue.writeBuffer(e,r,t)}}}function xt(i,e,t={}){E(i,e);const r=J(e);return vt(i,r,t)}async function bt(i,e,t={}){E(i,e),t.onProgress?.({phase:"packing"});const r=J(e);return Bt(i,r,t)}function vt(i,e,t={}){te(i,e);const r=t.labelPrefix??"webgpu splat",s=y();let o=null,a=null,u=m,n=m;try{o=i.createBuffer({label:`${r}: gaussians`,size:C(e.gaussianData.byteLength),usage:v|S}),u=b("buffers"),Y(i,o,e.gaussianData),a=i.createBuffer({label:`${r}: sh`,size:C(e.shData?.byteLength??0),usage:e.shData?v|S:v}),n=b("buffers"),e.shData&&Y(i,a,e.shData)}catch(f){throw o?.destroy(),a?.destroy(),u(),n(),f}ee(e,r,P(s));let l=!1;return{count:e.count,shDegree:e.shDegree,bounds:e.bounds,gaussianBuffer:o,shBuffer:a,gaussianByteLength:e.gaussianData.byteLength,shByteLength:e.shData?.byteLength??0,dispose(){l||(l=!0,o.destroy(),a.destroy(),u(),n())}}}async function Bt(i,e,t={}){te(i,e);const r=t.labelPrefix??"webgpu splat",s=y();let o=null,a=null,u=m,n=m;const l=e.gaussianData.byteLength+(e.shData?.byteLength??0);let f=0;const d=c=>{f=Math.min(l,f+c),t.onProgress?.({phase:"uploading",uploadedBytes:f,totalBytes:l})};try{t.onProgress?.({phase:"uploading",uploadedBytes:0,totalBytes:l}),o=i.createBuffer({label:`${r}: gaussians`,size:C(e.gaussianData.byteLength),usage:v|S}),u=b("buffers"),await q(i,o,e.gaussianData,t,d),a=i.createBuffer({label:`${r}: sh`,size:C(e.shData?.byteLength??0),usage:e.shData?v|S:v}),n=b("buffers"),e.shData&&await q(i,a,e.shData,t,d)}catch(c){throw o?.destroy(),a?.destroy(),u(),n(),c}ee(e,r,P(s));let p=!1;return{count:e.count,shDegree:e.shDegree,bounds:e.bounds,gaussianBuffer:o,shBuffer:a,gaussianByteLength:e.gaussianData.byteLength,shByteLength:e.shData?.byteLength??0,dispose(){p||(p=!0,o.destroy(),a.destroy(),u(),n())}}}function ee(i,e,t){const r=i.shData?.byteLength??0;k({name:"scene-upload",durationMs:t,bytes:i.gaussianData.byteLength+r,details:{labelPrefix:e,count:i.count,shDegree:i.shDegree,gaussianBytes:i.gaussianData.byteLength,shBytes:r}})}function C(i){return Math.max(gt,i)}function E(i,e){i.limits&&_({limits:i.limits},I(e))}function te(i,e){E(i,e)}function Y(i,e,t){t.byteLength!==0&&i.writeBuffer(e,t)}async function q(i,e,t,r,s){if(t.byteLength===0)return;const o=wt(r.maxChunkBytes);if(t.byteLength<=o){i.writeBuffer(e,t),s?.(t.byteLength);return}const a=Math.max(1,Math.floor(o/Float32Array.BYTES_PER_ELEMENT)),u=r.yieldToMainThread??yt;for(let n=0;n<t.length;n+=a){const l=Math.min(t.length,n+a);i.writeBuffer(e,t.subarray(n,l),n*Float32Array.BYTES_PER_ELEMENT),s?.((l-n)*Float32Array.BYTES_PER_ELEMENT),l<t.length&&await u()}}function wt(i){const t=Number.isInteger(i)&&i!==void 0&&i>0?i:16777216;return Math.max(Float32Array.BYTES_PER_ELEMENT,t)}function yt(){const i=globalThis.scheduler;return typeof i?.yield=="function"?i.yield():new Promise(e=>{setTimeout(e,0)})}class Ct{createBufferUploader;uploadResources;entriesByDevice=new Map;constructor(e={}){this.createBufferUploader=e.createBufferUploader??mt,this.uploadResources=e.uploadResources??xt}acquire(e,t){const r=j(t.sceneId);let s=this.entriesByDevice.get(e);s||(s=new Map,this.entriesByDevice.set(e,s));let o=s.get(r);if(!o){_(e,I(t.cloud));const a=this.createBufferUploader(e);o={resources:this.uploadResources(a,t.cloud,{labelPrefix:t.labelPrefix??r}),refCount:0,disposed:!1},s.set(r,o)}return o.refCount+=1,this.createSceneRef(e,r,o)}async acquireAsync(e,t,r={}){const s=j(t.sceneId);let o=this.entriesByDevice.get(e);o||(o=new Map,this.entriesByDevice.set(e,o));let a=o.get(s);if(!a){_(e,I(t.cloud));const u=this.createBufferUploader(e);a={resources:await bt(u,t.cloud,{...r,labelPrefix:r.labelPrefix??t.labelPrefix??s}),refCount:0,disposed:!1},o.set(s,a)}return a.refCount+=1,this.createSceneRef(e,s,a)}getRefCount(e,t){return this.entriesByDevice.get(e)?.get(t)?.refCount??0}clearDevice(e){const t=this.entriesByDevice.get(e);if(t){for(const r of t.values())this.disposeEntry(r);this.entriesByDevice.delete(e)}}dispose(){for(const e of this.entriesByDevice.keys())this.clearDevice(e)}createSceneRef(e,t,r){let s=!1;const{resources:o}=r;return{sceneId:t,device:e,count:o.count,shDegree:o.shDegree,bounds:o.bounds,gaussianBuffer:o.gaussianBuffer,shBuffer:o.shBuffer,gaussianByteLength:o.gaussianByteLength,shByteLength:o.shByteLength,release:()=>{s||(s=!0,this.releaseEntry(e,t,r))}}}releaseEntry(e,t,r){if(r.disposed||(r.refCount=Math.max(0,r.refCount-1),r.refCount>0))return;this.disposeEntry(r);const s=this.entriesByDevice.get(e);s?.delete(t),s?.size===0&&this.entriesByDevice.delete(e)}disposeEntry(e){e.disposed||(e.disposed=!0,e.refCount=0,e.resources.dispose())}}function j(i){const e=i.trim();if(!e)throw new Error("Gaussian scene resource requires a non-empty sceneId");return e}export{Ct as G,St as c};
