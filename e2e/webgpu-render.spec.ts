import { test, expect } from './fixtures/test-fixtures';

interface BrowserGpuTexture {
  createView(): unknown;
  destroy(): void;
}

interface BrowserGpuBuffer {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface BrowserGpuComputePipeline {
  getBindGroupLayout(index: number): unknown;
}

interface BrowserGpuComputePassEncoder {
  setPipeline(pipeline: BrowserGpuComputePipeline): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  dispatchWorkgroups(count: number): void;
  end(): void;
}

interface BrowserGpuCommandEncoder {
  beginComputePass(): BrowserGpuComputePassEncoder;
  copyBufferToBuffer(
    source: BrowserGpuBuffer,
    sourceOffset: number,
    destination: BrowserGpuBuffer,
    destinationOffset: number,
    size: number
  ): void;
  finish(): unknown;
}

interface BrowserGpuQueue {
  writeBuffer(buffer: BrowserGpuBuffer, offset: number, data: BufferSource): void;
  writeTexture(
    destination: { texture: BrowserGpuTexture },
    data: Uint8Array,
    dataLayout: { bytesPerRow: number; rowsPerImage: number },
    size: { width: number; height: number }
  ): void;
  submit(commandBuffers: unknown[]): void;
  onSubmittedWorkDone(): Promise<void>;
}

interface BrowserGpuDevice {
  createBuffer(descriptor: { size: number; usage: number }): BrowserGpuBuffer;
  createShaderModule(descriptor: { code: string }): unknown;
  createComputePipeline(descriptor: unknown): BrowserGpuComputePipeline;
  createBindGroup(descriptor: unknown): unknown;
  createCommandEncoder(): BrowserGpuCommandEncoder;
  createTexture(descriptor: {
    label?: string;
    size: { width: number; height: number };
    format: string;
    usage: number;
  }): BrowserGpuTexture;
  queue: BrowserGpuQueue;
  destroy(): void;
}

interface BrowserGpuAdapter {
  requestDevice(): Promise<BrowserGpuDevice>;
}

interface BrowserNavigatorWithWebGpu extends Omit<Navigator, 'gpu'> {
  gpu?: {
    requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<BrowserGpuAdapter | null>;
  };
}

interface BrowserPsnrMetric {
  sumSquaredError: number;
  psnr: number;
  mse: number;
  validPixelCount: number;
}

interface BrowserPsnrColorDiagnostics {
  validPixelCount: number;
  validPixelRatio: number;
  renderedMeanRgb: [number, number, number] | null;
  groundTruthMeanRgb: [number, number, number] | null;
  meanRgbDelta: [number, number, number] | null;
}

interface BrowserPsnrOffsetCandidate extends BrowserPsnrMetric {
  dx: number;
  dy: number;
}

interface BrowserPsnrOffsetDiagnostics {
  maxOffsetPixels: number;
  evaluatedOffsetCount: number;
  baseline: BrowserPsnrOffsetCandidate;
  best: BrowserPsnrOffsetCandidate;
  improvementDb: number;
}

interface BrowserSim3dEuler {
  scale: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  translationX: number;
  translationY: number;
  translationZ: number;
}

interface BrowserColmapImage {
  imageId: number;
  qvec: [number, number, number, number];
  tvec: [number, number, number];
  cameraId: number;
  name: string;
  points2D: unknown[];
}

interface BrowserTextureCentroid {
  x: number;
  y: number;
  totalWeight: number;
  litPixelCount: number;
}

interface WebGpuRenderBrowserResult {
  status: 'ok' | 'unavailable' | 'error';
  reason?: string;
  readyState?: string;
  selfMetric?: BrowserPsnrMetric;
  blackMetric?: BrowserPsnrMetric;
  centroids?: {
    centered: BrowserTextureCentroid;
    offCenterPrincipal: BrowserTextureCentroid;
    anisotropicFocal: BrowserTextureCentroid;
  };
  posePerturbation?: {
    metric: BrowserPsnrMetric;
    baselineCentroid: BrowserTextureCentroid;
    perturbedCentroid: BrowserTextureCentroid;
  };
  textureMetrics?: {
    flatColor: BrowserPsnrMetric;
    colorMismatch: BrowserPsnrMetric;
    colorMismatchDiagnostics: BrowserPsnrColorDiagnostics;
    colorSpaceMismatch: BrowserPsnrMetric;
    onePixelOffset: BrowserPsnrMetric;
    onePixelOffsetDiagnostics: BrowserPsnrOffsetDiagnostics;
  };
  sim3dInvariance?: {
    metric: BrowserPsnrMetric;
    identityCentroid: BrowserTextureCentroid;
    transformedCentroid: BrowserTextureCentroid;
  };
}

interface BrowserGaussianCloud {
  count: number;
  positions: Float32Array;
  scales: Float32Array;
  rotations: Float32Array;
  opacities: Float32Array;
  sh0: Float32Array;
  shDegree: number;
}

interface BrowserGaussianSceneResourceManager {
  acquire(
    device: BrowserGpuDevice,
    resource: {
      sceneId: string;
      cloud: BrowserGaussianCloud;
      labelPrefix?: string;
    }
  ): unknown;
  dispose(): void;
}

interface BrowserRendererModule {
  createSplatRenderSession(options: {
    device: BrowserGpuDevice;
    scene: unknown;
    format: string;
    width: number;
    height: number;
    backgroundColor: [number, number, number, number];
    debugValidation?: boolean;
  }): {
    setCamera(frame: unknown): void;
    renderToTexture(target: BrowserGpuTexture): Promise<void>;
    getReadyState(): string;
    dispose(): void;
  };
}

interface BrowserSceneModule {
  GaussianSceneResourceManager: new () => BrowserGaussianSceneResourceManager;
}

interface BrowserCameraModule {
  createColmapMetricWebGpuSplatFrame(options: {
    image: BrowserColmapImage;
    camera: {
      cameraId: number;
      modelId: number;
      width: number;
      height: number;
      params: number[];
    };
    width: number;
    height: number;
    transform?: BrowserSim3dEuler;
  }): unknown;
}

interface BrowserPsnrModule {
  computePsnrFromRgbaTexturesWebGpu(options: {
    device: BrowserGpuDevice;
    renderedTexture: BrowserGpuTexture;
    groundTruthTexture: BrowserGpuTexture;
    width: number;
    height: number;
  }): Promise<BrowserPsnrMetric>;
  computePsnrTextureColorDiagnosticsFromRgbaTexturesWebGpu(options: {
    device: BrowserGpuDevice;
    renderedTexture: BrowserGpuTexture;
    groundTruthTexture: BrowserGpuTexture;
    width: number;
    height: number;
  }): Promise<BrowserPsnrColorDiagnostics>;
  computePsnrTextureOffsetDiagnosticsFromRgbaTexturesWebGpu(options: {
    device: BrowserGpuDevice;
    renderedTexture: BrowserGpuTexture;
    groundTruthTexture: BrowserGpuTexture;
    width: number;
    height: number;
    maxOffsetPixels?: number;
  }): Promise<BrowserPsnrOffsetDiagnostics>;
}

test.describe('WebGPU splat render validation', () => {
  test('renders a synthetic Gaussian to an offscreen texture', async ({ page }) => {
    await page.goto('/e2e-webgpu-harness.html', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate<WebGpuRenderBrowserResult>(async () => {
      const webGpuNavigator = navigator as BrowserNavigatorWithWebGpu;
      if (!webGpuNavigator.gpu) {
        return { status: 'unavailable', reason: 'navigator.gpu is unavailable' };
      }

      let adapter: BrowserGpuAdapter | null = null;
      let device: BrowserGpuDevice | null = null;
      try {
        adapter = await webGpuNavigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) {
          return { status: 'unavailable', reason: 'hardware WebGPU adapter is unavailable' };
        }
        device = await adapter.requestDevice();
      } catch (error) {
        return {
          status: 'unavailable',
          reason: error instanceof Error ? error.message : String(error),
        };
      }

      const rendererModulePath = '/src/splat/webgpu/gaussianRenderer.ts';
      const sceneModulePath = '/src/splat/webgpu/gaussianSceneResourceManager.ts';
      const cameraModulePath = '/src/splat/webgpu/cameraFrames.ts';
      const psnrModulePath = '/src/splat/webgpu/psnrTextureCompute.ts';
      const { createSplatRenderSession } = await import(rendererModulePath) as BrowserRendererModule;
      const { GaussianSceneResourceManager } = await import(sceneModulePath) as BrowserSceneModule;
      const { createColmapMetricWebGpuSplatFrame } = await import(cameraModulePath) as BrowserCameraModule;
      const {
        computePsnrFromRgbaTexturesWebGpu,
        computePsnrTextureColorDiagnosticsFromRgbaTexturesWebGpu,
        computePsnrTextureOffsetDiagnosticsFromRgbaTexturesWebGpu,
      } = await import(psnrModulePath) as BrowserPsnrModule;

      const textureUsageCopyDst = 0x02;
      const textureUsageTextureBinding = 0x04;
      const textureUsageRenderAttachment = 0x10;
      const bufferUsageMapRead = 0x0001;
      const bufferUsageCopySrc = 0x0004;
      const bufferUsageCopyDst = 0x0008;
      const bufferUsageUniform = 0x0040;
      const bufferUsageStorage = 0x0080;
      const mapModeRead = 0x0001;
      const shC0 = 0.28209479177387814;
      const centroidWorkgroupSize = 64;
      const width = 96;
      const height = 64;
      const makeCloud = (
        position: [number, number, number],
        scale = 0.12
      ): BrowserGaussianCloud => ({
        count: 1,
        positions: new Float32Array(position),
        scales: new Float32Array([scale, scale, scale]),
        rotations: new Float32Array([1, 0, 0, 0]),
        opacities: new Float32Array([0.95]),
        sh0: new Float32Array([
          (1.0 - 0.5) / shC0,
          (0.1 - 0.5) / shC0,
          (0.1 - 0.5) / shC0,
        ]),
        shDegree: 0,
      });
      const makeCamera = (params: number[]) => ({
        cameraId: 1,
        modelId: 1,
        width,
        height,
        params,
      });
      const image = {
        imageId: 1,
        qvec: [1, 0, 0, 0] as [number, number, number, number],
        tvec: [0, 0, 0] as [number, number, number],
        cameraId: 1,
        name: 'synthetic.png',
        points2D: [],
      };
      const blackPixels = new Uint8Array(width * height * 4);
      for (let pixel = 0; pixel < width * height; pixel++) {
        blackPixels[pixel * 4 + 3] = 255;
      }
      const makeSolidPixels = (red: number, green: number, blue: number, alpha = 255) => {
        const pixels = new Uint8Array(width * height * 4);
        for (let pixel = 0; pixel < width * height; pixel++) {
          const offset = pixel * 4;
          pixels[offset] = red;
          pixels[offset + 1] = green;
          pixels[offset + 2] = blue;
          pixels[offset + 3] = alpha;
        }
        return pixels;
      };
      const makeSingleRedPixel = (x: number, y: number) => {
        const pixels = makeSolidPixels(0, 0, 0);
        const offset = (y * width + x) * 4;
        pixels[offset] = 255;
        return pixels;
      };

      const uploadTexture = (
        texture: BrowserGpuTexture,
        pixels: Uint8Array
      ) => {
        const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
        const upload = new Uint8Array(bytesPerRow * height);
        for (let y = 0; y < height; y++) {
          upload.set(
            pixels.subarray(y * width * 4, (y + 1) * width * 4),
            y * bytesPerRow
          );
        }
        device!.queue.writeTexture(
          { texture },
          upload,
          { bytesPerRow, rowsPerImage: height },
          { width, height }
        );
      };

      const createAndWriteUniformBuffer = (data: Uint32Array): BrowserGpuBuffer => {
        const buffer = device!.createBuffer({
          size: Math.max(16, data.byteLength),
          usage: bufferUsageUniform | bufferUsageCopyDst,
        });
        const upload = new Uint8Array(data.byteLength);
        upload.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        device!.queue.writeBuffer(buffer, 0, upload);
        return buffer;
      };

      const createCentroidCompareShader = () => `
struct Params {
  width: u32,
  height: u32,
}

@group(0) @binding(0) var renderedTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> partials: array<vec4<u32>>;
@group(0) @binding(2) var<uniform> params: Params;

var<workgroup> partialSums: array<vec4<u32>, ${centroidWorkgroupSize}>;

fn addPartial(a: vec4<u32>, b: vec4<u32>) -> vec4<u32> {
  return vec4<u32>(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w);
}

@compute @workgroup_size(${centroidWorkgroupSize})
fn main(
  @builtin(global_invocation_id) globalId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let pixelIndex = globalId.x;
  let pixelCount = params.width * params.height;
  var partial = vec4<u32>(0u, 0u, 0u, 0u);

  if (pixelIndex < pixelCount) {
    let x = pixelIndex % params.width;
    let y = pixelIndex / params.width;
    let color = textureLoad(renderedTexture, vec2<i32>(i32(x), i32(y)), 0);
    let red = u32(round(clamp(color.r, 0.0, 1.0) * 255.0));
    if (red > 0u) {
      partial = vec4<u32>(red, red * x, red * y, 1u);
    }
  }

  partialSums[localId.x] = partial;
  workgroupBarrier();

  var stride = ${centroidWorkgroupSize / 2}u;
  loop {
    if (localId.x < stride) {
      partialSums[localId.x] = addPartial(partialSums[localId.x], partialSums[localId.x + stride]);
    }
    workgroupBarrier();

    if (stride == 1u) {
      break;
    }
    stride = stride / 2u;
  }

  if (localId.x == 0u) {
    partials[workgroupId.x] = partialSums[0];
  }
}
`;

      const createCentroidReduceShader = () => `
struct Params {
  inputCount: u32,
}

@group(0) @binding(0) var<storage, read> inputPartials: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> outputPartials: array<vec4<u32>>;
@group(0) @binding(2) var<uniform> params: Params;

var<workgroup> partialSums: array<vec4<u32>, ${centroidWorkgroupSize}>;

fn addPartial(a: vec4<u32>, b: vec4<u32>) -> vec4<u32> {
  return vec4<u32>(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w);
}

@compute @workgroup_size(${centroidWorkgroupSize})
fn main(
  @builtin(global_invocation_id) globalId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>
) {
  let index = globalId.x;
  var partial = vec4<u32>(0u, 0u, 0u, 0u);
  if (index < params.inputCount) {
    partial = inputPartials[index];
  }

  partialSums[localId.x] = partial;
  workgroupBarrier();

  var stride = ${centroidWorkgroupSize / 2}u;
  loop {
    if (localId.x < stride) {
      partialSums[localId.x] = addPartial(partialSums[localId.x], partialSums[localId.x + stride]);
    }
    workgroupBarrier();

    if (stride == 1u) {
      break;
    }
    stride = stride / 2u;
  }

  if (localId.x == 0u) {
    outputPartials[workgroupId.x] = partialSums[0];
  }
}
`;

      const centroidComparePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: device.createShaderModule({ code: createCentroidCompareShader() }),
          entryPoint: 'main',
        },
      });
      const centroidReducePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: device.createShaderModule({ code: createCentroidReduceShader() }),
          entryPoint: 'main',
        },
      });

