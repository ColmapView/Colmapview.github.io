import {
  noopWebGpuSplatDebugCounterRelease,
  trackWebGpuSplatDebugCounter,
} from './webGpuSplatDebugCounters';
import {
  getWebGpuSplatTelemetryElapsedMs,
  nowWebGpuSplatTelemetryMs,
  recordWebGpuSplatTelemetryEvent,
} from './webGpuSplatTelemetry';

export interface WebGpuPsnrTextureOrigin {
  x: number;
  y: number;
}

export interface WebGpuPsnrTextureComputeOptions {
  device: GPUDevice;
  renderedTexture: GPUTexture;
  groundTruthTexture: GPUTexture;
  width: number;
  height: number;
  renderedOrigin?: WebGpuPsnrTextureOrigin;
  groundTruthOrigin?: WebGpuPsnrTextureOrigin;
}

export interface WebGpuPsnrTextureReduction {
  sumSquaredError: number;
  validPixelCount: number;
}

export interface WebGpuPsnrTextureColorDiagnostics {
  validPixelCount: number;
  validPixelRatio: number;
  renderedMeanRgb: [number, number, number] | null;
  groundTruthMeanRgb: [number, number, number] | null;
  meanRgbDelta: [number, number, number] | null;
}

export interface WebGpuPsnrTextureOffsetCandidate extends WebGpuPsnrTextureResult {
  dx: number;
  dy: number;
}

export interface WebGpuPsnrTextureOffsetDiagnostics {
  maxOffsetPixels: number;
  evaluatedOffsetCount: number;
  baseline: WebGpuPsnrTextureOffsetCandidate;
  best: WebGpuPsnrTextureOffsetCandidate;
  improvementDb: number;
}

export type WebGpuPsnrBackgroundLabel = 'opaque-black' | 'opaque-white';

export interface WebGpuPsnrBackgroundCandidate extends WebGpuPsnrTextureReduction {
  label: WebGpuPsnrBackgroundLabel;
  rgba: [number, number, number, number];
  psnr: number;
  mse: number;
  improvementDb: number;
}

export interface WebGpuPsnrBackgroundDiagnostics {
  baseline: WebGpuPsnrBackgroundCandidate;
  alternatives: WebGpuPsnrBackgroundCandidate[];
  best: WebGpuPsnrBackgroundCandidate;
}

export interface WebGpuPsnrTextureResult extends WebGpuPsnrTextureReduction {
  psnr: number;
  mse: number;
  colorDiagnostics?: WebGpuPsnrTextureColorDiagnostics;
  offsetDiagnostics?: WebGpuPsnrTextureOffsetDiagnostics;
  backgroundDiagnostics?: WebGpuPsnrBackgroundDiagnostics;
}

interface WebGpuPsnrTexturePipelines {
  compare: GPUComputePipeline;
  reduce: GPUComputePipeline;
}

interface WebGpuPsnrTextureDiagnosticPipelines {
  compare: GPUComputePipeline;
  reduce: GPUComputePipeline;
}

const WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE = 64;
const WEBGPU_BUFFER_USAGE_MAP_READ = 0x0001;
const WEBGPU_BUFFER_USAGE_COPY_SRC = 0x0004;
const WEBGPU_BUFFER_USAGE_COPY_DST = 0x0008;
const WEBGPU_BUFFER_USAGE_UNIFORM = 0x0040;
const WEBGPU_BUFFER_USAGE_STORAGE = 0x0080;
const WEBGPU_MAP_MODE_READ = 0x0001;
const UINT32_PAIR_BASE = 0x1_0000_0000;
const FINAL_READBACK_BYTES = 4 * Uint32Array.BYTES_PER_ELEMENT;
const DIAGNOSTIC_READBACK_UINT32_COUNT = 16;
const DIAGNOSTIC_READBACK_BYTES = DIAGNOSTIC_READBACK_UINT32_COUNT * Uint32Array.BYTES_PER_ELEMENT;
const DEFAULT_OFFSET_DIAGNOSTIC_MAX_OFFSET_PIXELS = 2;
const MAX_OFFSET_DIAGNOSTIC_MAX_OFFSET_PIXELS = 8;
const DEFAULT_MAX_COMPUTE_WORKGROUPS_PER_DIMENSION = 65_535;

interface WebGpuPsnrDispatchGrid {
  x: number;
  y: number;
}

const webGpuPsnrTexturePipelines = new WeakMap<GPUDevice, WebGpuPsnrTexturePipelines>();
const webGpuPsnrTextureDiagnosticPipelines = new WeakMap<GPUDevice, WebGpuPsnrTextureDiagnosticPipelines>();

export async function computePsnrFromRgbaTexturesWebGpu({
  device,
  renderedTexture,
  groundTruthTexture,
  width,
  height,
  renderedOrigin,
  groundTruthOrigin,
}: WebGpuPsnrTextureComputeOptions): Promise<WebGpuPsnrTextureResult> {
  return computePsnrFromTextureReduction(
    await computePsnrTextureReductionFromRgbaTexturesWebGpu({
      device,
      renderedTexture,
      groundTruthTexture,
      width,
      height,
      renderedOrigin,
      groundTruthOrigin,
    })
  );
}

