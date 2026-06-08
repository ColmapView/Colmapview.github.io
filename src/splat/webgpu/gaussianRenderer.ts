import {
  createGPUOutputModule,
  createGPUProjectionModule,
  createGPURasterModule,
  createGPUSortModule,
  createRenderTargets,
  destroyRenderTargets,
  type GPUCompositeUniforms,
  type GPUOutputAlgorithm,
  type GPUOutputModule,
  type GPUProjectionAlgorithm,
  type GPUProjectionModule,
  type GPUProjectionUniforms,
  type GPURasterAlgorithm,
  type GPURasterModule,
  type GPURasterUniforms,
  type GPUSortAlgorithm,
  type GPUSortModule,
  type RenderTargets,
} from 'gs-toolbox';
import type { WebGpuSplatCameraFrame } from './cameraFrames';
import type { WebGpuGaussianCloudBounds } from './gaussianCloudPacking';
import type { GpuGaussianSceneRef } from './gaussianSceneResourceManager';
import {
  assertWebGpuDeviceMeetsSplatRequiredLimits,
  getWebGpuSplatRendererRequiredLimitsForCount,
} from './webGpuSplatLimits';
import {
  noopWebGpuSplatDebugCounterRelease,
  trackWebGpuSplatDebugCounter,
} from './webGpuSplatDebugCounters';
import {
  getWebGpuSplatTelemetryElapsedMs,
  nowWebGpuSplatTelemetryMs,
  recordWebGpuSplatTelemetryEvent,
} from './webGpuSplatTelemetry';
import {
  getWebGpuSplatDefaultBackgroundColor,
  type WebGpuSplatBackgroundColor,
} from './splatRenderBackground';

const GPU_BUFFER_USAGE_COPY_SRC = 0x0004;
const GPU_BUFFER_USAGE_COPY_DST = 0x0008;
const GPU_BUFFER_USAGE_STORAGE = 0x0080;
const MIN_GPU_BUFFER_BYTES = 16;
const SPLAT_DATA_BYTES = 48;
const U32_BYTES = Uint32Array.BYTES_PER_ELEMENT;

export type SplatRenderReadyState = 'idle' | 'initializing' | 'ready' | 'failed';
export type SplatCameraFrame = WebGpuSplatCameraFrame;

export interface SplatRendererPipelineBuffers {
  splatData: GPUBuffer;
  depths: GPUBuffer;
  indices: GPUBuffer;
}

export type SplatRenderCompletion = 'submitted' | 'completed';

export interface SplatRenderToTextureOptions {
  completion?: SplatRenderCompletion;
}

export interface SplatRenderSession {
  setCamera: (frame: SplatCameraFrame) => void;
  setBackgroundColor: (backgroundColor: WebGpuSplatBackgroundColor) => void;
  resize: (pixelWidth: number, pixelHeight: number) => void;
  renderToCanvas: (options?: SplatRenderToTextureOptions) => Promise<void>;
  renderToTexture: (target: GPUTexture, options?: SplatRenderToTextureOptions) => Promise<void>;
  getReadyState: () => SplatRenderReadyState;
  onFirstFrame: (callback: () => void) => () => void;
  dispose: () => void;
}

export interface SplatRenderSessionOptions {
  device: GPUDevice;
  scene: GpuGaussianSceneRef;
  format: GPUTextureFormat;
  canvasContext?: GPUCanvasContext | null;
  width?: number;
  height?: number;
  backgroundColor?: WebGpuSplatBackgroundColor;
  projectionAlgorithm?: GPUProjectionAlgorithm;
  sortAlgorithm?: GPUSortAlgorithm;
  rasterAlgorithm?: GPURasterAlgorithm;
  outputAlgorithm?: GPUOutputAlgorithm;
  debugValidation?: boolean;
  deps?: SplatRenderSessionDeps;
}

export interface SplatRenderSessionDeps {
  createProjectionModule?: typeof createGPUProjectionModule;
  createSortModule?: typeof createGPUSortModule;
  createRasterModule?: typeof createGPURasterModule;
  createOutputModule?: typeof createGPUOutputModule;
  createRenderTargets?: typeof createRenderTargets;
  destroyRenderTargets?: typeof destroyRenderTargets;
}

