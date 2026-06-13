import * as THREE from 'three';
import type { Camera, Image } from '../../types/colmap';
import { CameraModelId } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';
import { getCameraIntrinsics } from '../../utils/cameraIntrinsics';
import { createColmapMetricThreeCamera } from '../../splat/webgpu/cameraFrames';
import {
  ensureSplatPsnrWebGpuDevice,
  subscribeSplatPsnrWebGpuDeviceLoss,
  type PsnrResult,
} from './splatPsnrRuntime';

export {
  ensureSplatPsnrWebGpuDevice,
  getSplatPsnrRenderSize,
  resetSplatPsnrWebGpuDeviceProvider,
  setSplatPsnrWebGpuDeviceProvider,
  SPLAT_PSNR_DEFAULT_MAX_DIMENSION,
  subscribeSplatPsnrWebGpuDeviceLoss,
  type PsnrResult,
  type SplatPsnrWebGpuDeviceProvider,
} from './splatPsnrRuntime';

export const SPLAT_PSNR_UNAVAILABLE_COLOR = '#6b7280';
export const SPLAT_PSNR_RED = '#ef4444';
export const SPLAT_PSNR_ORANGE = '#fb923c';
export const SPLAT_PSNR_YELLOW = '#facc15';
export const SPLAT_PSNR_GREEN = '#22c55e';

export interface SplatMetricColorScale {
  min: number;
  max: number;
}

interface SampledColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface RgbaMetricOptions {
  width: number;
  height: number;
  maskPixels?: Uint8Array | Uint8ClampedArray | null;
}

const keepColor = new THREE.Color();
const WEBGPU_PSNR_WORKGROUP_SIZE = 64;
const GPU_BUFFER_USAGE_MAP_READ = 0x0001;
const GPU_BUFFER_USAGE_COPY_SRC = 0x0004;
const GPU_BUFFER_USAGE_COPY_DST = 0x0008;
const GPU_BUFFER_USAGE_UNIFORM = 0x0040;
const GPU_BUFFER_USAGE_STORAGE = 0x0080;
const GPU_MAP_MODE_READ = 0x0001;
const SSIM_GAUSSIAN_WEIGHTS = [
  0.00102838008448,
  0.00759875813524,
  0.0360007721284,
  0.109360689510,
  0.213005537711,
  0.266011724862,
  0.213005537711,
  0.109360689510,
  0.0360007721284,
  0.00759875813524,
  0.00102838008448,
];
const SSIM_WINDOW_RADIUS = 5;
const SSIM_C1 = 6.5025;
const SSIM_C2 = 58.5225;
const webGpuPsnrPipelines = new WeakMap<GPUDevice, GPUComputePipeline>();

subscribeSplatPsnrWebGpuDeviceLoss((_info, device) => {
  webGpuPsnrPipelines.delete(device);
});

export function hasSplatPsnrValue(psnr: number | null | undefined): psnr is number {
  return psnr !== undefined && psnr !== null && !Number.isNaN(psnr);
}

export function formatSplatPsnrValue(psnr: number | null | undefined): string {
  if (!hasSplatPsnrValue(psnr)) return '--';
  if (psnr >= 99) return '99+';
  return psnr.toFixed(1);
}

export function formatSplatPsnrMetric(psnr: number | null | undefined): string {
  const value = formatSplatPsnrValue(psnr);
  return value === '--' ? 'PSNR --' : `${value} dB PSNR`;
}

export function hasSplatSsimValue(ssim: number | null | undefined): ssim is number {
  return ssim !== undefined && ssim !== null && Number.isFinite(ssim);
}

export function formatSplatSsimValue(ssim: number | null | undefined): string {
  if (!hasSplatSsimValue(ssim)) return '--';
  return ssim.toFixed(3);
}