export async function computePsnrTextureReductionFromRgbaTexturesWebGpu({
  device,
  renderedTexture,
  groundTruthTexture,
  width,
  height,
  renderedOrigin = { x: 0, y: 0 },
  groundTruthOrigin = { x: 0, y: 0 },
}: WebGpuPsnrTextureComputeOptions): Promise<WebGpuPsnrTextureReduction> {
  const safeWidth = requirePositiveInteger(width, 'width');
  const safeHeight = requirePositiveInteger(height, 'height');
  const pixelCount = safeWidth * safeHeight;
  if (!Number.isSafeInteger(pixelCount)) {
    throw new Error('Invalid WebGPU PSNR texture size: pixel count exceeds safe integer range');
  }

  const pipelines = getWebGpuPsnrTexturePipelines(device);
  const telemetryStart = nowWebGpuSplatTelemetryMs();
  const compareWorkgroupCount = Math.ceil(pixelCount / WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE);
  const compareDispatch = createPsnrDispatchGrid(device, compareWorkgroupCount);
  const partialByteLength = compareWorkgroupCount * 4 * Uint32Array.BYTES_PER_ELEMENT;
  let partialA: GPUBuffer | null = null;
  let partialB: GPUBuffer | null = null;
  let readbackBuffer: GPUBuffer | null = null;
  let releasePartialACounter = noopWebGpuSplatDebugCounterRelease;
  let releasePartialBCounter = noopWebGpuSplatDebugCounterRelease;
  let releaseReadbackCounter = noopWebGpuSplatDebugCounterRelease;
  const paramsBuffers: Array<{ buffer: GPUBuffer; releaseCounter: () => void }> = [];

  try {
    partialA = device.createBuffer({
      size: partialByteLength,
      usage: WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_SRC,
    });
    releasePartialACounter = trackWebGpuSplatDebugCounter('buffers');
    partialB = device.createBuffer({
      size: partialByteLength,
      usage: WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_SRC,
    });
    releasePartialBCounter = trackWebGpuSplatDebugCounter('buffers');
    readbackBuffer = device.createBuffer({
      size: FINAL_READBACK_BYTES,
      usage: WEBGPU_BUFFER_USAGE_MAP_READ | WEBGPU_BUFFER_USAGE_COPY_DST,
    });
    releaseReadbackCounter = trackWebGpuSplatDebugCounter('buffers');

    const commandEncoder = device.createCommandEncoder();
    const compareParams = createAndWriteUniformBuffer(device, new Uint32Array([
      safeWidth,
      safeHeight,
      requireNonNegativeInteger(renderedOrigin.x, 'renderedOrigin.x'),
      requireNonNegativeInteger(renderedOrigin.y, 'renderedOrigin.y'),
      requireNonNegativeInteger(groundTruthOrigin.x, 'groundTruthOrigin.x'),
      requireNonNegativeInteger(groundTruthOrigin.y, 'groundTruthOrigin.y'),
      compareDispatch.x,
      compareWorkgroupCount,
    ]));
    paramsBuffers.push(compareParams);

    const compareBindGroup = device.createBindGroup({
      layout: pipelines.compare.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: renderedTexture.createView() },
        { binding: 1, resource: groundTruthTexture.createView() },
        { binding: 2, resource: { buffer: partialA } },
        { binding: 3, resource: { buffer: compareParams.buffer } },
      ],
    });

    const comparePass = commandEncoder.beginComputePass();
    comparePass.setPipeline(pipelines.compare);
    comparePass.setBindGroup(0, compareBindGroup);
    comparePass.dispatchWorkgroups(compareDispatch.x, compareDispatch.y);
    comparePass.end();

    let inputBuffer = partialA;
    let outputBuffer = partialB;
    let inputCount = compareWorkgroupCount;
    while (inputCount > 1) {
      const outputCount = Math.ceil(inputCount / WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE);
      const reduceDispatch = createPsnrDispatchGrid(device, outputCount);
      const reduceParams = createAndWriteUniformBuffer(device, new Uint32Array([
        inputCount,
        reduceDispatch.x,
        outputCount,
        0,
      ]));
      paramsBuffers.push(reduceParams);
      const reduceBindGroup = device.createBindGroup({
        layout: pipelines.reduce.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inputBuffer } },
          { binding: 1, resource: { buffer: outputBuffer } },
          { binding: 2, resource: { buffer: reduceParams.buffer } },
        ],
      });
      const reducePass = commandEncoder.beginComputePass();
      reducePass.setPipeline(pipelines.reduce);
      reducePass.setBindGroup(0, reduceBindGroup);
      reducePass.dispatchWorkgroups(reduceDispatch.x, reduceDispatch.y);
      reducePass.end();

      inputCount = outputCount;
      const nextInput = outputBuffer;
      outputBuffer = inputBuffer;
      inputBuffer = nextInput;
    }

    commandEncoder.copyBufferToBuffer(inputBuffer, 0, readbackBuffer, 0, FINAL_READBACK_BYTES);
    device.queue.submit([commandEncoder.finish()]);

    const readbackStart = nowWebGpuSplatTelemetryMs();
    await readbackBuffer.mapAsync(WEBGPU_MAP_MODE_READ);
    const readbackDurationMs = getWebGpuSplatTelemetryElapsedMs(readbackStart);
    const result = new Uint32Array(readbackBuffer.getMappedRange().slice(0, FINAL_READBACK_BYTES));
    readbackBuffer.unmap();
    recordWebGpuSplatTelemetryEvent({
      name: 'psnr-reduction',
      durationMs: getWebGpuSplatTelemetryElapsedMs(telemetryStart),
      readbackBytes: FINAL_READBACK_BYTES,
      readbackDurationMs,
      details: {
        width: safeWidth,
        height: safeHeight,
        pixelCount,
        compareWorkgroups: compareWorkgroupCount,
        compareDispatchX: compareDispatch.x,
        compareDispatchY: compareDispatch.y,
      },
    });
    return {
      sumSquaredError: uint32PairToNumber(result[0], result[1], 'squared error'),
      validPixelCount: uint32PairToNumber(result[2], result[3], 'valid pixel count'),
    };
  } finally {
    partialA?.destroy();
    releasePartialACounter();
    partialB?.destroy();
    releasePartialBCounter();
    readbackBuffer?.destroy();
    releaseReadbackCounter();
    for (const { buffer, releaseCounter } of paramsBuffers) {
      buffer.destroy();
      releaseCounter();
    }
  }
}

