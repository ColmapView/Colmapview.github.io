import {
  trackWebGpuSplatDebugCounter,
} from './webGpuSplatDebugCounters';

export interface WebGpuPsnrGroundTruthTextureOptions {
  device: GPUDevice;
  source: ImageBitmap;
  sourceOrigin?: {
    x: number;
    y: number;
  };
  sourceWidth?: number;
  sourceHeight?: number;
  targetWidth: number;
  targetHeight: number;
}

export interface WebGpuPsnrGroundTruthTexture {
  texture: GPUTexture;
  width: number;
  height: number;
  dispose: () => void;
}

interface WebGpuPsnrGroundTruthResizePipeline {
  pipeline: GPUComputePipeline;
  sampler: GPUSampler;
}

const GPU_BUFFER_USAGE_COPY_DST = 0x0008;
const GPU_BUFFER_USAGE_UNIFORM = 0x0040;
const GPU_TEXTURE_USAGE_COPY_SRC = 0x01;
const GPU_TEXTURE_USAGE_COPY_DST = 0x02;
const GPU_TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const GPU_TEXTURE_USAGE_STORAGE_BINDING = 0x08;
const GPU_TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const RESIZE_WORKGROUP_SIZE = 8;

const resizePipelines = new WeakMap<GPUDevice, WebGpuPsnrGroundTruthResizePipeline>();

export function createWebGpuPsnrGroundTruthTextureFromBitmap({
  device,
  source,
  sourceOrigin = { x: 0, y: 0 },
  sourceWidth = source.width - sourceOrigin.x,
  sourceHeight = source.height - sourceOrigin.y,
  targetWidth,
  targetHeight,
}: WebGpuPsnrGroundTruthTextureOptions): WebGpuPsnrGroundTruthTexture {
  const bitmapWidth = requirePositiveInteger(source.width, 'bitmap width');
  const bitmapHeight = requirePositiveInteger(source.height, 'bitmap height');
  const safeSourceOriginX = requireNonNegativeInteger(sourceOrigin.x, 'source origin x');
  const safeSourceOriginY = requireNonNegativeInteger(sourceOrigin.y, 'source origin y');
  const safeSourceWidth = requirePositiveInteger(sourceWidth, 'source width');
  const safeSourceHeight = requirePositiveInteger(sourceHeight, 'source height');
  const safeTargetWidth = requirePositiveInteger(targetWidth, 'target width');
  const safeTargetHeight = requirePositiveInteger(targetHeight, 'target height');
  if (safeSourceOriginX + safeSourceWidth > bitmapWidth || safeSourceOriginY + safeSourceHeight > bitmapHeight) {
    throw new Error(
      `Invalid WebGPU PSNR ground-truth texture source region: ${safeSourceOriginX},${safeSourceOriginY} ${safeSourceWidth}x${safeSourceHeight} exceeds bitmap ${bitmapWidth}x${bitmapHeight}`
    );
  }

  const sourceTexture = device.createTexture({
    size: { width: safeSourceWidth, height: safeSourceHeight },
    format: 'rgba8unorm',
    usage: GPU_TEXTURE_USAGE_COPY_DST
      | GPU_TEXTURE_USAGE_TEXTURE_BINDING
      | GPU_TEXTURE_USAGE_RENDER_ATTACHMENT,
  });
  const releaseSourceTextureCounter = trackWebGpuSplatDebugCounter('textures');
  try {
    device.queue.copyExternalImageToTexture(
      { source, origin: { x: safeSourceOriginX, y: safeSourceOriginY } },
      { texture: sourceTexture, colorSpace: 'srgb', premultipliedAlpha: false },
      { width: safeSourceWidth, height: safeSourceHeight }
    );
  } catch (error) {
    sourceTexture.destroy();
    releaseSourceTextureCounter();
    throw error;
  }

  if (safeSourceWidth === safeTargetWidth && safeSourceHeight === safeTargetHeight) {
    let disposed = false;
    return {
      texture: sourceTexture,
      width: safeTargetWidth,
      height: safeTargetHeight,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        sourceTexture.destroy();
        releaseSourceTextureCounter();
      },
    };
  }

  const targetTexture = device.createTexture({
    size: { width: safeTargetWidth, height: safeTargetHeight },
    format: 'rgba8unorm',
    usage: GPU_TEXTURE_USAGE_COPY_SRC
      | GPU_TEXTURE_USAGE_TEXTURE_BINDING
      | GPU_TEXTURE_USAGE_STORAGE_BINDING,
  });
  const releaseTargetTextureCounter = trackWebGpuSplatDebugCounter('textures');
  try {
    encodeGroundTruthResizePass({
      device,
      sourceTexture,
      targetTexture,
      sourceWidth: safeSourceWidth,
      sourceHeight: safeSourceHeight,
      targetWidth: safeTargetWidth,
      targetHeight: safeTargetHeight,
    });
  } catch (error) {
    targetTexture.destroy();
    sourceTexture.destroy();
    releaseTargetTextureCounter();
    releaseSourceTextureCounter();
    throw error;
  }

  let disposed = false;
  return {
    texture: targetTexture,
    width: safeTargetWidth,
    height: safeTargetHeight,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      targetTexture.destroy();
      sourceTexture.destroy();
      releaseTargetTextureCounter();
      releaseSourceTextureCounter();
    },
  };
}