export function createSplatRenderSession(options: SplatRenderSessionOptions): SplatRenderSession {
  return new DefaultSplatRenderSession(options);
}

class DefaultSplatRenderSession implements SplatRenderSession {
  private readonly device: GPUDevice;
  private readonly scene: GpuGaussianSceneRef;
  private readonly format: GPUTextureFormat;
  private readonly canvasContext: GPUCanvasContext | null;
  private backgroundColor: WebGpuSplatBackgroundColor;
  private readonly destroyRenderTargets: typeof destroyRenderTargets;
  private readonly renderTargetsFactory: typeof createRenderTargets;
  private readonly projectionModule: GPUProjectionModule;
  private readonly sortModule: GPUSortModule;
  private readonly rasterModule: GPURasterModule;
  private readonly outputModule: GPUOutputModule;
  private readonly debugValidation: boolean;
  private readonly pipelineBuffers: SplatRendererPipelineBuffers;
  private readonly firstFrameCallbacks = new Set<() => void>();
  private releaseRenderSessionCounter = noopWebGpuSplatDebugCounterRelease;
  private releasePipelineBufferCounters = noopWebGpuSplatDebugCounterRelease;
  private releaseRenderTargetTextureCounters = noopWebGpuSplatDebugCounterRelease;
  private renderTargets: RenderTargets | null = null;
  private frame: SplatCameraFrame | null = null;
  private sortedDepthAxis: Vec3Tuple | null = null;
  private readonly createdAtMs = nowWebGpuSplatTelemetryMs();
  private readyState: SplatRenderReadyState = 'idle';
  private firstFrameReported = false;
  private disposed = false;

  constructor({
    device,
    scene,
    format,
    canvasContext = null,
    width = 1,
    height = 1,
    backgroundColor = getWebGpuSplatDefaultBackgroundColor(),
    projectionAlgorithm = 'preprocess',
    sortAlgorithm = 'radix-16bit',
    rasterAlgorithm = 'billboard-ftb',
    outputAlgorithm = 'composite',
    debugValidation = false,
    deps = {},
  }: SplatRenderSessionOptions) {
    this.device = device;
    this.scene = scene;
    this.format = format;
    this.canvasContext = canvasContext;
    this.backgroundColor = copyBackgroundColor(backgroundColor);
    this.renderTargetsFactory = deps.createRenderTargets ?? createRenderTargets;
    this.destroyRenderTargets = deps.destroyRenderTargets ?? destroyRenderTargets;
    this.debugValidation = debugValidation;
    this.readyState = 'initializing';
    this.pipelineBuffers = createSplatRendererPipelineBuffers(device, scene.count);
    this.releasePipelineBufferCounters = trackWebGpuSplatDebugCounter('buffers', 3);
    this.projectionModule = (deps.createProjectionModule ?? createGPUProjectionModule)(projectionAlgorithm, device);
    this.sortModule = (deps.createSortModule ?? createGPUSortModule)(sortAlgorithm, device);
    this.rasterModule = (deps.createRasterModule ?? createGPURasterModule)(rasterAlgorithm, device);
    this.outputModule = (deps.createOutputModule ?? createGPUOutputModule)(outputAlgorithm, device);

    this.configurePipeline();
    this.resize(width, height);
    this.releaseRenderSessionCounter = trackWebGpuSplatDebugCounter('renderSessions');
  }

  setCamera(frame: SplatCameraFrame): void {
    this.assertNotDisposed();
    getCameraModel(frame.camera.kind);
    this.frame = frame;
    this.resize(frame.viewport.pixelWidth, frame.viewport.pixelHeight);
  }

  setBackgroundColor(backgroundColor: WebGpuSplatBackgroundColor): void {
    this.assertNotDisposed();
    this.backgroundColor = copyBackgroundColor(backgroundColor);
  }