export async function computePsnrTextureColorDiagnosticsFromRgbaTexturesWebGpu({
  device,
  renderedTexture,
  groundTruthTexture,
  width,
  height,
  renderedOrigin = { x: 0, y: 0 },
  groundTruthOrigin = { x: 0, y: 0 },
}: WebGpuPsnrTextureComputeOptions): Promise<WebGpuPsnrTextureColorDiagnostics> {
  const safeWidth = requirePositiveInteger(width, 'width');
  const safeHeight = requirePositiveInteger(height, 'height');
  const pixelCount = safeWidth * safeHeight;
  if (!Number.isSafeInteger(pixelCount)) {
    throw new Error('Invalid WebGPU PSNR texture size: pixel count exceeds safe integer range');
  }

  const pipelines = getWebGpuPsnrTextureDiagnosticPipelines(device);
  const telemetryStart = nowWebGpuSplatTelemetryMs();
  const compareWorkgroupCount = Math.ceil(pixelCount / WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE);
  const compareDispatch = createPsnrDispatchGrid(device, compareWorkgroupCount);
  const partialByteLength = compareWorkgroupCount * DIAGNOSTIC_READBACK_BYTES;
  let partialA: GPUBuffer | null = null;
  let partialB: GPUBuffer | null = null;
  let readbackBuffer: GPUBuffer | null = null;
  let releasePartialACounter = noopWebGpuSplatDebugCounterRelease;
  let releasePartialBCounter = noopWebGpuSplatDebugCounterRelease;
  let releaseReadbackCounter = noopWebGpuSplatDebugCounterRelease;
  const paramsBuffers: Array<{ buffer: GPUBuffer; releaseCounter: () => void }> = [];

  try {
    partialA = device.createBuffer({
      size: partialByteLength,
      usage: WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_SRC,
    });
    releasePartialACounter = trackWebGpuSplatDebugCounter('buffers');
    partialB = device.createBuffer({
      size: partialByteLength,
      usage: WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_SRC,
    });
    releasePartialBCounter = trackWebGpuSplatDebugCounter('buffers');
    readbackBuffer = device.createBuffer({
      size: DIAGNOSTIC_READBACK_BYTES,
      usage: WEBGPU_BUFFER_USAGE_MAP_READ | WEBGPU_BUFFER_USAGE_COPY_DST,
    });
    releaseReadbackCounter = trackWebGpuSplatDebugCounter('buffers');

    const commandEncoder = device.createCommandEncoder();
    const compareParams = createAndWriteUniformBuffer(device, new Uint32Array([
      safeWidth,
      safeHeight,
      requireNonNegativeInteger(renderedOrigin.x, 'renderedOrigin.x'),
      requireNonNegativeInteger(renderedOrigin.y, 'renderedOrigin.y'),
      requireNonNegativeInteger(groundTruthOrigin.x, 'groundTruthOrigin.x'),
      requireNonNegativeInteger(groundTruthOrigin.y, 'groundTruthOrigin.y'),
      compareDispatch.x,
      compareWorkgroupCount,
    ]));
    paramsBuffers.push(compareParams);

    const compareBindGroup = device.createBindGroup({
      layout: pipelines.compare.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: renderedTexture.createView() },
        { binding: 1, resource: groundTruthTexture.createView() },
        { binding: 2, resource: { buffer: partialA } },
        { binding: 3, resource: { buffer: compareParams.buffer } },
      ],
    });

    const comparePass = commandEncoder.beginComputePass();
    comparePass.setPipeline(pipelines.compare);
    comparePass.setBindGroup(0, compareBindGroup);
    comparePass.dispatchWorkgroups(compareDispatch.x, compareDispatch.y);
    comparePass.end();

    let inputBuffer = partialA;
    let outputBuffer = partialB;
    let inputCount = compareWorkgroupCount;
    while (inputCount > 1) {
      const outputCount = Math.ceil(inputCount / WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE);
      const reduceDispatch = createPsnrDispatchGrid(device, outputCount);
      const reduceParams = createAndWriteUniformBuffer(device, new Uint32Array([
        inputCount,
        reduceDispatch.x,
        outputCount,
        0,
      ]));
      paramsBuffers.push(reduceParams);
      const reduceBindGroup = device.createBindGroup({
        layout: pipelines.reduce.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inputBuffer } },
          { binding: 1, resource: { buffer: outputBuffer } },
          { binding: 2, resource: { buffer: reduceParams.buffer } },
        ],
      });
      const reducePass = commandEncoder.beginComputePass();
      reducePass.setPipeline(pipelines.reduce);
      reducePass.setBindGroup(0, reduceBindGroup);
      reducePass.dispatchWorkgroups(reduceDispatch.x, reduceDispatch.y);
      reducePass.end();

      inputCount = outputCount;
      const nextInput = outputBuffer;
      outputBuffer = inputBuffer;
      inputBuffer = nextInput;
    }

    commandEncoder.copyBufferToBuffer(inputBuffer, 0, readbackBuffer, 0, DIAGNOSTIC_READBACK_BYTES);
    device.queue.submit([commandEncoder.finish()]);

    const readbackStart = nowWebGpuSplatTelemetryMs();
    await readbackBuffer.mapAsync(WEBGPU_MAP_MODE_READ);
    const readbackDurationMs = getWebGpuSplatTelemetryElapsedMs(readbackStart);
    const result = new Uint32Array(readbackBuffer.getMappedRange().slice(0, DIAGNOSTIC_READBACK_BYTES));
    readbackBuffer.unmap();
    recordWebGpuSplatTelemetryEvent({
      name: 'psnr-diagnostics',
      durationMs: getWebGpuSplatTelemetryElapsedMs(telemetryStart),
      readbackBytes: DIAGNOSTIC_READBACK_BYTES,
      readbackDurationMs,
      details: {
        width: safeWidth,
        height: safeHeight,
        pixelCount,
        compareWorkgroups: compareWorkgroupCount,
        compareDispatchX: compareDispatch.x,
        compareDispatchY: compareDispatch.y,
      },
    });
    return createPsnrTextureColorDiagnosticsFromReadback(result, pixelCount);
  } finally {
    partialA?.destroy();
    releasePartialACounter();
    partialB?.destroy();
    releasePartialBCounter();
    readbackBuffer?.destroy();
    releaseReadbackCounter();
    for (const { buffer, releaseCounter } of paramsBuffers) {
      buffer.destroy();
      releaseCounter();
    }
  }
}

