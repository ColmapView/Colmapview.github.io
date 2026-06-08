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
  maskTexture?: GPUTexture;
  width: number;
  height: number;
  renderedOrigin?: WebGpuPsnrTextureOrigin;
  groundTruthOrigin?: WebGpuPsnrTextureOrigin;
  maskOrigin?: WebGpuPsnrTextureOrigin;
}

export interface WebGpuPsnrTextureReduction {
  sumSquaredError: number;
  validPixelCount: number;
  ssimScaledSum?: number;
  ssimWindowCount?: number;
}

export interface WebGpuPsnrTextureResult extends WebGpuPsnrTextureReduction {
  psnr: number;
  ssim?: number;
  mse: number;
}

interface WebGpuPsnrTexturePipelines {
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
const SSIM_SHIFTED_SCALE = 500_000;
const METRIC_REDUCTION_READBACK_UINT32_COUNT = 8;
const FINAL_READBACK_BYTES = METRIC_REDUCTION_READBACK_UINT32_COUNT * Uint32Array.BYTES_PER_ELEMENT;
const DEFAULT_MAX_COMPUTE_WORKGROUPS_PER_DIMENSION = 65_535;

interface WebGpuPsnrDispatchGrid {
  x: number;
  y: number;
}

const webGpuPsnrTexturePipelines = new WeakMap<GPUDevice, WebGpuPsnrTexturePipelines>();

export async function computePsnrFromRgbaTexturesWebGpu({
  device,
  renderedTexture,
  groundTruthTexture,
  maskTexture,
  width,
  height,
  renderedOrigin,
  groundTruthOrigin,
  maskOrigin,
}: WebGpuPsnrTextureComputeOptions): Promise<WebGpuPsnrTextureResult> {
  return computePsnrFromTextureReduction(
    await computePsnrTextureReductionFromRgbaTexturesWebGpu({
      device,
      renderedTexture,
      groundTruthTexture,
      maskTexture,
      width,
      height,
      renderedOrigin,
      groundTruthOrigin,
      maskOrigin,
    })
  );
}

export async function computePsnrTextureReductionFromRgbaTexturesWebGpu({
  device,
  renderedTexture,
  groundTruthTexture,
  maskTexture,
  width,
  height,
  renderedOrigin = { x: 0, y: 0 },
  groundTruthOrigin = { x: 0, y: 0 },
  maskOrigin = groundTruthOrigin,
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
  const partialByteLength = compareWorkgroupCount * FINAL_READBACK_BYTES;
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
      requireNonNegativeInteger(maskOrigin.x, 'maskOrigin.x'),
      requireNonNegativeInteger(maskOrigin.y, 'maskOrigin.y'),
      maskTexture ? 1 : 0,
      compareDispatch.x,
      compareWorkgroupCount,
      0,
    ]));
    paramsBuffers.push(compareParams);

    const compareBindGroup = device.createBindGroup({
      layout: pipelines.compare.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: renderedTexture.createView() },
        { binding: 1, resource: groundTruthTexture.createView() },
        { binding: 2, resource: (maskTexture ?? groundTruthTexture).createView() },
        { binding: 3, resource: { buffer: partialA } },
        { binding: 4, resource: { buffer: compareParams.buffer } },
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
        masked: Boolean(maskTexture),
        compareWorkgroups: compareWorkgroupCount,
        compareDispatchX: compareDispatch.x,
        compareDispatchY: compareDispatch.y,
      },
    });
    return {
      sumSquaredError: uint32PairToNumber(result[0], result[1], 'squared error'),
      validPixelCount: uint32PairToNumber(result[2], result[3], 'valid pixel count'),
      ssimScaledSum: uint32PairToNumber(result[4], result[5], 'SSIM scaled sum'),
      ssimWindowCount: uint32PairToNumber(result[6], result[7], 'SSIM window count'),
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

export function computePsnrFromTextureReduction({
  sumSquaredError,
  validPixelCount,
  ssimScaledSum,
  ssimWindowCount,
}: WebGpuPsnrTextureReduction): WebGpuPsnrTextureResult {
  const safeSumSquaredError = requireNonNegativeSafeInteger(sumSquaredError, 'sumSquaredError');
  const safeValidPixelCount = requireNonNegativeSafeInteger(validPixelCount, 'validPixelCount');
  const ssim = computeSsimFromTextureReduction({
    ssimScaledSum,
    ssimWindowCount,
  });
  if (safeValidPixelCount === 0) {
    return withOptionalSsim(withOptionalSsimReduction({
      sumSquaredError: safeSumSquaredError,
      psnr: NaN,
      mse: NaN,
      validPixelCount: 0,
    }, {
      ssimScaledSum,
      ssimWindowCount,
    }), ssim);
  }

  const mse = safeSumSquaredError / (safeValidPixelCount * 3);
  if (mse === 0) {
    return withOptionalSsim(withOptionalSsimReduction({
      sumSquaredError: safeSumSquaredError,
      psnr: Infinity,
      mse,
      validPixelCount: safeValidPixelCount,
    }, {
      ssimScaledSum,
      ssimWindowCount,
    }), ssim);
  }

  return withOptionalSsim(withOptionalSsimReduction({
    sumSquaredError: safeSumSquaredError,
    psnr: 10 * Math.log10((255 * 255) / mse),
    mse,
    validPixelCount: safeValidPixelCount,
  }, {
    ssimScaledSum,
    ssimWindowCount,
  }), ssim);
}

export function accumulatePsnrTextureReductions(
  reductions: Iterable<WebGpuPsnrTextureReduction>
): WebGpuPsnrTextureReduction {
  let sumSquaredError = 0;
  let validPixelCount = 0;
  let ssimScaledSum = 0;
  let ssimWindowCount = 0;
  let hasSsimReduction = true;
  let sawReduction = false;

  for (const reduction of reductions) {
    sawReduction = true;
    sumSquaredError += requireNonNegativeSafeInteger(reduction.sumSquaredError, 'sumSquaredError');
    validPixelCount += requireNonNegativeSafeInteger(reduction.validPixelCount, 'validPixelCount');
    if (hasCompleteSsimReduction(reduction)) {
      ssimScaledSum += requireNonNegativeSafeInteger(reduction.ssimScaledSum, 'ssimScaledSum');
      ssimWindowCount += requireNonNegativeSafeInteger(reduction.ssimWindowCount, 'ssimWindowCount');
    } else {
      hasSsimReduction = false;
    }
    if (!Number.isSafeInteger(sumSquaredError)) {
      throw new Error('Invalid WebGPU PSNR sumSquaredError: accumulated value exceeds JavaScript safe integer range');
    }
    if (!Number.isSafeInteger(validPixelCount)) {
      throw new Error('Invalid WebGPU PSNR validPixelCount: accumulated value exceeds JavaScript safe integer range');
    }
    if (!Number.isSafeInteger(ssimScaledSum)) {
      throw new Error('Invalid WebGPU PSNR ssimScaledSum: accumulated value exceeds JavaScript safe integer range');
    }
    if (!Number.isSafeInteger(ssimWindowCount)) {
      throw new Error('Invalid WebGPU PSNR ssimWindowCount: accumulated value exceeds JavaScript safe integer range');
    }
  }

  const result: WebGpuPsnrTextureReduction = { sumSquaredError, validPixelCount };
  if (sawReduction && hasSsimReduction) {
    result.ssimScaledSum = ssimScaledSum;
    result.ssimWindowCount = ssimWindowCount;
  }
  return result;
}

function hasCompleteSsimReduction(
  reduction: WebGpuPsnrTextureReduction
): reduction is WebGpuPsnrTextureReduction & Required<Pick<
  WebGpuPsnrTextureReduction,
  'ssimScaledSum' | 'ssimWindowCount'
>> {
  return reduction.ssimScaledSum !== undefined
    && reduction.ssimWindowCount !== undefined;
}

function computeSsimFromTextureReduction({
  ssimScaledSum,
  ssimWindowCount,
}: Pick<
  WebGpuPsnrTextureReduction,
  'ssimScaledSum' | 'ssimWindowCount'
>): number | undefined {
  if (
    ssimScaledSum === undefined ||
    ssimWindowCount === undefined ||
    ssimWindowCount <= 0
  ) {
    return undefined;
  }

  return Math.max(-1, Math.min(1, ssimScaledSum / (ssimWindowCount * SSIM_SHIFTED_SCALE) - 1));
}

function withOptionalSsim(
  result: WebGpuPsnrTextureResult,
  ssim: number | undefined
): WebGpuPsnrTextureResult {
  if (ssim === undefined) return result;
  return { ...result, ssim };
}

function withOptionalSsimReduction(
  result: WebGpuPsnrTextureResult,
  reduction: Pick<
    WebGpuPsnrTextureReduction,
    'ssimScaledSum' | 'ssimWindowCount'
  >
): WebGpuPsnrTextureResult {
  if (
    reduction.ssimScaledSum === undefined ||
    reduction.ssimWindowCount === undefined
  ) {
    return result;
  }

  return {
    ...result,
    ssimScaledSum: reduction.ssimScaledSum,
    ssimWindowCount: reduction.ssimWindowCount,
  };
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

function createTextureCompareShader(): string {
  return `
struct CompareParams {
  width: u32,
  height: u32,
  renderedOriginX: u32,
  renderedOriginY: u32,
  groundTruthOriginX: u32,
  groundTruthOriginY: u32,
  maskOriginX: u32,
  maskOriginY: u32,
  hasMask: u32,
  dispatchX: u32,
  workgroupCount: u32,
}

@group(0) @binding(0) var renderedTexture: texture_2d<f32>;
@group(0) @binding(1) var groundTruthTexture: texture_2d<f32>;
@group(0) @binding(2) var maskTexture: texture_2d<f32>;
struct MetricPartial {
  sumSquaredError: vec2<u32>,
  validPixelCount: vec2<u32>,
  ssimScaledSum: vec2<u32>,
  ssimWindowCount: vec2<u32>,
}

@group(0) @binding(3) var<storage, read_write> partials: array<MetricPartial>;
@group(0) @binding(4) var<uniform> params: CompareParams;

var<workgroup> partialSums: array<MetricPartial, ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}>;

fn rgbaToByte(value: f32) -> i32 {
  return i32(round(clamp(value, 0.0, 1.0) * 255.0));
}

fn rgbaToByteF32(value: f32) -> f32 {
  return round(clamp(value, 0.0, 1.0) * 255.0);
}

fn gaussianWindowWeight(offset: i32) -> f32 {
  let absOffset = select(-offset, offset, offset >= 0);
  if (absOffset == 0) {
    return 0.266011724862;
  }
  if (absOffset == 1) {
    return 0.213005537711;
  }
  if (absOffset == 2) {
    return 0.109360689510;
  }
  if (absOffset == 3) {
    return 0.0360007721284;
  }
  if (absOffset == 4) {
    return 0.00759875813524;
  }
  if (absOffset == 5) {
    return 0.00102838008448;
  }
  return 0.0;
}

fn textureRgbBytes(textureValue: vec4<f32>) -> vec3<f32> {
  return vec3<f32>(
    rgbaToByteF32(textureValue.r),
    rgbaToByteF32(textureValue.g),
    rgbaToByteF32(textureValue.b)
  );
}

fn isMaskValueValid(maskValue: vec4<f32>) -> bool {
  let maskBrightness = max(maskValue.r, max(maskValue.g, maskValue.b));
  return maskValue.a > 0.0 && maskBrightness > 0.5;
}

fn isSampleValid(x: u32, y: u32, groundTruthValue: vec4<f32>) -> bool {
  if (groundTruthValue.a <= 0.0) {
    return false;
  }
  if (params.hasMask == 0u) {
    return true;
  }
  let maskValue = textureLoad(
    maskTexture,
    vec2<i32>(
      i32(x + params.maskOriginX),
      i32(y + params.maskOriginY)
    ),
    0
  );
  return isMaskValueValid(maskValue);
}

fn computeWindowSsim(x: u32, y: u32) -> f32 {
  var weightSum = 0.0;
  var renderedSum = vec3<f32>(0.0);
  var groundTruthSum = vec3<f32>(0.0);
  var renderedSquaredSum = vec3<f32>(0.0);
  var groundTruthSquaredSum = vec3<f32>(0.0);
  var productSum = vec3<f32>(0.0);
  let baseX = i32(x);
  let baseY = i32(y);
  let width = i32(params.width);
  let height = i32(params.height);

  var dy: i32 = -5;
  loop {
    if (dy > 5) {
      break;
    }
    let sampleY = baseY + dy;
    if (sampleY >= 0 && sampleY < height) {
      let yWeight = gaussianWindowWeight(dy);
      var dx: i32 = -5;
      loop {
        if (dx > 5) {
          break;
        }
        let sampleX = baseX + dx;
        if (sampleX >= 0 && sampleX < width) {
          let sampleGroundTruth = textureLoad(
            groundTruthTexture,
            vec2<i32>(
              sampleX + i32(params.groundTruthOriginX),
              sampleY + i32(params.groundTruthOriginY)
            ),
            0
          );
          if (isSampleValid(u32(sampleX), u32(sampleY), sampleGroundTruth)) {
            let sampleRendered = textureLoad(
              renderedTexture,
              vec2<i32>(
                sampleX + i32(params.renderedOriginX),
                sampleY + i32(params.renderedOriginY)
              ),
              0
            );
            let weight = gaussianWindowWeight(dx) * yWeight;
            let renderedRgb = textureRgbBytes(sampleRendered);
            let groundTruthRgb = textureRgbBytes(sampleGroundTruth);
            weightSum = weightSum + weight;
            renderedSum = renderedSum + renderedRgb * weight;
            groundTruthSum = groundTruthSum + groundTruthRgb * weight;
            renderedSquaredSum = renderedSquaredSum + renderedRgb * renderedRgb * weight;
            groundTruthSquaredSum = groundTruthSquaredSum + groundTruthRgb * groundTruthRgb * weight;
            productSum = productSum + renderedRgb * groundTruthRgb * weight;
          }
        }
        dx = dx + 1;
      }
    }
    dy = dy + 1;
  }

  if (weightSum <= 0.0) {
    return 0.0;
  }

  let renderedMean = renderedSum / weightSum;
  let groundTruthMean = groundTruthSum / weightSum;
  let renderedVariance = max(vec3<f32>(0.0), renderedSquaredSum / weightSum - renderedMean * renderedMean);
  let groundTruthVariance = max(vec3<f32>(0.0), groundTruthSquaredSum / weightSum - groundTruthMean * groundTruthMean);
  let covariance = productSum / weightSum - renderedMean * groundTruthMean;
  let c1 = 6.5025;
  let c2 = 58.5225;
  let numerator = (2.0 * renderedMean * groundTruthMean + vec3<f32>(c1)) * (2.0 * covariance + vec3<f32>(c2));
  let denominator = (renderedMean * renderedMean + groundTruthMean * groundTruthMean + vec3<f32>(c1))
    * (renderedVariance + groundTruthVariance + vec3<f32>(c2));
  let channelSsim = numerator / denominator;
  return clamp((channelSsim.x + channelSsim.y + channelSsim.z) / 3.0, -1.0, 1.0);
}

fn addU64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.x + b.x;
  let carry = select(0u, 1u, lo < a.x);
  return vec2<u32>(lo, a.y + b.y + carry);
}

fn emptyPartial() -> MetricPartial {
  return MetricPartial(
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u)
  );
}

fn addPartial(a: MetricPartial, b: MetricPartial) -> MetricPartial {
  return MetricPartial(
    addU64(a.sumSquaredError, b.sumSquaredError),
    addU64(a.validPixelCount, b.validPixelCount),
    addU64(a.ssimScaledSum, b.ssimScaledSum),
    addU64(a.ssimWindowCount, b.ssimWindowCount)
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

    if (isSampleValid(x, y, groundTruth)) {
      let renderedR = rgbaToByte(rendered.r);
      let renderedG = rgbaToByte(rendered.g);
      let renderedB = rgbaToByte(rendered.b);
      let groundTruthR = rgbaToByte(groundTruth.r);
      let groundTruthG = rgbaToByte(groundTruth.g);
      let groundTruthB = rgbaToByte(groundTruth.b);
      let dr = renderedR - groundTruthR;
      let dg = renderedG - groundTruthG;
      let db = renderedB - groundTruthB;
      let windowSsim = computeWindowSsim(x, y);
      let shiftedScaledSsim = u32(round((windowSsim + 1.0) * ${SSIM_SHIFTED_SCALE}.0));
      partial = MetricPartial(
        vec2<u32>(u32(dr * dr + dg * dg + db * db), 0u),
        vec2<u32>(1u, 0u),
        vec2<u32>(shiftedScaledSsim, 0u),
        vec2<u32>(1u, 0u)
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

function createTextureReduceShader(): string {
  return `
struct ReduceParams {
  inputCount: u32,
  dispatchX: u32,
  outputCount: u32,
}

struct MetricPartial {
  sumSquaredError: vec2<u32>,
  validPixelCount: vec2<u32>,
  ssimScaledSum: vec2<u32>,
  ssimWindowCount: vec2<u32>,
}

@group(0) @binding(0) var<storage, read> inputPartials: array<MetricPartial>;
@group(0) @binding(1) var<storage, read_write> outputPartials: array<MetricPartial>;
@group(0) @binding(2) var<uniform> params: ReduceParams;

var<workgroup> partialSums: array<MetricPartial, ${WEBGPU_PSNR_TEXTURE_WORKGROUP_SIZE}>;

fn addU64(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
  let lo = a.x + b.x;
  let carry = select(0u, 1u, lo < a.x);
  return vec2<u32>(lo, a.y + b.y + carry);
}

fn emptyPartial() -> MetricPartial {
  return MetricPartial(
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u),
    vec2<u32>(0u, 0u)
  );
}

fn addPartial(a: MetricPartial, b: MetricPartial) -> MetricPartial {
  return MetricPartial(
    addU64(a.sumSquaredError, b.sumSquaredError),
    addU64(a.validPixelCount, b.validPixelCount),
    addU64(a.ssimScaledSum, b.ssimScaledSum),
    addU64(a.ssimWindowCount, b.ssimWindowCount)
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