  resize(pixelWidth: number, pixelHeight: number): void {
    this.assertNotDisposed();
    const width = requirePositiveInteger(pixelWidth, 'pixelWidth');
    const height = requirePositiveInteger(pixelHeight, 'pixelHeight');
    if (this.renderTargets?.width === width && this.renderTargets.height === height) {
      return;
    }

    this.disposeRenderTargets();
    this.renderTargets = this.renderTargetsFactory(this.device, width, height, this.format);
    this.releaseRenderTargetTextureCounters = trackWebGpuSplatDebugCounter(
      'textures',
      countRenderTargetTextures(this.renderTargets)
    );
    this.configureRasterAndOutput();
  }

  async renderToCanvas(
    options: SplatRenderToTextureOptions = {}
  ): Promise<void> {
    this.assertNotDisposed();
    if (!this.canvasContext) {
      throw new Error('Splat render session has no canvas context');
    }

    const target = this.canvasContext.getCurrentTexture();
    await this.renderToTarget(target, {
      targetKind: 'canvas',
      completion: options.completion ?? 'completed',
    });
  }

  async renderToTexture(
    target: GPUTexture,
    options: SplatRenderToTextureOptions = {}
  ): Promise<void> {
    await this.renderToTarget(target, {
      targetKind: 'texture',
      completion: options.completion ?? 'completed',
    });
  }

  private async renderToTarget(
    target: GPUTexture,
    options: {
      targetKind: 'canvas' | 'texture';
      completion: SplatRenderCompletion;
    }
  ): Promise<void> {
    this.assertNotDisposed();
    if (!this.frame) {
      throw new Error('Splat render session requires a camera before rendering');
    }
    if (!this.renderTargets) {
      this.resize(this.frame.viewport.pixelWidth, this.frame.viewport.pixelHeight);
    }

    const telemetryStart = nowWebGpuSplatTelemetryMs();
    try {
      const renderTargets = this.requireRenderTargets();
      const shouldSort = this.shouldSortFrame(this.frame);
      const projectionUniforms = createSplatProjectionUniforms(this.frame, this.scene, {
        writeIndices: shouldSort,
      });
      const rasterUniforms = createSplatRasterUniforms(this.frame, this.scene);
      const outputUniforms = createSplatOutputUniforms(this.frame, this.backgroundColor);

      this.projectionModule.setUniforms(projectionUniforms);
      this.rasterModule.setUniforms(rasterUniforms);
      this.outputModule.setUniforms(outputUniforms);

      const validationScope = this.debugValidation ? beginValidationScope(this.device) : false;
      const encoder = this.device.createCommandEncoder();
      this.projectionModule.execute(encoder);
      if (shouldSort) {
        this.sortModule.execute(encoder);
        this.sortedDepthAxis = getSplatDepthAxis(this.frame);
      }
      this.rasterModule.execute(
        encoder,
        renderTargets.colorView,
        renderTargets.depthView ?? undefined,
        { r: 0, g: 0, b: 0, a: 0 },
        'clear'
      );
      this.outputModule.execute(encoder, target.createView());
      this.device.queue.submit([encoder.finish()]);

      if (options.completion === 'completed' || validationScope) {
        await waitForSubmittedWork(this.device);
      }
      await assertValidationScope(this.device, validationScope);
      recordWebGpuSplatTelemetryEvent({
        name: 'render',
        durationMs: getWebGpuSplatTelemetryElapsedMs(telemetryStart),
        details: {
          target: options.targetKind,
          completion: options.completion,
          width: this.frame.viewport.pixelWidth,
          height: this.frame.viewport.pixelHeight,
          count: this.scene.count,
          shDegree: this.scene.shDegree,
          sorted: shouldSort,
        },
      });
      this.reportFirstFrame();
    } catch (error) {
      this.readyState = 'failed';
      throw error;
    }
  }

  getReadyState(): SplatRenderReadyState {
    return this.readyState;
  }