export async function computePsnrTextureOffsetDiagnosticsFromRgbaTexturesWebGpu(
  options: WebGpuPsnrTextureComputeOptions & {
    maxOffsetPixels?: number;
  }
): Promise<WebGpuPsnrTextureOffsetDiagnostics> {
  const safeWidth = requirePositiveInteger(options.width, 'width');
  const safeHeight = requirePositiveInteger(options.height, 'height');
  const maxOffsetPixels = requireBoundedOffsetDiagnosticMaxOffset(
    options.maxOffsetPixels ?? DEFAULT_OFFSET_DIAGNOSTIC_MAX_OFFSET_PIXELS
  );
  let baseline: WebGpuPsnrTextureOffsetCandidate | null = null;
  let best: WebGpuPsnrTextureOffsetCandidate | null = null;
  let evaluatedOffsetCount = 0;

  for (let dy = -maxOffsetPixels; dy <= maxOffsetPixels; dy++) {
    for (let dx = -maxOffsetPixels; dx <= maxOffsetPixels; dx++) {
      const overlapWidth = safeWidth - Math.abs(dx);
      const overlapHeight = safeHeight - Math.abs(dy);
      if (overlapWidth <= 0 || overlapHeight <= 0) {
        continue;
      }

      const reduction = await computePsnrTextureReductionFromRgbaTexturesWebGpu({
        ...options,
        width: overlapWidth,
        height: overlapHeight,
        renderedOrigin: {
          x: Math.max(0, dx),
          y: Math.max(0, dy),
        },
        groundTruthOrigin: {
          x: Math.max(0, -dx),
          y: Math.max(0, -dy),
        },
      });
      const candidate: WebGpuPsnrTextureOffsetCandidate = {
        ...computePsnrFromTextureReduction(reduction),
        dx,
        dy,
      };
      evaluatedOffsetCount += 1;
      if (dx === 0 && dy === 0) {
        baseline = candidate;
      }
      if (!best || isBetterOffsetCandidate(candidate, best)) {
        best = candidate;
      }
    }
  }

  if (!baseline || !best) {
    throw new Error('Invalid WebGPU PSNR offset diagnostics: no valid offsets were evaluated');
  }

  return {
    maxOffsetPixels,
    evaluatedOffsetCount,
    baseline,
    best,
    improvementDb: getPsnrImprovementDb(best.psnr, baseline.psnr),
  };
}

