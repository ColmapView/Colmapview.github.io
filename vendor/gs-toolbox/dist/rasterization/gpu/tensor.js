import { evalSH } from '../../data/sh';
import { fullyFusedProjectionCPU, } from '../cpu';
const WORKGROUP_SIZE = 64;
const INVALID_INDEX = 0xffffffff;
const TENSOR_RENDER_MODE_MAP = {
    RGB: 0,
    D: 1,
    ED: 2,
    'RGB+D': 3,
    'RGB+ED': 4,
};
const tensorRasterShaderSource = /* wgsl */ `
const WORKGROUP_SIZE: u32 = 64u;
const INVALID_INDEX: u32 = 0xffffffffu;

const RENDER_MODE_RGB: u32 = 0u;
const RENDER_MODE_D: u32 = 1u;
const RENDER_MODE_ED: u32 = 2u;
const RENDER_MODE_RGB_D: u32 = 3u;
const RENDER_MODE_RGB_ED: u32 = 4u;

struct Params {
    width: u32,
    height: u32,
    cameraCount: u32,
    gaussianCount: u32,
    sourceChannels: u32,
    outputChannels: u32,
    renderMode: u32,
    backgroundMode: u32,
    alphaThreshold: f32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

struct ProjectedGaussian {
    meanRadius: vec4<f32>,   // mean.x, mean.y, radius.x, radius.y
    depthConic: vec4<f32>,   // depth, conic.x, conic.y, conic.z
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> sortedIndices: array<u32>;
@group(0) @binding(2) var<storage, read> projected: array<ProjectedGaussian>;
@group(0) @binding(3) var<storage, read> features: array<f32>;
@group(0) @binding(4) var<storage, read> opacities: array<f32>;
@group(0) @binding(5) var<storage, read> backgrounds: array<f32>;
@group(0) @binding(6) var<storage, read_write> renderColors: array<f32>;
@group(0) @binding(7) var<storage, read_write> renderAlphas: array<f32>;

fn has_rgb_channels() -> bool {
    return params.renderMode == RENDER_MODE_RGB ||
           params.renderMode == RENDER_MODE_RGB_D ||
           params.renderMode == RENDER_MODE_RGB_ED;
}

fn uses_expected_depth() -> bool {
    return params.renderMode == RENDER_MODE_ED ||
           params.renderMode == RENDER_MODE_RGB_ED;
}

fn depth_channel() -> u32 {
    if (params.renderMode == RENDER_MODE_ED || params.renderMode == RENDER_MODE_D) {
        return 0u;
    }
    return params.sourceChannels;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let linearPixel = gid.x + gid.y * 65535u * WORKGROUP_SIZE;
    let pixelsPerCamera = params.width * params.height;
    let totalPixels = pixelsPerCamera * params.cameraCount;
    if (linearPixel >= totalPixels) {
        return;
    }

    let cameraIndex = linearPixel / pixelsPerCamera;
    let pixelInCamera = linearPixel - cameraIndex * pixelsPerCamera;
    let px = pixelInCamera % params.width;
    let py = pixelInCamera / params.width;
    let pixelCenter = vec2<f32>(f32(px) + 0.5, f32(py) + 0.5);
    let outputBase = linearPixel * params.outputChannels;

    for (var channel = 0u; channel < params.outputChannels; channel++) {
        renderColors[outputBase + channel] = 0.0;
    }

    var transmittance = 1.0;
    var alphaAccum = 0.0;

    for (var slot = 0u; slot < params.gaussianCount; slot++) {
        if (transmittance <= 0.0001) {
            break;
        }

        let sortedOffset = cameraIndex * params.gaussianCount + slot;
        let gaussianIndex = sortedIndices[sortedOffset];
        if (gaussianIndex == INVALID_INDEX) {
            continue;
        }

        let projectedOffset = cameraIndex * params.gaussianCount + gaussianIndex;
        let g = projected[projectedOffset];
        let mean = g.meanRadius.xy;
        let radius = g.meanRadius.zw;
        if (radius.x <= 0.0 || radius.y <= 0.0) {
            continue;
        }

        if (pixelCenter.x < mean.x - radius.x || pixelCenter.x > mean.x + radius.x ||
            pixelCenter.y < mean.y - radius.y || pixelCenter.y > mean.y + radius.y) {
            continue;
        }

        let delta = pixelCenter - mean;
        let conic = g.depthConic.yzw;
        let sigma = 0.5 * (conic.x * delta.x * delta.x +
                           conic.z * delta.y * delta.y) +
                    conic.y * delta.x * delta.y;
        if (sigma < 0.0) {
            continue;
        }

        let alpha = min(0.99, opacities[gaussianIndex] * exp(-sigma));
        if (alpha < params.alphaThreshold) {
            continue;
        }

        let weight = alpha * transmittance;
        alphaAccum += weight;

        if (params.renderMode == RENDER_MODE_D || params.renderMode == RENDER_MODE_ED) {
            renderColors[outputBase] += g.depthConic.x * weight;
        } else {
            let featureBase = (cameraIndex * params.gaussianCount + gaussianIndex) * params.sourceChannels;
            for (var channel = 0u; channel < params.sourceChannels; channel++) {
                renderColors[outputBase + channel] += features[featureBase + channel] * weight;
            }
            if (params.renderMode == RENDER_MODE_RGB_D || params.renderMode == RENDER_MODE_RGB_ED) {
                renderColors[outputBase + params.sourceChannels] += g.depthConic.x * weight;
            }
        }

        transmittance *= (1.0 - alpha);
    }

    if (uses_expected_depth()) {
        let dc = depth_channel();
        renderColors[outputBase + dc] = renderColors[outputBase + dc] / max(alphaAccum, 1e-10);
    }

    if (has_rgb_channels() && params.backgroundMode != 0u) {
        var backgroundBase = 0u;
        if (params.backgroundMode == 2u) {
            backgroundBase = cameraIndex * params.sourceChannels;
        }
        for (var channel = 0u; channel < params.sourceChannels; channel++) {
            renderColors[outputBase + channel] += backgrounds[backgroundBase + channel] * transmittance;
        }
    }

    renderAlphas[linearPixel] = alphaAccum;
}
`;
export { tensorRasterShaderSource };
export async function requestWebGPUDevice() {
    const nav = globalThis.navigator;
    if (!nav?.gpu) {
        throw new Error('WebGPU is not available in this environment');
    }
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) {
        throw new Error('No WebGPU adapter is available');
    }
    return adapter.requestDevice();
}
export async function renderToTensorsGPU(options) {
    return rasterizationGPU(options);
}
export async function rasterizationGPU(options) {
    const device = options.device ?? await requestWebGPUDevice();
    const prepared = prepareTensorRasterizationInputsCPU(options);
    return executeTensorRasterizationGPU(device, prepared);
}
export async function executeTensorRasterizationGPU(device, prepared) {
    const pixelCount = prepared.meta.cameraCount * prepared.meta.width * prepared.meta.height;
    const colorsByteLength = pixelCount * prepared.meta.channels * 4;
    const alphasByteLength = pixelCount * 4;
    const resources = [];
    const shaderModule = device.createShaderModule({ code: tensorRasterShaderSource });
    const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: shaderModule, entryPoint: 'main' },
    });
    const paramsBuffer = uploadUniformBuffer(device, createParamsBuffer(prepared));
    const sortedBuffer = uploadStorageBuffer(device, prepared.sortedIndices);
    const projectedBuffer = uploadStorageBuffer(device, prepared.projectedGaussians);
    const featuresBuffer = uploadStorageBuffer(device, prepared.features);
    const opacitiesBuffer = uploadStorageBuffer(device, prepared.opacities);
    const backgroundsBuffer = uploadStorageBuffer(device, prepared.backgrounds);
    const colorsBuffer = device.createBuffer({
        size: Math.max(16, colorsByteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const alphasBuffer = device.createBuffer({
        size: Math.max(16, alphasByteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const colorReadback = device.createBuffer({
        size: Math.max(16, colorsByteLength),
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const alphaReadback = device.createBuffer({
        size: Math.max(16, alphasByteLength),
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    resources.push(paramsBuffer, sortedBuffer, projectedBuffer, featuresBuffer, opacitiesBuffer, backgroundsBuffer, colorsBuffer, alphasBuffer, colorReadback, alphaReadback);
    try {
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: paramsBuffer } },
                { binding: 1, resource: { buffer: sortedBuffer } },
                { binding: 2, resource: { buffer: projectedBuffer } },
                { binding: 3, resource: { buffer: featuresBuffer } },
                { binding: 4, resource: { buffer: opacitiesBuffer } },
                { binding: 5, resource: { buffer: backgroundsBuffer } },
                { binding: 6, resource: { buffer: colorsBuffer } },
                { binding: 7, resource: { buffer: alphasBuffer } },
            ],
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        const totalWorkgroups = Math.ceil(pixelCount / WORKGROUP_SIZE);
        const workgroupsX = Math.min(totalWorkgroups, 65535);
        const workgroupsY = Math.ceil(totalWorkgroups / 65535);
        if (workgroupsY > 65535) {
            throw new Error('render target is too large for one WebGPU tensor dispatch');
        }
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);
        pass.end();
        encoder.copyBufferToBuffer(colorsBuffer, 0, colorReadback, 0, colorsByteLength);
        encoder.copyBufferToBuffer(alphasBuffer, 0, alphaReadback, 0, alphasByteLength);
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        const [renderColors, renderAlphas] = await Promise.all([
            readFloat32Buffer(colorReadback, colorsByteLength),
            readFloat32Buffer(alphaReadback, alphasByteLength),
        ]);
        return {
            renderColors,
            renderAlphas,
            render_colors: renderColors,
            render_alphas: renderAlphas,
            meta: prepared.meta,
        };
    }
    finally {
        for (const resource of resources) {
            resource.destroy();
        }
    }
}
export function prepareTensorRasterizationInputsCPU(options) {
    validatePositiveInteger(options.width, 'width');
    validatePositiveInteger(options.height, 'height');
    const mode = options.renderMode ?? 'RGB';
    const projection = fullyFusedProjectionCPU(options);
    const sourceChannels = getSourceChannelCount(options);
    const outputChannels = getOutputChannelCount(mode, sourceChannels);
    const projectedGaussians = packProjectedGaussians(projection);
    const sortedIndices = createSortedIndices(projection);
    const cameras = normalizeCameras(options.viewmats, options.Ks);
    const features = createFeatureBuffer(options, cameras, sourceChannels);
    const { backgrounds, backgroundMode } = createBackgroundBuffer(options, projection.cameraCount, sourceChannels);
    const opacities = new Float32Array(options.cloud.opacities);
    const meta = {
        cameraCount: projection.cameraCount,
        gaussianCount: projection.gaussianCount,
        width: options.width,
        height: options.height,
        channels: outputChannels,
        sourceChannels,
        colorShape: [projection.cameraCount, options.height, options.width, outputChannels],
        alphaShape: [projection.cameraCount, options.height, options.width, 1],
        renderMode: mode,
        channelChunk: options.channelChunk ?? 32,
        radii: projection.radii,
        means2d: projection.means2d,
        depths: projection.depths,
        conics: projection.conics,
    };
    return {
        projection,
        projectedGaussians,
        sortedIndices,
        features,
        opacities,
        backgrounds,
        backgroundMode,
        renderModeId: TENSOR_RENDER_MODE_MAP[mode],
        alphaThreshold: options.opacityThreshold ?? 0,
        meta,
    };
}
/**
 * @deprecated Use `prepareTensorRasterizationInputsCPU()` to make it clear that
 * projection, sorting, and SH color evaluation still run on the CPU.
 */
export function prepareTensorRasterizationGPUInputs(options) {
    return prepareTensorRasterizationInputsCPU(options);
}
function createParamsBuffer(prepared) {
    const data = new ArrayBuffer(48);
    const u32 = new Uint32Array(data);
    const f32 = new Float32Array(data);
    u32[0] = prepared.meta.width;
    u32[1] = prepared.meta.height;
    u32[2] = prepared.meta.cameraCount;
    u32[3] = prepared.meta.gaussianCount;
    u32[4] = prepared.meta.sourceChannels;
    u32[5] = prepared.meta.channels;
    u32[6] = prepared.renderModeId;
    u32[7] = prepared.backgroundMode;
    f32[8] = prepared.alphaThreshold;
    return u32;
}
function packProjectedGaussians(projection) {
    const out = new Float32Array(projection.cameraCount * projection.gaussianCount * 8);
    for (let cameraIndex = 0; cameraIndex < projection.cameraCount; cameraIndex++) {
        for (let gaussianIndex = 0; gaussianIndex < projection.gaussianCount; gaussianIndex++) {
            const scalarOffset = cameraIndex * projection.gaussianCount + gaussianIndex;
            const vec2Offset = scalarOffset * 2;
            const conicOffset = scalarOffset * 3;
            const outOffset = scalarOffset * 8;
            out[outOffset] = projection.means2d[vec2Offset];
            out[outOffset + 1] = projection.means2d[vec2Offset + 1];
            out[outOffset + 2] = projection.radii[vec2Offset];
            out[outOffset + 3] = projection.radii[vec2Offset + 1];
            out[outOffset + 4] = projection.depths[scalarOffset];
            out[outOffset + 5] = projection.conics[conicOffset];
            out[outOffset + 6] = projection.conics[conicOffset + 1];
            out[outOffset + 7] = projection.conics[conicOffset + 2];
        }
    }
    return out;
}
function createSortedIndices(projection) {
    const sorted = new Uint32Array(projection.cameraCount * projection.gaussianCount);
    sorted.fill(INVALID_INDEX);
    for (let cameraIndex = 0; cameraIndex < projection.cameraCount; cameraIndex++) {
        const indices = [];
        for (let gaussianIndex = 0; gaussianIndex < projection.gaussianCount; gaussianIndex++) {
            const scalarOffset = cameraIndex * projection.gaussianCount + gaussianIndex;
            const vec2Offset = scalarOffset * 2;
            if (projection.radii[vec2Offset] > 0 && projection.radii[vec2Offset + 1] > 0) {
                indices.push(gaussianIndex);
            }
        }
        indices.sort((a, b) => {
            const depthA = projection.depths[cameraIndex * projection.gaussianCount + a];
            const depthB = projection.depths[cameraIndex * projection.gaussianCount + b];
            return depthA - depthB || a - b;
        });
        sorted.set(indices, cameraIndex * projection.gaussianCount);
    }
    return sorted;
}
function createFeatureBuffer(options, cameras, sourceChannels) {
    const out = new Float32Array(cameras.length * options.cloud.count * sourceChannels);
    if (options.colors) {
        for (let cameraIndex = 0; cameraIndex < cameras.length; cameraIndex++) {
            out.set(options.colors, cameraIndex * options.cloud.count * sourceChannels);
        }
        return out;
    }
    if (sourceChannels !== 3) {
        throw new Error('SH-derived colors always have 3 source channels');
    }
    const cloud = options.cloud;
    const numCoeffs = cloud.shDegree > 0 ? (cloud.shDegree + 1) * (cloud.shDegree + 1) - 1 : 0;
    for (let cameraIndex = 0; cameraIndex < cameras.length; cameraIndex++) {
        const camera = cameras[cameraIndex];
        for (let gaussianIndex = 0; gaussianIndex < cloud.count; gaussianIndex++) {
            const color = evaluateCloudColor(cloud, camera, gaussianIndex, numCoeffs);
            out.set(color, (cameraIndex * cloud.count + gaussianIndex) * sourceChannels);
        }
    }
    return out;
}
function evaluateCloudColor(cloud, camera, gaussianIndex, numCoeffs) {
    const sh0 = [
        cloud.sh0[gaussianIndex * 3],
        cloud.sh0[gaussianIndex * 3 + 1],
        cloud.sh0[gaussianIndex * 3 + 2],
    ];
    const shN = cloud.shN && numCoeffs > 0
        ? cloud.shN.subarray(gaussianIndex * numCoeffs * 3, (gaussianIndex + 1) * numCoeffs * 3)
        : null;
    const px = cloud.positions[gaussianIndex * 3];
    const py = cloud.positions[gaussianIndex * 3 + 1];
    const pz = cloud.positions[gaussianIndex * 3 + 2];
    let dx = px - camera.position[0];
    let dy = py - camera.position[1];
    let dz = pz - camera.position[2];
    const len = Math.hypot(dx, dy, dz);
    if (len > 0) {
        dx /= len;
        dy /= len;
        dz /= len;
    }
    return evalSH(sh0, shN, cloud.shDegree, dx, dy, dz);
}
function createBackgroundBuffer(options, cameraCount, sourceChannels) {
    if (!options.backgrounds) {
        return { backgrounds: new Float32Array(4), backgroundMode: 0 };
    }
    if (options.backgrounds.length === sourceChannels) {
        return { backgrounds: new Float32Array(options.backgrounds), backgroundMode: 1 };
    }
    if (options.backgrounds.length === cameraCount * sourceChannels) {
        return { backgrounds: new Float32Array(options.backgrounds), backgroundMode: 2 };
    }
    throw new Error('backgrounds length must equal sourceChannels or cameraCount * sourceChannels');
}
function uploadUniformBuffer(device, data) {
    return uploadBuffer(device, data, GPUBufferUsage.UNIFORM);
}
function uploadStorageBuffer(device, data) {
    return uploadBuffer(device, data, GPUBufferUsage.STORAGE);
}
function uploadBuffer(device, data, usage) {
    const buffer = device.createBuffer({
        size: Math.max(16, data.byteLength),
        usage: usage | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    if (data.byteLength > 0) {
        new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    }
    buffer.unmap();
    return buffer;
}
async function readFloat32Buffer(buffer, byteLength) {
    await buffer.mapAsync(GPUMapMode.READ, 0, Math.max(16, byteLength));
    try {
        return new Float32Array(buffer.getMappedRange(0, Math.max(16, byteLength)).slice(0, byteLength));
    }
    finally {
        buffer.unmap();
    }
}
function getSourceChannelCount(options) {
    if (options.colors) {
        if (options.colorChannels !== undefined) {
            validatePositiveInteger(options.colorChannels, 'colorChannels');
            if (options.colors.length !== options.cloud.count * options.colorChannels) {
                throw new Error('colors length must equal cloud.count * colorChannels');
            }
            return options.colorChannels;
        }
        if (options.cloud.count <= 0) {
            throw new Error('colorChannels is required when colors are provided for an empty cloud');
        }
        const channels = Math.floor(options.colors.length / options.cloud.count);
        validatePositiveInteger(channels, 'colorChannels');
        if (options.colors.length !== options.cloud.count * channels) {
            throw new Error('colors length must equal cloud.count * colorChannels');
        }
        return channels;
    }
    return 3;
}
function getOutputChannelCount(mode, sourceChannels) {
    if (mode === 'D' || mode === 'ED')
        return 1;
    if (mode === 'RGB+D' || mode === 'RGB+ED')
        return sourceChannels + 1;
    return sourceChannels;
}
function normalizeCameras(viewmats, Ks) {
    const views = splitMatrices(viewmats, 16, 'viewmats');
    const intrinsics = splitMatrices(Ks, 9, 'Ks');
    if (views.length !== intrinsics.length) {
        throw new Error('viewmats and Ks must contain the same number of cameras');
    }
    return views.map((view, index) => ({
        view,
        K: intrinsics[index],
        position: cameraPositionFromView(view),
    }));
}
function splitMatrices(value, size, name) {
    if (Array.isArray(value)) {
        for (const matrix of value) {
            if (matrix.length !== size)
                throw new Error(`${name} matrices must have ${size} values`);
        }
        return value;
    }
    if (value.length % size !== 0)
        throw new Error(`${name} length must be a multiple of ${size}`);
    const matrices = [];
    for (let offset = 0; offset < value.length; offset += size) {
        matrices.push(value.subarray(offset, offset + size));
    }
    return matrices;
}
function cameraPositionFromView(view) {
    const tx = view[12];
    const ty = view[13];
    const tz = view[14];
    return [
        -(view[0] * tx + view[1] * ty + view[2] * tz),
        -(view[4] * tx + view[5] * ty + view[6] * tz),
        -(view[8] * tx + view[9] * ty + view[10] * tz),
    ];
}
function validatePositiveInteger(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
}