  onFirstFrame(callback: () => void): () => void {
    if (this.firstFrameReported) {
      callback();
      return () => undefined;
    }

    this.firstFrameCallbacks.add(callback);
    return () => {
      this.firstFrameCallbacks.delete(callback);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.projectionModule.destroy();
    this.sortModule.destroy();
    this.rasterModule.destroy();
    this.outputModule.destroy();
    this.pipelineBuffers.splatData.destroy();
    this.pipelineBuffers.depths.destroy();
    this.pipelineBuffers.indices.destroy();
    this.releasePipelineBufferCounters();
    this.disposeRenderTargets();
    this.scene.release();
    this.releaseRenderSessionCounter();
  }

  private configurePipeline(): void {
    this.projectionModule.configure({
      count: this.scene.count,
      buffers: {
        gaussians: this.scene.gaussianBuffer as GPUBuffer,
        ...(this.scene.shDegree > 0 ? { shCoeffs: this.scene.shBuffer as GPUBuffer } : {}),
        splatData: this.pipelineBuffers.splatData,
        depths: this.pipelineBuffers.depths,
        indices: this.pipelineBuffers.indices,
      },
    });
    this.sortModule.configure({
      count: this.scene.count,
      buffers: {
        depth: this.pipelineBuffers.depths,
        index: this.pipelineBuffers.indices,
      },
    });
  }

  private configureRasterAndOutput(): void {
    const renderTargets = this.requireRenderTargets();
    this.rasterModule.configure({
      count: this.scene.count,
      buffers: {
        sortedIndices: this.pipelineBuffers.indices,
        splatData: this.pipelineBuffers.splatData,
      },
      format: renderTargets.format,
    });
    this.outputModule.configure({
      buffers: renderTargets.output,
      format: this.format,
    });
  }

  private requireRenderTargets(): RenderTargets {
    if (!this.renderTargets) {
      throw new Error('Splat render session has no render targets');
    }
    return this.renderTargets;
  }

  private disposeRenderTargets(): void {
    if (!this.renderTargets) {
      return;
    }

    const renderTargets = this.renderTargets;
    const releaseTextureCounters = this.releaseRenderTargetTextureCounters;
    this.renderTargets = null;
    this.releaseRenderTargetTextureCounters = noopWebGpuSplatDebugCounterRelease;
    try {
      this.destroyRenderTargets(renderTargets);
    } finally {
      releaseTextureCounters();
    }
  }

  private reportFirstFrame(): void {
    if (this.firstFrameReported) {
      return;
    }

    const callbacks = Array.from(this.firstFrameCallbacks);
    this.firstFrameCallbacks.clear();
    this.firstFrameReported = true;
    this.readyState = 'ready';
    recordWebGpuSplatTelemetryEvent({
      name: 'first-frame',
      durationMs: getWebGpuSplatTelemetryElapsedMs(this.createdAtMs),
      details: {
        count: this.scene.count,
        width: this.frame?.viewport.pixelWidth ?? null,
        height: this.frame?.viewport.pixelHeight ?? null,
      },
    });
    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        reportFirstFrameCallbackError(error);
      }
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('Splat render session has been disposed');
    }
  }

  private shouldSortFrame(frame: SplatCameraFrame): boolean {
    const depthAxis = getSplatDepthAxis(frame);
    return !this.sortedDepthAxis || !sameDepthAxis(this.sortedDepthAxis, depthAxis);
  }
}

export function createSplatProjectionUniforms(
  frame: SplatCameraFrame,
  scene: Pick<GpuGaussianSceneRef, 'count' | 'shDegree' | 'bounds'>,
  options: { writeIndices?: boolean } = {}
): GPUProjectionUniforms {
  const viewportWidth = requirePositiveInteger(frame.viewport.pixelWidth, 'viewport pixelWidth');
  const viewportHeight = requirePositiveInteger(frame.viewport.pixelHeight, 'viewport pixelHeight');
  const viewMatrix = copyMatrix(frame.camera.viewMatrix, 'viewMatrix');
  const projMatrix = copyMatrix(frame.camera.projectionMatrix, 'projectionMatrix');
  const { nearPlane, farPlane } = createSplatDepthRange(frame, scene.bounds);

  return {
    viewMatrix,
    projMatrix,
    viewportWidth,
    viewportHeight,
    focalX: projMatrix[0] * viewportWidth * 0.5,
    focalY: projMatrix[5] * viewportHeight * 0.5,
    camPos: frame.camera.position,
    shDegree: scene.shDegree,
    nearPlane,
    farPlane,
    cameraModel: getCameraModel(frame.camera.kind),
    numGaussians: scene.count,
    linearOutput: false,
    writeIndices: options.writeIndices ?? true,
  };
}