function encodeGroundTruthResizePass({
  device,
  sourceTexture,
  targetTexture,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
}: {
  device: GPUDevice;
  sourceTexture: GPUTexture;
  targetTexture: GPUTexture;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}): void {
  const pipeline = getGroundTruthResizePipeline(device);
  const params = new Uint32Array([sourceWidth, sourceHeight, targetWidth, targetHeight]);
  const paramsBuffer = createAndWriteUniformBuffer(device, params);
  try {
    const bindGroup = device.createBindGroup({
      layout: pipeline.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sourceTexture.createView() },
        { binding: 1, resource: pipeline.sampler },
        { binding: 2, resource: targetTexture.createView() },
        { binding: 3, resource: { buffer: paramsBuffer.buffer } },
      ],
    });
    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(targetWidth / RESIZE_WORKGROUP_SIZE),
      Math.ceil(targetHeight / RESIZE_WORKGROUP_SIZE)
    );
    pass.end();
    device.queue.submit([commandEncoder.finish()]);
  } finally {
    paramsBuffer.buffer.destroy();
    paramsBuffer.releaseCounter();
  }
}

function getGroundTruthResizePipeline(device: GPUDevice): WebGpuPsnrGroundTruthResizePipeline {
  const cached = resizePipelines.get(device);
  if (cached) return cached;

  const module = device.createShaderModule({ code: createGroundTruthResizeShader() });
  const pipeline = {
    pipeline: device.createComputePipeline({
      layout: 'auto',
      compute: {
        module,
        entryPoint: 'main',
      },
    }),
    sampler: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    }),
  };
  resizePipelines.set(device, pipeline);
  return pipeline;
}

function createAndWriteUniformBuffer(
  device: GPUDevice,
  data: Uint32Array
): { buffer: GPUBuffer; releaseCounter: () => void } {
  const buffer = device.createBuffer({
    size: Math.max(16, data.byteLength),
    usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
  });
  const releaseCounter = trackWebGpuSplatDebugCounter('buffers');
  try {
    const upload = new Uint8Array(data.byteLength);
    upload.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    device.queue.writeBuffer(buffer, 0, upload);
    return { buffer, releaseCounter };
  } catch (error) {
    buffer.destroy();
    releaseCounter();
    throw error;
  }
}

function createGroundTruthResizeShader(): string {
  return `
struct ResizeParams {
  sourceWidth: u32,
  sourceHeight: u32,
  targetWidth: u32,
  targetHeight: u32,
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var targetTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: ResizeParams;

@compute @workgroup_size(${RESIZE_WORKGROUP_SIZE}, ${RESIZE_WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  if (globalId.x >= params.targetWidth || globalId.y >= params.targetHeight) {
    return;
  }

  let uv = vec2<f32>(
    (f32(globalId.x) + 0.5) / f32(params.targetWidth),
    (f32(globalId.y) + 0.5) / f32(params.targetHeight)
  );
  let color = textureSampleLevel(sourceTexture, sourceSampler, uv, 0.0);
  textureStore(targetTexture, vec2<i32>(i32(globalId.x), i32(globalId.y)), color);
}
`;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid WebGPU PSNR ground-truth texture ${name}: expected a positive integer`);
  }
  return value;
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid WebGPU PSNR ground-truth texture ${name}: expected a non-negative integer`);
  }
  return value;
}