      const computeRedCentroidFromTexture = async (
        texture: BrowserGpuTexture
      ): Promise<BrowserTextureCentroid> => {
        const pixelCount = width * height;
        const compareWorkgroupCount = Math.ceil(pixelCount / centroidWorkgroupSize);
        const partialByteLength = compareWorkgroupCount * 4 * Uint32Array.BYTES_PER_ELEMENT;
        const partialA = device!.createBuffer({
          size: partialByteLength,
          usage: bufferUsageStorage | bufferUsageCopySrc,
        });
        const partialB = device!.createBuffer({
          size: partialByteLength,
          usage: bufferUsageStorage | bufferUsageCopySrc,
        });
        const readbackBuffer = device!.createBuffer({
          size: 4 * Uint32Array.BYTES_PER_ELEMENT,
          usage: bufferUsageMapRead | bufferUsageCopyDst,
        });
        const paramsBuffers: BrowserGpuBuffer[] = [];

        try {
          const commandEncoder = device!.createCommandEncoder();
          const compareParams = createAndWriteUniformBuffer(new Uint32Array([width, height, 0, 0]));
          paramsBuffers.push(compareParams);
          const compareBindGroup = device!.createBindGroup({
            layout: centroidComparePipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: texture.createView() },
              { binding: 1, resource: { buffer: partialA } },
              { binding: 2, resource: { buffer: compareParams } },
            ],
          });