export function formatSplatSsimMetric(ssim: number | null | undefined): string {
  const value = formatSplatSsimValue(ssim);
  return value === '--' ? 'SSIM --' : `${value} SSIM`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function interpolateHexColor(from: string, to: string, t: number): string {
  const a = new THREE.Color(from);
  const b = new THREE.Color(to);
  keepColor.setRGB(
    lerp(a.r, b.r, t),
    lerp(a.g, b.g, t),
    lerp(a.b, b.b, t)
  );
  return `#${keepColor.getHexString()}`;
}

export function computeSplatMetricColorScale(
  values: Iterable<number | null | undefined>
): SplatMetricColorScale | null {
  let min = Infinity;
  let max = -Infinity;

  for (const value of values) {
    if (value === undefined || value === null || !Number.isFinite(value)) {
      continue;
    }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return min <= max ? { min, max } : null;
}

export function getSplatMetricScaleColor(
  value: number | null | undefined,
  scale: SplatMetricColorScale | null | undefined
): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return SPLAT_PSNR_UNAVAILABLE_COLOR;
  }
  if (value === Infinity) {
    return SPLAT_PSNR_GREEN;
  }
  if (!Number.isFinite(value)) {
    return SPLAT_PSNR_UNAVAILABLE_COLOR;
  }
  if (!scale || !Number.isFinite(scale.min) || !Number.isFinite(scale.max)) {
    return SPLAT_PSNR_UNAVAILABLE_COLOR;
  }
  if (scale.max <= scale.min) {
    return SPLAT_PSNR_GREEN;
  }

  const t = Math.max(0, Math.min(1, (value - scale.min) / (scale.max - scale.min)));
  if (t <= 1 / 3) {
    return interpolateHexColor(SPLAT_PSNR_RED, SPLAT_PSNR_ORANGE, t * 3);
  }
  if (t <= 2 / 3) {
    return interpolateHexColor(SPLAT_PSNR_ORANGE, SPLAT_PSNR_YELLOW, (t - 1 / 3) * 3);
  }
  return interpolateHexColor(SPLAT_PSNR_YELLOW, SPLAT_PSNR_GREEN, (t - 2 / 3) * 3);
}

export function getSplatPsnrColor(psnr: number | null | undefined): string {
  if (psnr === undefined || psnr === null || Number.isNaN(psnr)) {
    return SPLAT_PSNR_UNAVAILABLE_COLOR;
  }
  if (psnr >= 30) return SPLAT_PSNR_GREEN;
  if (psnr >= 25) return interpolateHexColor(SPLAT_PSNR_YELLOW, SPLAT_PSNR_GREEN, (psnr - 25) / 5);
  if (psnr >= 20) return interpolateHexColor(SPLAT_PSNR_ORANGE, SPLAT_PSNR_YELLOW, (psnr - 20) / 5);
  if (psnr >= 10) return interpolateHexColor(SPLAT_PSNR_RED, SPLAT_PSNR_ORANGE, (psnr - 10) / 10);
  return SPLAT_PSNR_RED;
}

export function getSplatSsimColor(ssim: number | null | undefined): string {
  if (!hasSplatSsimValue(ssim)) {
    return SPLAT_PSNR_UNAVAILABLE_COLOR;
  }
  if (ssim >= 0.95) return SPLAT_PSNR_GREEN;
  if (ssim >= 0.9) return interpolateHexColor(SPLAT_PSNR_YELLOW, SPLAT_PSNR_GREEN, (ssim - 0.9) / 0.05);
  if (ssim >= 0.75) return interpolateHexColor(SPLAT_PSNR_ORANGE, SPLAT_PSNR_YELLOW, (ssim - 0.75) / 0.15);
  if (ssim >= 0.5) return interpolateHexColor(SPLAT_PSNR_RED, SPLAT_PSNR_ORANGE, (ssim - 0.5) / 0.25);
  return SPLAT_PSNR_RED;
}