export function computePsnrFromTextureReduction({
  sumSquaredError,
  validPixelCount,
}: WebGpuPsnrTextureReduction): WebGpuPsnrTextureResult {
  const safeSumSquaredError = requireNonNegativeSafeInteger(sumSquaredError, 'sumSquaredError');
  const safeValidPixelCount = requireNonNegativeSafeInteger(validPixelCount, 'validPixelCount');
  if (safeValidPixelCount === 0) {
    return {
      sumSquaredError: safeSumSquaredError,
      psnr: NaN,
      mse: NaN,
      validPixelCount: 0,
    };
  }

  const mse = safeSumSquaredError / (safeValidPixelCount * 3);
  if (mse === 0) {
    return {
      sumSquaredError: safeSumSquaredError,
      psnr: Infinity,
      mse,
      validPixelCount: safeValidPixelCount,
    };
  }

  return {
    sumSquaredError: safeSumSquaredError,
    psnr: 10 * Math.log10((255 * 255) / mse),
    mse,
    validPixelCount: safeValidPixelCount,
  };
}

export function accumulatePsnrTextureReductions(
  reductions: Iterable<WebGpuPsnrTextureReduction>
): WebGpuPsnrTextureReduction {
  let sumSquaredError = 0;
  let validPixelCount = 0;

  for (const reduction of reductions) {
    sumSquaredError += requireNonNegativeSafeInteger(reduction.sumSquaredError, 'sumSquaredError');
    validPixelCount += requireNonNegativeSafeInteger(reduction.validPixelCount, 'validPixelCount');
    if (!Number.isSafeInteger(sumSquaredError)) {
      throw new Error('Invalid WebGPU PSNR sumSquaredError: accumulated value exceeds JavaScript safe integer range');
    }
    if (!Number.isSafeInteger(validPixelCount)) {
      throw new Error('Invalid WebGPU PSNR validPixelCount: accumulated value exceeds JavaScript safe integer range');
    }
  }

  return { sumSquaredError, validPixelCount };
}

function createAndWriteUniformBuffer(
  device: GPUDevice,
  data: Uint32Array
): { buffer: GPUBuffer; releaseCounter: () => void } {
  const buffer = device.createBuffer({
    size: Math.max(16, data.byteLength),
    usage: WEBGPU_BUFFER_USAGE_UNIFORM | WEBGPU_BUFFER_USAGE_COPY_DST,
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

function createPsnrDispatchGrid(device: GPUDevice, workgroupCount: number): WebGpuPsnrDispatchGrid {
  const safeWorkgroupCount = requirePositiveInteger(workgroupCount, 'workgroup count');
  const maxWorkgroupsPerDimension = getMaxComputeWorkgroupsPerDimension(device);
  const x = Math.min(safeWorkgroupCount, maxWorkgroupsPerDimension);
  const y = Math.ceil(safeWorkgroupCount / x);
  if (y > maxWorkgroupsPerDimension) {
    throw new Error(
      `Invalid WebGPU PSNR dispatch: ${safeWorkgroupCount} workgroups exceeds ${maxWorkgroupsPerDimension}x${maxWorkgroupsPerDimension} grid`
    );
  }
  return { x, y };
}

function getMaxComputeWorkgroupsPerDimension(device: GPUDevice): number {
  const limit = (device.limits as Partial<GPUSupportedLimits> | undefined)?.maxComputeWorkgroupsPerDimension;
  if (typeof limit === 'number' && Number.isInteger(limit) && limit > 0) {
    return limit;
  }
  return DEFAULT_MAX_COMPUTE_WORKGROUPS_PER_DIMENSION;
}

function getWebGpuPsnrTexturePipelines(device: GPUDevice): WebGpuPsnrTexturePipelines {
  const cached = webGpuPsnrTexturePipelines.get(device);
  if (cached) return cached;

  const compareModule = device.createShaderModule({ code: createTextureCompareShader() });
  const reduceModule = device.createShaderModule({ code: createTextureReduceShader() });
  const pipelines = {
    compare: device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: compareModule,
        entryPoint: 'main',
      },
    }),
    reduce: device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: reduceModule,
        entryPoint: 'main',
      },
    }),
  };
  webGpuPsnrTexturePipelines.set(device, pipelines);
  return pipelines;
}

function getWebGpuPsnrTextureDiagnosticPipelines(device: GPUDevice): WebGpuPsnrTextureDiagnosticPipelines {
  const cached = webGpuPsnrTextureDiagnosticPipelines.get(device);
  if (cached) return cached;

  const compareModule = device.createShaderModule({ code: createTextureDiagnosticCompareShader() });
  const reduceModule = device.createShaderModule({ code: createTextureDiagnosticReduceShader() });
  const pipelines = {
    compare: device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: compareModule,
        entryPoint: 'main',
      },
    }),
    reduce: device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: reduceModule,
        entryPoint: 'main',
      },
    }),
  };
  webGpuPsnrTextureDiagnosticPipelines.set(device, pipelines);
  return pipelines;
}