          const comparePass = commandEncoder.beginComputePass();
          comparePass.setPipeline(centroidComparePipeline);
          comparePass.setBindGroup(0, compareBindGroup);
          comparePass.dispatchWorkgroups(compareWorkgroupCount);
          comparePass.end();

          let inputBuffer = partialA;
          let outputBuffer = partialB;
          let inputCount = compareWorkgroupCount;
          while (inputCount > 1) {
            const outputCount = Math.ceil(inputCount / centroidWorkgroupSize);
            const reduceParams = createAndWriteUniformBuffer(new Uint32Array([inputCount, 0, 0, 0]));
            paramsBuffers.push(reduceParams);
            const reduceBindGroup = device!.createBindGroup({
              layout: centroidReducePipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: inputBuffer } },
                { binding: 1, resource: { buffer: outputBuffer } },
                { binding: 2, resource: { buffer: reduceParams } },
              ],
            });
            const reducePass = commandEncoder.beginComputePass();
            reducePass.setPipeline(centroidReducePipeline);
            reducePass.setBindGroup(0, reduceBindGroup);
            reducePass.dispatchWorkgroups(outputCount);
            reducePass.end();

            inputCount = outputCount;
            const nextInput = outputBuffer;
            outputBuffer = inputBuffer;
            inputBuffer = nextInput;
          }

          commandEncoder.copyBufferToBuffer(
            inputBuffer,
            0,
            readbackBuffer,
            0,
            4 * Uint32Array.BYTES_PER_ELEMENT
          );
          device!.queue.submit([commandEncoder.finish()]);
          await readbackBuffer.mapAsync(mapModeRead);
          const data = new Uint32Array(readbackBuffer.getMappedRange().slice(0, 16));
          readbackBuffer.unmap();
          const totalWeight = data[0];
          return {
            x: totalWeight > 0 ? data[1] / totalWeight : Number.NaN,
            y: totalWeight > 0 ? data[2] / totalWeight : Number.NaN,
            totalWeight,
            litPixelCount: data[3],
          };
        } finally {
          partialA.destroy();
          partialB.destroy();
          readbackBuffer.destroy();
          for (const buffer of paramsBuffers) {
            buffer.destroy();
          }
        }
      };

      const resourceManager = new GaussianSceneResourceManager();
      const activeRenderCases: Array<{
        session: ReturnType<BrowserRendererModule['createSplatRenderSession']>;
        texture: BrowserGpuTexture;
      }> = [];
      const scratchTextures: BrowserGpuTexture[] = [];
      let blackTexture: BrowserGpuTexture | null = null;

      try {
        blackTexture = device.createTexture({
          label: 'hardware render smoke black reference',
          size: { width, height },
          format: 'rgba8unorm',
          usage: textureUsageCopyDst | textureUsageTextureBinding,
        });
        uploadTexture(blackTexture, blackPixels);
        const createUploadedTexture = (label: string, pixels: Uint8Array) => {
          const texture = device!.createTexture({
            label,
            size: { width, height },
            format: 'rgba8unorm',
            usage: textureUsageCopyDst | textureUsageTextureBinding,
          });
          uploadTexture(texture, pixels);
          scratchTextures.push(texture);
          return texture;
        };
        const flatRedTexture = createUploadedTexture('psnr exact flat red', makeSolidPixels(255, 0, 0));
        const flatRedGroundTruthTexture = createUploadedTexture('psnr exact flat red gt', makeSolidPixels(255, 0, 0));
        const flatGreenTexture = createUploadedTexture('psnr exact flat green', makeSolidPixels(0, 255, 0));
        const gammaLinearMidGrayTexture = createUploadedTexture(
          'psnr gamma linear-midgray',
          makeSolidPixels(128, 128, 128)
        );
        const gammaSrgbMidGrayTexture = createUploadedTexture(
          'psnr gamma srgb-encoded-midgray',
          makeSolidPixels(188, 188, 188)
        );
        const onePixelRenderedTexture = createUploadedTexture(
          'psnr one-pixel rendered',
          makeSingleRedPixel(Math.floor(width / 2), Math.floor(height / 2))
        );
        const onePixelGroundTruthTexture = createUploadedTexture(
          'psnr one-pixel ground truth',
          makeSingleRedPixel(Math.floor(width / 2) + 1, Math.floor(height / 2))
        );

        const renderCase = async ({
          sceneId,
          position,
          cameraParams,
          imageOverride = image,
          transform,
        }: {
          sceneId: string;
          position: [number, number, number];
          cameraParams: number[];
          imageOverride?: BrowserColmapImage;
          transform?: BrowserSim3dEuler;
        }) => {
          let session: ReturnType<BrowserRendererModule['createSplatRenderSession']> | null = null;
          let renderedTexture: BrowserGpuTexture | null = null;

          try {
            const scene = resourceManager.acquire(device, {
              sceneId,
              cloud: makeCloud(position),
              labelPrefix: sceneId,
            });
            session = createSplatRenderSession({
              device,
              scene,
              format: 'rgba8unorm',
              width,
              height,
              backgroundColor: [0, 0, 0, 1],
              debugValidation: true,
            });
            renderedTexture = device.createTexture({
              label: `${sceneId} target`,
              size: { width, height },
              format: 'rgba8unorm',
              usage: textureUsageTextureBinding | textureUsageRenderAttachment,
            });
            const frame = createColmapMetricWebGpuSplatFrame({
              image: imageOverride,
              camera: makeCamera(cameraParams),
              width,
              height,
              transform,
            });
            session.setCamera(frame);
            await session.renderToTexture(renderedTexture);
            const centroid = await computeRedCentroidFromTexture(renderedTexture);
            activeRenderCases.push({ session, texture: renderedTexture });
            return {
              readyState: session.getReadyState(),
              centroid,
              texture: renderedTexture,
            };
          } catch (error) {
            renderedTexture?.destroy();
            session?.dispose();
            throw error;
          }
        };

        const centered = await renderCase({
          sceneId: 'centered-render-smoke',
          position: [0, 0, 2],
          cameraParams: [80, 80, width / 2, height / 2],
        });
        const offCenterPrincipal = await renderCase({
          sceneId: 'off-center-principal-render-smoke',
          position: [0, 0, 2],
          cameraParams: [80, 80, width / 2 + 10, height / 2 - 7],
        });
        const anisotropicFocal = await renderCase({
          sceneId: 'anisotropic-focal-render-smoke',
          position: [0.2, 0.1, 2],
          cameraParams: [100, 50, width / 2, height / 2],
        });
        const selfMetric = await computePsnrFromRgbaTexturesWebGpu({
          device,
          renderedTexture: centered.texture,
          groundTruthTexture: centered.texture,
          width,
          height,
        });
        const blackMetric = await computePsnrFromRgbaTexturesWebGpu({
          device,
          renderedTexture: centered.texture,
          groundTruthTexture: blackTexture!,
          width,
          height,
        });
        const flatColorMetric = await computePsnrFromRgbaTexturesWebGpu({
          device,
          renderedTexture: flatRedTexture,
          groundTruthTexture: flatRedGroundTruthTexture,
          width,
          height,
        });
        const colorMismatchMetric = await computePsnrFromRgbaTexturesWebGpu({
          device,
          renderedTexture: flatRedTexture,
          groundTruthTexture: flatGreenTexture,
          width,
          height,
        });
        const colorMismatchDiagnostics = await computePsnrTextureColorDiagnosticsFromRgbaTexturesWebGpu({
          device,
          renderedTexture: flatRedTexture,
          groundTruthTexture: flatGreenTexture,
          width,
          height,
        });
        const colorSpaceMismatchMetric = await computePsnrFromRgbaTexturesWebGpu({
          device,
          renderedTexture: gammaLinearMidGrayTexture,
          groundTruthTexture: gammaSrgbMidGrayTexture,
          width,
          height,
        });
        const onePixelOffsetMetric = await computePsnrFromRgbaTexturesWebGpu({
          device,
          renderedTexture: onePixelRenderedTexture,
          groundTruthTexture: onePixelGroundTruthTexture,
          width,
          height,
        });
        const onePixelOffsetDiagnostics = await computePsnrTextureOffsetDiagnosticsFromRgbaTexturesWebGpu({
          device,
          renderedTexture: onePixelRenderedTexture,
          groundTruthTexture: onePixelGroundTruthTexture,
          width,
          height,
          maxOffsetPixels: 1,
        });

        const poseBaseline = await renderCase({
          sceneId: 'pose-baseline-render-smoke',
          position: [0, 0, 2],
          cameraParams: [80, 80, width / 2, height / 2],
        });
        const posePerturbed = await renderCase({
          sceneId: 'pose-perturbed-render-smoke',
          position: [0, 0, 2],
          cameraParams: [80, 80, width / 2, height / 2],
          imageOverride: {
            ...image,
            imageId: 2,
            tvec: [0.35, -0.25, 0],
          },
        });
        const posePerturbationMetric = await computePsnrFromRgbaTexturesWebGpu({
          device,
          renderedTexture: poseBaseline.texture,
          groundTruthTexture: posePerturbed.texture,
          width,
          height,
        });

        const sim3dIdentity = await renderCase({
          sceneId: 'sim3d-identity-render-smoke',
          position: [0.2, 0.1, 2],
          cameraParams: [100, 50, width / 2, height / 2],
        });
        const sim3dTransformed = await renderCase({
          sceneId: 'sim3d-transformed-render-smoke',
          position: [0.2, 0.1, 2],
          cameraParams: [100, 50, width / 2, height / 2],
          transform: {
            scale: 1.8,
            rotationX: -0.25,
            rotationY: 0.4,
            rotationZ: 0.15,
            translationX: -3,
            translationY: 2,
            translationZ: 0.75,
          },
        });
        const sim3dInvarianceMetric = await computePsnrFromRgbaTexturesWebGpu({
          device,
          renderedTexture: sim3dIdentity.texture,
          groundTruthTexture: sim3dTransformed.texture,
          width,
          height,
        });
        await device.queue.onSubmittedWorkDone();

        return {
          status: 'ok',
          readyState: centered.readyState,
          selfMetric,
          blackMetric,
          centroids: {
            centered: centered.centroid,
            offCenterPrincipal: offCenterPrincipal.centroid,
            anisotropicFocal: anisotropicFocal.centroid,
          },
          posePerturbation: {
            metric: posePerturbationMetric,
            baselineCentroid: poseBaseline.centroid,
            perturbedCentroid: posePerturbed.centroid,
          },
          textureMetrics: {
            flatColor: flatColorMetric,
            colorMismatch: colorMismatchMetric,
            colorMismatchDiagnostics,
            colorSpaceMismatch: colorSpaceMismatchMetric,
            onePixelOffset: onePixelOffsetMetric,
            onePixelOffsetDiagnostics,
          },
          sim3dInvariance: {
            metric: sim3dInvarianceMetric,
            identityCentroid: sim3dIdentity.centroid,
            transformedCentroid: sim3dTransformed.centroid,
          },
        };
      } catch (error) {
        return {
          status: 'error',
          reason: error instanceof Error ? error.message : String(error),
        };
      } finally {
        for (const renderCase of activeRenderCases.reverse()) {
          renderCase.texture.destroy();
          renderCase.session.dispose();
        }
        for (const texture of scratchTextures.reverse()) {
          texture.destroy();
        }
        blackTexture?.destroy();
        resourceManager.dispose();
        device.destroy();
      }
    });

    test.skip(result.status === 'unavailable', result.reason ?? 'hardware WebGPU is unavailable');

    expect(result.status, result.reason).toBe('ok');
    expect(result.readyState).toBe('ready');
    expect(result.selfMetric).toMatchObject({
      psnr: Infinity,
      mse: 0,
      validPixelCount: 96 * 64,
    });
    expect(result.blackMetric?.validPixelCount).toBe(96 * 64);
    expect(result.blackMetric?.mse).toBeGreaterThan(0);
    expect(result.blackMetric?.psnr).toBeLessThan(80);
    expect(result.textureMetrics?.flatColor).toMatchObject({
      psnr: Infinity,
      mse: 0,
      validPixelCount: 96 * 64,
    });

    const pixelCount = 96 * 64;
    const expectedColorMismatchMse = (2 * 255 * 255) / 3;
    expect(result.textureMetrics?.colorMismatch.validPixelCount).toBe(pixelCount);
    expect(result.textureMetrics?.colorMismatch.mse).toBeCloseTo(expectedColorMismatchMse);
    expect(result.textureMetrics?.colorMismatch.psnr).toBeCloseTo(
      10 * Math.log10((255 * 255) / expectedColorMismatchMse)
    );
    expect(result.textureMetrics?.colorMismatchDiagnostics).toMatchObject({
      validPixelCount: pixelCount,
      validPixelRatio: 1,
      renderedMeanRgb: [255, 0, 0],
      groundTruthMeanRgb: [0, 255, 0],
      meanRgbDelta: [255, -255, 0],
    });

    const expectedColorSpaceMismatchMse = 60 * 60;
    expect(result.textureMetrics?.colorSpaceMismatch.validPixelCount).toBe(pixelCount);
    expect(result.textureMetrics?.colorSpaceMismatch.mse).toBeCloseTo(expectedColorSpaceMismatchMse);
    expect(result.textureMetrics?.colorSpaceMismatch.psnr).toBeCloseTo(
      10 * Math.log10((255 * 255) / expectedColorSpaceMismatchMse)
    );
    expect(result.textureMetrics?.colorSpaceMismatch.psnr).toBeLessThan(15);

    const expectedOnePixelOffsetMse = (2 * 255 * 255) / (pixelCount * 3);
    expect(result.textureMetrics?.onePixelOffset.validPixelCount).toBe(pixelCount);
    expect(result.textureMetrics?.onePixelOffset.mse).toBeCloseTo(expectedOnePixelOffsetMse);
    expect(result.textureMetrics?.onePixelOffset.psnr).toBeCloseTo(
      10 * Math.log10((255 * 255) / expectedOnePixelOffsetMse)
    );
    expect(result.textureMetrics?.onePixelOffset.psnr).toBeLessThan(45);
    expect(result.textureMetrics?.onePixelOffsetDiagnostics.best).toMatchObject({
      dx: -1,
      dy: 0,
      psnr: Infinity,
    });
    expect(result.textureMetrics?.onePixelOffsetDiagnostics.baseline.psnr).toBeCloseTo(
      result.textureMetrics?.onePixelOffset.psnr ?? Number.NaN
    );
    expect(result.textureMetrics?.onePixelOffsetDiagnostics.improvementDb).toBe(Infinity);

    const expectCentroidClose = (
      actual: BrowserTextureCentroid | undefined,
      expected: { x: number; y: number },
      label: string
    ) => {
      expect(actual, label).toBeDefined();
      expect(actual?.totalWeight, `${label} total weight`).toBeGreaterThan(0);
      expect(actual?.litPixelCount, `${label} lit pixels`).toBeGreaterThan(0);
      expect(Math.abs((actual?.x ?? Number.NaN) - expected.x), `${label} x`).toBeLessThan(3);
      expect(Math.abs((actual?.y ?? Number.NaN) - expected.y), `${label} y`).toBeLessThan(3);
    };

    expectCentroidClose(result.centroids?.centered, { x: 48, y: 32 }, 'centered');
    expectCentroidClose(result.centroids?.offCenterPrincipal, { x: 58, y: 25 }, 'off-center principal');
    expectCentroidClose(result.centroids?.anisotropicFocal, { x: 58, y: 34.5 }, 'anisotropic focal');

    expect(result.posePerturbation?.metric.validPixelCount).toBe(96 * 64);
    expect(result.posePerturbation?.metric.psnr, 'pose perturbation PSNR').toBeLessThan(45);
    expectCentroidClose(result.posePerturbation?.baselineCentroid, { x: 48, y: 32 }, 'pose baseline');
    expectCentroidClose(result.posePerturbation?.perturbedCentroid, { x: 62, y: 22 }, 'pose perturbed');

    expect(result.sim3dInvariance?.metric.validPixelCount).toBe(96 * 64);
    expect(result.sim3dInvariance?.metric.psnr, 'Sim3D invariance PSNR').toBeGreaterThan(50);
    expectCentroidClose(result.sim3dInvariance?.identityCentroid, { x: 58, y: 34.5 }, 'Sim3D identity');
    expectCentroidClose(result.sim3dInvariance?.transformedCentroid, { x: 58, y: 34.5 }, 'Sim3D transformed');
  });
});