export function computePsnrFromRgba(
  renderedPixels: Uint8Array | Uint8ClampedArray,
  groundTruthPixels: Uint8Array | Uint8ClampedArray
): PsnrResult {
  const pixelCount = Math.min(renderedPixels.length, groundTruthPixels.length) / 4;
  let squaredError = 0;
  let validPixelCount = 0;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    if (groundTruthPixels[offset + 3] === 0) continue;

    const dr = renderedPixels[offset] - groundTruthPixels[offset];
    const dg = renderedPixels[offset + 1] - groundTruthPixels[offset + 1];
    const db = renderedPixels[offset + 2] - groundTruthPixels[offset + 2];
    squaredError += dr * dr + dg * dg + db * db;
    validPixelCount++;
  }

  if (validPixelCount === 0) {
    return { psnr: NaN, mse: NaN, validPixelCount: 0 };
  }

  return computePsnrFromSquaredError(squaredError, validPixelCount);
}

export function computePsnrAndSsimFromRgba(
  renderedPixels: Uint8Array | Uint8ClampedArray,
  groundTruthPixels: Uint8Array | Uint8ClampedArray,
  { width, height, maskPixels = null }: RgbaMetricOptions
): PsnrResult {
  const safeWidth = requirePositiveInteger(width, 'width');
  const safeHeight = requirePositiveInteger(height, 'height');
  const pixelCount = safeWidth * safeHeight;
  const requiredLength = pixelCount * 4;
  if (renderedPixels.length < requiredLength || groundTruthPixels.length < requiredLength) {
    throw new Error('RGBA metric buffers are smaller than the requested image dimensions');
  }
  if (maskPixels && maskPixels.length < requiredLength) {
    throw new Error('RGBA metric mask buffer is smaller than the requested image dimensions');
  }

  let squaredError = 0;
  let validPixelCount = 0;
  let ssimSum = 0;
  let ssimWindowCount = 0;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    if (!isMetricPixelValid(groundTruthPixels, maskPixels, offset)) {
      continue;
    }

    const dr = renderedPixels[offset] - groundTruthPixels[offset];
    const dg = renderedPixels[offset + 1] - groundTruthPixels[offset + 1];
    const db = renderedPixels[offset + 2] - groundTruthPixels[offset + 2];
    squaredError += dr * dr + dg * dg + db * db;
    validPixelCount++;

    const x = pixel % safeWidth;
    const y = Math.floor(pixel / safeWidth);
    ssimSum += computeWindowSsim(renderedPixels, groundTruthPixels, maskPixels, safeWidth, safeHeight, x, y);
    ssimWindowCount++;
  }

  const result = validPixelCount === 0
    ? { psnr: NaN, mse: NaN, validPixelCount: 0 }
    : computePsnrFromSquaredError(squaredError, validPixelCount);
  return ssimWindowCount > 0
    ? { ...result, ssim: Math.max(-1, Math.min(1, ssimSum / ssimWindowCount)) }
    : result;
}

function computePsnrFromSquaredError(squaredError: number, validPixelCount: number): PsnrResult {
  const mse = squaredError / (validPixelCount * 3);
  if (mse === 0) {
    return { psnr: Infinity, mse, validPixelCount };
  }

  return {
    psnr: 10 * Math.log10((255 * 255) / mse),
    mse,
    validPixelCount,
  };
}

function isMetricPixelValid(
  groundTruthPixels: Uint8Array | Uint8ClampedArray,
  maskPixels: Uint8Array | Uint8ClampedArray | null,
  offset: number
): boolean {
  if (groundTruthPixels[offset + 3] === 0) {
    return false;
  }
  if (!maskPixels) {
    return true;
  }

  return maskPixels[offset + 3] > 0
    && Math.max(maskPixels[offset], maskPixels[offset + 1], maskPixels[offset + 2]) > 127;
}