function createTextureCompareShader(): string {
  return `
struct CompareParams {
  width: u32,
  height: u32,
  renderedOriginX: u32,
  renderedOriginY: u32,
  groundTruthOriginX: u32,
  groundTruthOriginY: u32,
  dispatchX: u32,
  workgroupCount: u32,
}

@group(0) @binding(0) var renderedTexture: texture_2d<f32>;
@group(0) @binding(1) var groundTruthTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> partials: array<vec4<u32>>;
@group(0) @binding(3) var<uniform> params: CompareParams;

var<workgroup> partialSums: array<vec4<u32>, ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}>;

fn rgbaToByte(value: f32) -> i32 {
  return i32(round(clamp(value, 0.0, 1.0) * 255.0));
}

fn addU64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.x + b.x;
  let carry = select(0u, 1u, lo < a.x);
  return vec2<u32>(lo, a.y + b.y + carry);
}

fn addPartial(a: vec4<u32>, b: vec4<u32>) -> vec4<u32> {
  let sum = addU64(a.xy, b.xy);
  let count = addU64(a.zw, b.zw);
  return vec4<u32>(sum.x, sum.y, count.x, count.y);
}

@compute @workgroup_size(${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE})
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let workgroupIndex = workgroupId.y * params.dispatchX + workgroupId.x;
  let pixelIndex = workgroupIndex * ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}u + localId.x;
  let localIndex = localId.x;
  let pixelCount = params.width * params.height;
  var partial = vec4<u32>(0u, 0u, 0u, 0u);

  if (pixelIndex < pixelCount) {
    let x = pixelIndex % params.width;
    let y = pixelIndex / params.width;
    let rendered = textureLoad(
      renderedTexture,
      vec2<i32>(i32(x + params.renderedOriginX), i32(y + params.renderedOriginY)),
      0
    );
    let groundTruth = textureLoad(
      groundTruthTexture,
      vec2<i32>(i32(x + params.groundTruthOriginX), i32(y + params.groundTruthOriginY)),
      0
    );

    if (groundTruth.a > 0.0) {
      let dr = rgbaToByte(rendered.r) - rgbaToByte(groundTruth.r);
      let dg = rgbaToByte(rendered.g) - rgbaToByte(groundTruth.g);
      let db = rgbaToByte(rendered.b) - rgbaToByte(groundTruth.b);
      partial = vec4<u32>(u32(dr * dr + dg * dg + db * db), 0u, 1u, 0u);
    }
  }

  partialSums[localIndex] = partial;
  workgroupBarrier();

  var stride = ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE / 2}u;
  loop {
    if (localIndex < stride) {
      partialSums[localIndex] = addPartial(partialSums[localIndex], partialSums[localIndex + stride]);
    }
    workgroupBarrier();

    if (stride == 1u) {
      break;
    }
    stride = stride / 2u;
  }

  if (localIndex == 0u && workgroupIndex < params.workgroupCount) {
    partials[workgroupIndex] = partialSums[0];
  }
}
`;
}

function createTextureReduceShader(): string {
  return `
struct ReduceParams {
  inputCount: u32,
  dispatchX: u32,
  outputCount: u32,
}

@group(0) @binding(0) var<storage, read> inputPartials: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> outputPartials: array<vec4<u32>>;
@group(0) @binding(2) var<uniform> params: ReduceParams;

var<workgroup> partialSums: array<vec4<u32>, ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}>;

fn addU64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.x + b.x;
  let carry = select(0u, 1u, lo < a.x);
  return vec2<u32>(lo, a.y + b.y + carry);
}

fn addPartial(a: vec4<u32>, b: vec4<u32>) -> vec4<u32> {
  let sum = addU64(a.xy, b.xy);
  let count = addU64(a.zw, b.zw);
  return vec4<u32>(sum.x, sum.y, count.x, count.y);
}

@compute @workgroup_size(${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE})
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let workgroupIndex = workgroupId.y * params.dispatchX + workgroupId.x;
  let index = workgroupIndex * ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}u + localId.x;
  let localIndex = localId.x;
  var partial = vec4<u32>(0u, 0u, 0u, 0u);

  if (index < params.inputCount) {
    partial = inputPartials[index];
  }

  partialSums[localIndex] = partial;
  workgroupBarrier();

  var stride = ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE / 2}u;
  loop {
    if (localIndex < stride) {
      partialSums[localIndex] = addPartial(partialSums[localIndex], partialSums[localIndex + stride]);
    }
    workgroupBarrier();

    if (stride == 1u) {
      break;
    }
    stride = stride / 2u;
  }

  if (localIndex == 0u && workgroupIndex < params.outputCount) {
    outputPartials[workgroupIndex] = partialSums[0];
  }
}
`;
}