export function createSplatRasterUniforms(
  frame: SplatCameraFrame,
  scene: Pick<GpuGaussianSceneRef, 'count' | 'bounds'>
): GPURasterUniforms {
  const { nearPlane, farPlane } = createSplatDepthRange(frame, scene.bounds);
  return {
    viewportWidth: requirePositiveInteger(frame.viewport.pixelWidth, 'viewport pixelWidth'),
    viewportHeight: requirePositiveInteger(frame.viewport.pixelHeight, 'viewport pixelHeight'),
    nearPlane,
    farPlane,
    numGaussians: scene.count,
    renderMode: 'rgb',
    antialiasing: true,
    projMatrix: copyMatrix(frame.camera.projectionMatrix, 'projectionMatrix'),
  };
}

export function createSplatDepthRange(
  frame: Pick<SplatCameraFrame, 'camera'>,
  bounds: WebGpuGaussianCloudBounds
): { nearPlane: number; farPlane: number } {
  if (!hasFiniteVec3(frame.camera.position) || !hasFiniteVec3(bounds.center) || !isFinitePositive(bounds.size)) {
    const nearPlane = requireNearPlane(frame.camera.near);
    return {
      nearPlane,
      farPlane: requireFarPlane(frame.camera.far, nearPlane),
    };
  }

  const dx = frame.camera.position[0] - bounds.center[0];
  const dy = frame.camera.position[1] - bounds.center[1];
  const dz = frame.camera.position[2] - bounds.center[2];
  const distToCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const nearPlane = Math.max(0.1, distToCenter - bounds.size);
  const farPlane = Math.max(nearPlane + 0.001, distToCenter + bounds.size);
  return { nearPlane, farPlane };
}

export function createSplatOutputUniforms(
  frame: SplatCameraFrame,
  backgroundColor: WebGpuSplatBackgroundColor = getWebGpuSplatDefaultBackgroundColor()
): GPUCompositeUniforms {
  return {
    viewportWidth: requirePositiveInteger(frame.viewport.pixelWidth, 'viewport pixelWidth'),
    viewportHeight: requirePositiveInteger(frame.viewport.pixelHeight, 'viewport pixelHeight'),
    backgroundColor,
    depthAware: false,
  };
}

export function createSplatRendererPipelineBuffers(
  device: GPUDevice,
  gaussianCount: number
): SplatRendererPipelineBuffers {
  const count = requireNonNegativeInteger(gaussianCount, 'gaussianCount');
  assertWebGpuDeviceMeetsSplatRequiredLimits(
    device,
    getWebGpuSplatRendererRequiredLimitsForCount(count)
  );
  return {
    splatData: device.createBuffer({
      label: 'webgpu splat renderer: splat data',
      size: storageBufferSize(count * SPLAT_DATA_BYTES),
      usage: GPU_BUFFER_USAGE_STORAGE,
    }),
    depths: device.createBuffer({
      label: 'webgpu splat renderer: depths',
      size: storageBufferSize(count * U32_BYTES),
      usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST | GPU_BUFFER_USAGE_COPY_SRC,
    }),
    indices: device.createBuffer({
      label: 'webgpu splat renderer: indices',
      size: storageBufferSize(count * U32_BYTES),
      usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST | GPU_BUFFER_USAGE_COPY_SRC,
    }),
  };
}

function storageBufferSize(byteLength: number): number {
  return Math.max(MIN_GPU_BUFFER_BYTES, byteLength);
}