function computeWindowSsim(
  renderedPixels: Uint8Array | Uint8ClampedArray,
  groundTruthPixels: Uint8Array | Uint8ClampedArray,
  maskPixels: Uint8Array | Uint8ClampedArray | null,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  let weightSum = 0;
  const renderedSum = [0, 0, 0];
  const groundTruthSum = [0, 0, 0];
  const renderedSquaredSum = [0, 0, 0];
  const groundTruthSquaredSum = [0, 0, 0];
  const productSum = [0, 0, 0];

  for (let dy = -SSIM_WINDOW_RADIUS; dy <= SSIM_WINDOW_RADIUS; dy++) {
    const sampleY = y + dy;
    if (sampleY < 0 || sampleY >= height) {
      continue;
    }
    const yWeight = SSIM_GAUSSIAN_WEIGHTS[dy + SSIM_WINDOW_RADIUS];
    for (let dx = -SSIM_WINDOW_RADIUS; dx <= SSIM_WINDOW_RADIUS; dx++) {
      const sampleX = x + dx;
      if (sampleX < 0 || sampleX >= width) {
        continue;
      }
      const offset = (sampleY * width + sampleX) * 4;
      if (!isMetricPixelValid(groundTruthPixels, maskPixels, offset)) {
        continue;
      }

      const weight = yWeight * SSIM_GAUSSIAN_WEIGHTS[dx + SSIM_WINDOW_RADIUS];
      weightSum += weight;
      for (let channel = 0; channel < 3; channel++) {
        const rendered = renderedPixels[offset + channel];
        const groundTruth = groundTruthPixels[offset + channel];
        renderedSum[channel] += rendered * weight;
        groundTruthSum[channel] += groundTruth * weight;
        renderedSquaredSum[channel] += rendered * rendered * weight;
        groundTruthSquaredSum[channel] += groundTruth * groundTruth * weight;
        productSum[channel] += rendered * groundTruth * weight;
      }
    }
  }

  if (weightSum <= 0) {
    return 0;
  }

  let ssim = 0;
  for (let channel = 0; channel < 3; channel++) {
    const renderedMean = renderedSum[channel] / weightSum;
    const groundTruthMean = groundTruthSum[channel] / weightSum;
    const renderedVariance = Math.max(0, renderedSquaredSum[channel] / weightSum - renderedMean * renderedMean);
    const groundTruthVariance = Math.max(0, groundTruthSquaredSum[channel] / weightSum - groundTruthMean * groundTruthMean);
    const covariance = productSum[channel] / weightSum - renderedMean * groundTruthMean;
    const numerator = (2 * renderedMean * groundTruthMean + SSIM_C1) * (2 * covariance + SSIM_C2);
    const denominator = (renderedMean * renderedMean + groundTruthMean * groundTruthMean + SSIM_C1)
      * (renderedVariance + groundTruthVariance + SSIM_C2);
    ssim += denominator === 0 ? 1 : numerator / denominator;
  }

  return Math.max(-1, Math.min(1, ssim / 3));
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid RGBA metric ${name}: expected a positive integer`);
  }
  return value;
}

function getWebGpuPsnrPipeline(device: GPUDevice): GPUComputePipeline {
  const cachedPipeline = webGpuPsnrPipelines.get(device);
  if (cachedPipeline) return cachedPipeline;

  const module = device.createShaderModule({
    code: `
struct Params {
  pixelCount: u32,
}

@group(0) @binding(0) var<storage, read> renderedPixels: array<u32>;
@group(0) @binding(1) var<storage, read> groundTruthPixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> partials: array<vec2<u32>>;
@group(0) @binding(3) var<uniform> params: Params;

var<workgroup> sums: array<u32, ${WEBGPU_PSNR_WORKGROUP_SIZE}>;
var<workgroup> counts: array<u32, ${WEBGPU_PSNR_WORKGROUP_SIZE}>;

@compute @workgroup_size(${WEBGPU_PSNR_WORKGROUP_SIZE})
fn main(
  @builtin(global_invocation_id) globalId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let pixelIndex = globalId.x;
  let localIndex = localId.x;
  var squaredError = 0u;
  var validCount = 0u;

  if (pixelIndex < params.pixelCount) {
    let rendered = renderedPixels[pixelIndex];
    let groundTruth = groundTruthPixels[pixelIndex];
    let groundTruthAlpha = (groundTruth >> 24u) & 255u;

    if (groundTruthAlpha != 0u) {
      let dr = i32(rendered & 255u) - i32(groundTruth & 255u);
      let dg = i32((rendered >> 8u) & 255u) - i32((groundTruth >> 8u) & 255u);
      let db = i32((rendered >> 16u) & 255u) - i32((groundTruth >> 16u) & 255u);
      squaredError = u32(dr * dr + dg * dg + db * db);
      validCount = 1u;
    }
  }

  sums[localIndex] = squaredError;
  counts[localIndex] = validCount;
  workgroupBarrier();

  var stride = ${WEBGPU_PSNR_WORKGROUP_SIZE / 2}u;
  loop {
    if (localIndex < stride) {
      sums[localIndex] = sums[localIndex] + sums[localIndex + stride];
      counts[localIndex] = counts[localIndex] + counts[localIndex + stride];
    }
    workgroupBarrier();

    if (stride == 1u) {
      break;
    }
    stride = stride / 2u;
  }

  if (localIndex == 0u) {
    partials[workgroupId.x] = vec2<u32>(sums[0], counts[0]);
  }
}
`,
  });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module,
      entryPoint: 'main',
    },
  });
  webGpuPsnrPipelines.set(device, pipeline);
  return pipeline;
}

function getPixelByteView(
  pixels: Uint8Array | Uint8ClampedArray,
  byteLength: number
): Uint8Array<ArrayBuffer> {
  const view = new Uint8Array(pixels.buffer, pixels.byteOffset, byteLength);
  const copy = new Uint8Array(byteLength);
  copy.set(view);
  return copy;
}

export async function computePsnrFromRgbaWebGpu(
  renderedPixels: Uint8Array | Uint8ClampedArray,
  groundTruthPixels: Uint8Array | Uint8ClampedArray
): Promise<PsnrResult> {
  const pixelCount = Math.floor(Math.min(renderedPixels.length, groundTruthPixels.length) / 4);
  if (pixelCount === 0) {
    return { psnr: NaN, mse: NaN, validPixelCount: 0 };
  }

  const device = await ensureSplatPsnrWebGpuDevice();
  const pipeline = getWebGpuPsnrPipeline(device);
  const pixelByteLength = pixelCount * 4;
  const workgroupCount = Math.ceil(pixelCount / WEBGPU_PSNR_WORKGROUP_SIZE);
  const partialByteLength = workgroupCount * 2 * Uint32Array.BYTES_PER_ELEMENT;

  const renderedBuffer = device.createBuffer({
    size: pixelByteLength,
    usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
  });
  const groundTruthBuffer = device.createBuffer({
    size: pixelByteLength,
    usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
  });
  const partialBuffer = device.createBuffer({
    size: partialByteLength,
    usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_SRC,
  });
  const readbackBuffer = device.createBuffer({
    size: partialByteLength,
    usage: GPU_BUFFER_USAGE_MAP_READ | GPU_BUFFER_USAGE_COPY_DST,
  });
  const paramsBuffer = device.createBuffer({
    size: 16,
    usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
  });

  try {
    device.queue.writeBuffer(renderedBuffer, 0, getPixelByteView(renderedPixels, pixelByteLength));
    device.queue.writeBuffer(groundTruthBuffer, 0, getPixelByteView(groundTruthPixels, pixelByteLength));
    device.queue.writeBuffer(paramsBuffer, 0, new Uint32Array([pixelCount, 0, 0, 0]));

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: renderedBuffer } },
        { binding: 1, resource: { buffer: groundTruthBuffer } },
        { binding: 2, resource: { buffer: partialBuffer } },
        { binding: 3, resource: { buffer: paramsBuffer } },
      ],
    });

    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();
    commandEncoder.copyBufferToBuffer(partialBuffer, 0, readbackBuffer, 0, partialByteLength);
    device.queue.submit([commandEncoder.finish()]);

    await readbackBuffer.mapAsync(GPU_MAP_MODE_READ);
    const partials = new Uint32Array(readbackBuffer.getMappedRange().slice(0));
    readbackBuffer.unmap();

    let squaredError = 0;
    let validPixelCount = 0;
    for (let index = 0; index < partials.length; index += 2) {
      squaredError += partials[index];
      validPixelCount += partials[index + 1];
    }

    if (validPixelCount === 0) {
      return { psnr: NaN, mse: NaN, validPixelCount: 0 };
    }
    return computePsnrFromSquaredError(squaredError, validPixelCount);
  } finally {
    renderedBuffer.destroy();
    groundTruthBuffer.destroy();
    partialBuffer.destroy();
    readbackBuffer.destroy();
    paramsBuffer.destroy();
  }
}

export function createColmapPsnrCamera(
  image: Image,
  camera: Camera,
  width: number,
  height: number,
  transform?: Sim3dEuler,
  near = 0.001,
  far = 10000
): THREE.PerspectiveCamera {
  return createColmapMetricThreeCamera(image, camera, width, height, transform, near, far);
}

function applyDistortion(camera: Camera, x: number, y: number): [number, number] {
  const intrinsics = getCameraIntrinsics(camera);
  const {
    k1,
    k2,
    k3,
    k4,
    k5,
    k6,
    p1,
    p2,
    omega,
    sx1,
    sy1,
  } = intrinsics;
  const modelId = camera.modelId;

  if (modelId === CameraModelId.SIMPLE_PINHOLE || modelId === CameraModelId.PINHOLE) {
    return [x, y];
  }

  const r2 = x * x + y * y;
  const r = Math.sqrt(r2);

  if (modelId === CameraModelId.SIMPLE_RADIAL) {
    const radial = k1 * r2;
    return [x * (1 + radial), y * (1 + radial)];
  }

  if (modelId === CameraModelId.RADIAL) {
    const r4 = r2 * r2;
    const radial = k1 * r2 + k2 * r4;
    return [x * (1 + radial), y * (1 + radial)];
  }

  if (modelId === CameraModelId.OPENCV || modelId === CameraModelId.FULL_OPENCV) {
    const r4 = r2 * r2;
    const r6 = r4 * r2;
    const radial = modelId === CameraModelId.OPENCV
      ? k1 * r2 + k2 * r4
      : (1 + k1 * r2 + k2 * r4 + k3 * r6) / (1 + k4 * r2 + k5 * r4 + k6 * r6) - 1;
    const dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
    const dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;
    return [x * (1 + radial) + dx, y * (1 + radial) + dy];
  }

  if (modelId === CameraModelId.FOV && r > 0.00001) {
    const rd = Math.atan(r * 2 * Math.tan(omega / 2)) / omega;
    const factor = rd / r;
    return [x * factor, y * factor];
  }

  if (
    modelId === CameraModelId.OPENCV_FISHEYE ||
    modelId === CameraModelId.SIMPLE_RADIAL_FISHEYE ||
    modelId === CameraModelId.RADIAL_FISHEYE ||
    modelId === CameraModelId.THIN_PRISM_FISHEYE ||
    modelId === CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE
  ) {
    if (r < 0.00001) return [x, y];

    const theta = Math.atan(r);
    const theta2 = theta * theta;
    const theta4 = theta2 * theta2;
    const theta6 = theta4 * theta2;
    const theta8 = theta4 * theta4;
    let thetaDistorted = theta;

    if (modelId === CameraModelId.SIMPLE_RADIAL_FISHEYE) {
      thetaDistorted = theta * (1 + k1 * theta2);
    } else if (modelId === CameraModelId.RADIAL_FISHEYE) {
      thetaDistorted = theta * (1 + k1 * theta2 + k2 * theta4);
    } else {
      thetaDistorted = theta * (1 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8);
    }

    let xd = x * thetaDistorted / r;
    let yd = y * thetaDistorted / r;

    if (
      modelId === CameraModelId.THIN_PRISM_FISHEYE ||
      modelId === CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE
    ) {
      const r2d = xd * xd + yd * yd;
      const dx = 2 * p1 * xd * yd + p2 * (r2d + 2 * xd * xd) + sx1 * r2d;
      const dy = p1 * (r2d + 2 * yd * yd) + 2 * p2 * xd * yd + sy1 * r2d;
      xd += dx;
      yd += dy;
    }

    return [xd, yd];
  }

  return [x, y];
}

function sampleImageBilinear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): SampledColor {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const wx00 = (1 - tx) * (1 - ty);
  const wx10 = tx * (1 - ty);
  const wx01 = (1 - tx) * ty;
  const wx11 = tx * ty;

  return {
    r: source[i00] * wx00 + source[i10] * wx10 + source[i01] * wx01 + source[i11] * wx11,
    g: source[i00 + 1] * wx00 + source[i10 + 1] * wx10 + source[i01 + 1] * wx01 + source[i11 + 1] * wx11,
    b: source[i00 + 2] * wx00 + source[i10 + 2] * wx10 + source[i01 + 2] * wx01 + source[i11 + 2] * wx11,
    a: source[i00 + 3] * wx00 + source[i10 + 3] * wx10 + source[i01 + 3] * wx01 + source[i11 + 3] * wx11,
  };
}

export function imageCoordinateToImageDataSampleCoordinate(
  imageCoordinate: number,
  sourceScale: number
): number {
  return imageCoordinate * sourceScale - 0.5;
}

function isPinholeCamera(camera: Camera): boolean {
  return camera.modelId === CameraModelId.SIMPLE_PINHOLE || camera.modelId === CameraModelId.PINHOLE;
}

export function createUndistortedGroundTruthPixelsFromImageData(
  sourcePixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  camera: Camera,
  width: number,
  height: number
): Uint8ClampedArray {
  const targetPixels = new Uint8ClampedArray(width * height * 4);
  const intrinsics = getCameraIntrinsics(camera);
  const scaleX = width / camera.width;
  const scaleY = height / camera.height;
  const sourceScaleX = sourceWidth / camera.width;
  const sourceScaleY = sourceHeight / camera.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = (x + 0.5) / scaleX;
      const py = (y + 0.5) / scaleY;
      const xn = (px - intrinsics.cx) / intrinsics.fx;
      const yn = (py - intrinsics.cy) / intrinsics.fy;
      const [xd, yd] = applyDistortion(camera, xn, yn);
      const sampleX = imageCoordinateToImageDataSampleCoordinate(
        xd * intrinsics.fx + intrinsics.cx,
        sourceScaleX
      );
      const sampleY = imageCoordinateToImageDataSampleCoordinate(
        yd * intrinsics.fy + intrinsics.cy,
        sourceScaleY
      );
      const sample = sampleImageBilinear(sourcePixels, sourceWidth, sourceHeight, sampleX, sampleY);
      const offset = (y * width + x) * 4;
      targetPixels[offset] = sample.r;
      targetPixels[offset + 1] = sample.g;
      targetPixels[offset + 2] = sample.b;
      targetPixels[offset + 3] = sample.a;
    }
  }

  return targetPixels;
}

export async function createUndistortedGroundTruthPixels(
  file: File,
  camera: Camera,
  width: number,
  height: number
): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(file);
  try {
    if (isPinholeCamera(camera)) {
      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = width;
      targetCanvas.height = height;
      const targetContext = targetCanvas.getContext('2d', { willReadFrequently: true });
      if (!targetContext) throw new Error('Could not create target canvas context');

      targetContext.imageSmoothingEnabled = true;
      targetContext.imageSmoothingQuality = 'high';
      targetContext.drawImage(bitmap, 0, 0, width, height);
      return targetContext.getImageData(0, 0, width, height).data;
    }

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = bitmap.width;
    sourceCanvas.height = bitmap.height;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) throw new Error('Could not create source canvas context');

    sourceContext.drawImage(bitmap, 0, 0);
    const sourcePixels = sourceContext.getImageData(0, 0, bitmap.width, bitmap.height).data;
    return createUndistortedGroundTruthPixelsFromImageData(
      sourcePixels,
      bitmap.width,
      bitmap.height,
      camera,
      width,
      height
    );
  } finally {
    bitmap.close();
  }
}