function createTextureDiagnosticCompareShader(): string {
  return `
struct CompareParams {
  width: u32,
  height: u32,
  renderedOriginX: u32,
  renderedOriginY: u32,
  groundTruthOriginX: u32,
  groundTruthOriginY: u32,
  dispatchX: u32,
  workgroupCount: u32,
}

struct DiagnosticPartial {
  sumSquaredError: vec2<u32>,
  validPixelCount: vec2<u32>,
  renderedR: vec2<u32>,
  renderedG: vec2<u32>,
  renderedB: vec2<u32>,
  groundTruthR: vec2<u32>,
  groundTruthG: vec2<u32>,
  groundTruthB: vec2<u32>,
}

@group(0) @binding(0) var renderedTexture: texture_2d<f32>;
@group(0) @binding(1) var groundTruthTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> partials: array<DiagnosticPartial>;
@group(0) @binding(3) var<uniform> params: CompareParams;

var<workgroup> partialSums: array<DiagnosticPartial, ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}>;

fn rgbaToByte(value: f32) -> i32 {
  return i32(round(clamp(value, 0.0, 1.0) * 255.0));
}

fn addU64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.x + b.x;
  let carry = select(0u, 1u, lo < a.x);
  return vec2<u32>(lo, a.y + b.y + carry);
}

fn emptyPartial() -> DiagnosticPartial {
  return DiagnosticPartial(
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u)
  );
}

fn addPartial(a: DiagnosticPartial, b: DiagnosticPartial) -> DiagnosticPartial {
  return DiagnosticPartial(
    addU64(a.sumSquaredError, b.sumSquaredError),
    addU64(a.validPixelCount, b.validPixelCount),
    addU64(a.renderedR, b.renderedR),
    addU64(a.renderedG, b.renderedG),
    addU64(a.renderedB, b.renderedB),
    addU64(a.groundTruthR, b.groundTruthR),
    addU64(a.groundTruthG, b.groundTruthG),
    addU64(a.groundTruthB, b.groundTruthB)
  );
}

@compute @workgroup_size(${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE})
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let workgroupIndex = workgroupId.y * params.dispatchX + workgroupId.x;
  let pixelIndex = workgroupIndex * ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}u + localId.x;
  let localIndex = localId.x;
  let pixelCount = params.width * params.height;
  var partial = emptyPartial();

  if (pixelIndex < pixelCount) {
    let x = pixelIndex % params.width;
    let y = pixelIndex / params.width;
    let rendered = textureLoad(
      renderedTexture,
      vec2<i32>(i32(x + params.renderedOriginX), i32(y + params.renderedOriginY)),
      0
    );
    let groundTruth = textureLoad(
      groundTruthTexture,
      vec2<i32>(i32(x + params.groundTruthOriginX), i32(y + params.groundTruthOriginY)),
      0
    );

    if (groundTruth.a > 0.0) {
      let renderedR = rgbaToByte(rendered.r);
      let renderedG = rgbaToByte(rendered.g);
      let renderedB = rgbaToByte(rendered.b);
      let groundTruthR = rgbaToByte(groundTruth.r);
      let groundTruthG = rgbaToByte(groundTruth.g);
      let groundTruthB = rgbaToByte(groundTruth.b);
      let dr = renderedR - groundTruthR;
      let dg = renderedG - groundTruthG;
      let db = renderedB - groundTruthB;
      partial = DiagnosticPartial(
        vec2<u32>(u32(dr * dr + dg * dg + db * db), 0u),
        vec2<u32>(1u, 0u),
        vec2<u32>(u32(renderedR), 0u),
        vec2<u32>(u32(renderedG), 0u),
        vec2<u32>(u32(renderedB), 0u),
        vec2<u32>(u32(groundTruthR), 0u),
        vec2<u32>(u32(groundTruthG), 0u),
        vec2<u32>(u32(groundTruthB), 0u)
      );
    }
  }

  partialSums[localIndex] = partial;
  workgroupBarrier();

  var stride = ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE / 2}u;
  loop {
    if (localIndex < stride) {
      partialSums[localIndex] = addPartial(partialSums[localIndex], partialSums[localIndex + stride]);
    }
    workgroupBarrier();

    if (stride == 1u) {
      break;
    }
    stride = stride / 2u;
  }

  if (localIndex == 0u && workgroupIndex < params.workgroupCount) {
    partials[workgroupIndex] = partialSums[0];
  }
}
`;
}

function createTextureDiagnosticReduceShader(): string {
  return `
struct ReduceParams {
  inputCount: u32,
  dispatchX: u32,
  outputCount: u32,
}

struct DiagnosticPartial {
  sumSquaredError: vec2<u32>,
  validPixelCount: vec2<u32>,
  renderedR: vec2<u32>,
  renderedG: vec2<u32>,
  renderedB: vec2<u32>,
  groundTruthR: vec2<u32>,
  groundTruthG: vec2<u32>,
  groundTruthB: vec2<u32>,
}

@group(0) @binding(0) var<storage, read> inputPartials: array<DiagnosticPartial>;
@group(0) @binding(1) var<storage, read_write> outputPartials: array<DiagnosticPartial>;
@group(0) @binding(2) var<uniform> params: ReduceParams;

var<workgroup> partialSums: array<DiagnosticPartial, ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}>;

fn addU64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.x + b.x;
  let carry = select(0u, 1u, lo < a.x);
  return vec2<u32>(lo, a.y + b.y + carry);
}

fn emptyPartial() -> DiagnosticPartial {
  return DiagnosticPartial(
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u)
  );
}

fn addPartial(a: DiagnosticPartial, b: DiagnosticPartial) -> DiagnosticPartial {
  return DiagnosticPartial(
    addU64(a.sumSquaredError, b.sumSquaredError),
    addU64(a.validPixelCount, b.validPixelCount),
    addU64(a.renderedR, b.renderedR),
    addU64(a.renderedG, b.renderedG),
    addU64(a.renderedB, b.renderedB),
    addU64(a.groundTruthR, b.groundTruthR),
    addU64(a.groundTruthG, b.groundTruthG),
    addU64(a.groundTruthB, b.groundTruthB)
  );
}

@compute @workgroup_size(${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE})
fn main(
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let workgroupIndex = workgroupId.y * params.dispatchX + workgroupId.x;
  let index = workgroupIndex * ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}u + localId.x;
  let localIndex = localId.x;
  var partial = emptyPartial();

  if (index < params.inputCount) {
    partial = inputPartials[index];
  }

  partialSums[localIndex] = partial;
  workgroupBarrier();

  var stride = ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE / 2}u;
  loop {
    if (localIndex < stride) {
      partialSums[localIndex] = addPartial(partialSums[localIndex], partialSums[localIndex + stride]);
    }
    workgroupBarrier();

    if (stride == 1u) {
      break;
    }
    stride = stride / 2u;
  }

  if (localIndex == 0u && workgroupIndex < params.outputCount) {
    outputPartials[workgroupIndex] = partialSums[0];
  }
}
`;
}