function copyMatrix(matrix: ArrayLike<number>, name: string): Float32Array {
  if (matrix.length !== 16) {
    throw new Error(`Invalid splat renderer ${name}: expected 16 values, got ${matrix.length}`);
  }
  return new Float32Array(matrix);
}

function copyBackgroundColor(backgroundColor: WebGpuSplatBackgroundColor): WebGpuSplatBackgroundColor {
  return [
    backgroundColor[0],
    backgroundColor[1],
    backgroundColor[2],
    backgroundColor[3],
  ];
}

function getCameraModel(kind: SplatCameraFrame['camera']['kind']): 'pinhole' | 'ortho' {
  if (kind === 'perspective') return 'pinhole';
  if (kind === 'orthographic') return 'ortho';
  throw new Error('Splat render session requires a perspective or orthographic camera');
}

function requireNearPlane(value: number | null): number {
  return Number.isFinite(value) && value !== null && value > 0 ? value : 0.1;
}

function requireFarPlane(value: number | null, nearPlane: number): number {
  const fallback = nearPlane + 1;
  const farPlane = Number.isFinite(value) && value !== null ? value : fallback;
  return Math.max(nearPlane + 0.001, farPlane);
}

function hasFiniteVec3(value: ArrayLike<number>): value is [number, number, number] {
  return value.length >= 3
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && Number.isFinite(value[2]);
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

type Vec3Tuple = [number, number, number];

function getSplatDepthAxis(frame: SplatCameraFrame): Vec3Tuple {
  const matrix = frame.camera.viewMatrix;
  const x = -matrix[2];
  const y = -matrix[6];
  const z = -matrix[10];
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= 0) {
    return [0, 0, -1];
  }

  return [x / length, y / length, z / length];
}

function sameDepthAxis(a: Vec3Tuple, b: Vec3Tuple): boolean {
  const epsilon = 1e-7;
  return Math.abs(a[0] - b[0]) <= epsilon
    && Math.abs(a[1] - b[1]) <= epsilon
    && Math.abs(a[2] - b[2]) <= epsilon;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid splat renderer ${name}: expected a positive integer`);
  }
  return value;
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid splat renderer ${name}: expected a non-negative integer`);
  }
  return value;
}

function beginValidationScope(device: GPUDevice): boolean {
  const errorScopeDevice = device as GPUDevice & {
    pushErrorScope?: (filter: GPUErrorFilter) => void;
  };
  if (!errorScopeDevice.pushErrorScope) {
    return false;
  }

  errorScopeDevice.pushErrorScope('validation');
  return true;
}

async function assertValidationScope(device: GPUDevice, validationScope: boolean): Promise<void> {
  if (!validationScope) {
    return;
  }

  const errorScopeDevice = device as GPUDevice & {
    popErrorScope?: () => Promise<GPUError | null>;
  };
  const error = await errorScopeDevice.popErrorScope?.();
  if (error) {
    throw new Error(`Splat render session WebGPU validation failed: ${error.message}`);
  }
}

async function waitForSubmittedWork(device: GPUDevice): Promise<void> {
  const queue = device.queue as GPUQueue & {
    onSubmittedWorkDone?: () => Promise<void>;
  };
  await queue.onSubmittedWorkDone?.();
}

function reportFirstFrameCallbackError(error: unknown): void {
  console.error('Splat render session first-frame callback failed', error);
}

function countRenderTargetTextures(renderTargets: RenderTargets): number {
  const textures = new Set<GPUTexture>();
  collectRenderTargetTextures(renderTargets, textures, new Set<object>());
  return textures.size;
}

function collectRenderTargetTextures(
  value: unknown,
  textures: Set<GPUTexture>,
  seen: Set<object>
): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (seen.has(value)) {
    return;
  }

  seen.add(value);
  if (isGpuTextureLike(value)) {
    textures.add(value);
    return;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    collectRenderTargetTextures(child, textures, seen);
  }
}

function isGpuTextureLike(value: object): value is GPUTexture {
  const candidate = value as Partial<GPUTexture>;
  return typeof candidate.createView === 'function'
    && typeof candidate.destroy === 'function';
}