function createPsnrTextureColorDiagnosticsFromReadback(
  data: Uint32Array,
  pixelCount: number
): WebGpuPsnrTextureColorDiagnostics {
  if (data.length < DIAGNOSTIC_READBACK_UINT32_COUNT) {
    throw new Error('Invalid WebGPU PSNR diagnostics readback: expected 16 uint32 values');
  }

  const validPixelCount = uint32PairToNumber(data[2], data[3], 'valid pixel count');
  if (validPixelCount === 0) {
    return {
      validPixelCount,
      validPixelRatio: 0,
      renderedMeanRgb: null,
      groundTruthMeanRgb: null,
      meanRgbDelta: null,
    };
  }

  const renderedMeanRgb = [
    uint32PairToNumber(data[4], data[5], 'rendered red sum') / validPixelCount,
    uint32PairToNumber(data[6], data[7], 'rendered green sum') / validPixelCount,
    uint32PairToNumber(data[8], data[9], 'rendered blue sum') / validPixelCount,
  ] as [number, number, number];
  const groundTruthMeanRgb = [
    uint32PairToNumber(data[10], data[11], 'ground truth red sum') / validPixelCount,
    uint32PairToNumber(data[12], data[13], 'ground truth green sum') / validPixelCount,
    uint32PairToNumber(data[14], data[15], 'ground truth blue sum') / validPixelCount,
  ] as [number, number, number];

  return {
    validPixelCount,
    validPixelRatio: validPixelCount / pixelCount,
    renderedMeanRgb,
    groundTruthMeanRgb,
    meanRgbDelta: [
      renderedMeanRgb[0] - groundTruthMeanRgb[0],
      renderedMeanRgb[1] - groundTruthMeanRgb[1],
      renderedMeanRgb[2] - groundTruthMeanRgb[2],
    ],
  };
}

function isBetterOffsetCandidate(
  candidate: WebGpuPsnrTextureOffsetCandidate,
  current: WebGpuPsnrTextureOffsetCandidate
): boolean {
  if (candidate.psnr !== current.psnr) {
    if (Number.isNaN(current.psnr)) return true;
    if (Number.isNaN(candidate.psnr)) return false;
    return candidate.psnr > current.psnr;
  }

  const candidateDistance = Math.abs(candidate.dx) + Math.abs(candidate.dy);
  const currentDistance = Math.abs(current.dx) + Math.abs(current.dy);
  if (candidateDistance !== currentDistance) {
    return candidateDistance < currentDistance;
  }
  if (candidate.dy !== current.dy) {
    return candidate.dy < current.dy;
  }
  return candidate.dx < current.dx;
}

function getPsnrImprovementDb(bestPsnr: number, baselinePsnr: number): number {
  if (Number.isNaN(bestPsnr) || Number.isNaN(baselinePsnr)) {
    return NaN;
  }
  if (bestPsnr === baselinePsnr) {
    return 0;
  }
  if (bestPsnr === Infinity) {
    return Infinity;
  }
  if (baselinePsnr === Infinity) {
    return -Infinity;
  }
  return bestPsnr - baselinePsnr;
}

function uint32PairToNumber(lo: number, hi: number, name: string): number {
  const value = hi * UINT32_PAIR_BASE + lo;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid WebGPU PSNR ${name}: reduced value exceeds JavaScript safe integer range`);
  }
  return value;
}

function requireNonNegativeSafeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid WebGPU PSNR ${name}: expected a non-negative safe integer`);
  }
  return value;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid WebGPU PSNR texture ${name}: expected a positive integer`);
  }
  return value;
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid WebGPU PSNR texture ${name}: expected a non-negative integer`);
  }
  return value;
}

function requireBoundedOffsetDiagnosticMaxOffset(value: number): number {
  const maxOffsetPixels = requireNonNegativeInteger(value, 'maxOffsetPixels');
  if (maxOffsetPixels > MAX_OFFSET_DIAGNOSTIC_MAX_OFFSET_PIXELS) {
    throw new Error(
      `Invalid WebGPU PSNR texture maxOffsetPixels: expected ${MAX_OFFSET_DIAGNOSTIC_MAX_OFFSET_PIXELS} or less`
    );
  }
  return maxOffsetPixels;
}
