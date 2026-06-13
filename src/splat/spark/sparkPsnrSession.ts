import * as THREE from 'three';
import type { Camera, Image } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';
import { createSim3dFromEuler, sim3dToMatrix4 } from '../../utils/sim3dTransforms';
import {
  getSplatMeshSourceOptions as defaultGetSplatMeshSourceOptions,
  preloadSparkModule as defaultPreloadSparkModule,
  type SparkModule,
} from '../../utils/sparkSplatRuntime';
import {
  computePsnrAndSsimFromRgba as defaultComputePsnrAndSsimFromRgba,
  createColmapPsnrCamera as defaultCreateMetricCamera,
  createUndistortedGroundTruthPixels as defaultCreateGroundTruthPixels,
  type PsnrResult,
} from '../../components/viewer3d/splatPsnrMetric';

export interface SparkSplatPsnrImageMetricOptions {
  imageFile: File;
  maskFile?: File | null;
  image: Image;
  camera: Camera;
  width: number;
  height: number;
  transform?: Sim3dEuler;
  modelTransform?: Sim3dEuler;
}

export interface SparkSplatPsnrSession {
  computeImageMetric: (options: SparkSplatPsnrImageMetricOptions) => Promise<PsnrResult>;
  dispose: () => void;
}

type SparkRendererInstance = InstanceType<SparkModule['SparkRenderer']>;
type SplatMeshInstance = InstanceType<SparkModule['SplatMesh']>;
type SparkRendererConstructor = SparkModule['SparkRenderer'];
type SplatMeshConstructor = SparkModule['SplatMesh'];

export interface SparkSplatPsnrSessionDeps {
  preloadSparkModule?: typeof defaultPreloadSparkModule;
  getSplatMeshSourceOptions?: typeof defaultGetSplatMeshSourceOptions;
  createCanvas?: () => HTMLCanvasElement;
  createRenderer?: (canvas: HTMLCanvasElement) => THREE.WebGLRenderer;
  createMetricCamera?: typeof defaultCreateMetricCamera;
  createGroundTruthPixels?: typeof defaultCreateGroundTruthPixels;
  computePsnrAndSsimFromRgba?: typeof defaultComputePsnrAndSsimFromRgba;
}

export interface SparkSplatPsnrSessionOptions {
  splatFile: File;
  deps?: SparkSplatPsnrSessionDeps;
}

export async function createSparkSplatPsnrSession({
  splatFile,
  deps = {},
}: SparkSplatPsnrSessionOptions): Promise<SparkSplatPsnrSession> {
  const preloadSparkModule = deps.preloadSparkModule ?? defaultPreloadSparkModule;
  const getSplatMeshSourceOptions = deps.getSplatMeshSourceOptions ?? defaultGetSplatMeshSourceOptions;
  const sparkModule = await preloadSparkModule();
  const sourceOptions = await getSplatMeshSourceOptions(splatFile);

  return new DefaultSparkSplatPsnrSession({
    splatFile,
    SparkRenderer: sparkModule.SparkRenderer,
    SplatMesh: sparkModule.SplatMesh,
    sourceOptions,
    deps,
  });
}

class DefaultSparkSplatPsnrSession implements SparkSplatPsnrSession {
  private readonly splatFile: File;
  private readonly SparkRenderer: SparkRendererConstructor;
  private readonly SplatMesh: SplatMeshConstructor;
  private readonly sourceOptions: Awaited<ReturnType<typeof defaultGetSplatMeshSourceOptions>>;
  private readonly createCanvas: () => HTMLCanvasElement;
  private readonly createRenderer: (canvas: HTMLCanvasElement) => THREE.WebGLRenderer;
  private readonly createMetricCamera: typeof defaultCreateMetricCamera;
  private readonly createGroundTruthPixels: typeof defaultCreateGroundTruthPixels;
  private readonly computeMetric: typeof defaultComputePsnrAndSsimFromRgba;
  private readonly scene = new THREE.Scene();
  private readonly modelMatrix = new THREE.Matrix4();
  private renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private sparkRenderer: SparkRendererInstance | null = null;
  private sparkTargetSize: { width: number; height: number } | null = null;
  private sparkTargetWarmed = false;
  private splatMesh: SplatMeshInstance | null = null;
  private initializePromise: Promise<void> | null = null;
  private renderQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor({
    splatFile,
    SparkRenderer,
    SplatMesh,
    sourceOptions,
    deps,
  }: {
    splatFile: File;
    SparkRenderer: SparkRendererConstructor;
    SplatMesh: SplatMeshConstructor;
    sourceOptions: Awaited<ReturnType<typeof defaultGetSplatMeshSourceOptions>>;
    deps: SparkSplatPsnrSessionDeps;
  }) {
    this.splatFile = splatFile;
    this.SparkRenderer = SparkRenderer;
    this.SplatMesh = SplatMesh;
    this.sourceOptions = sourceOptions;
    this.createCanvas = deps.createCanvas ?? createDetachedCanvas;
    this.createRenderer = deps.createRenderer ?? createMetricRenderer;
    this.createMetricCamera = deps.createMetricCamera ?? defaultCreateMetricCamera;
    this.createGroundTruthPixels = deps.createGroundTruthPixels ?? defaultCreateGroundTruthPixels;
    this.computeMetric = deps.computePsnrAndSsimFromRgba ?? defaultComputePsnrAndSsimFromRgba;
  }

  async computeImageMetric({
    imageFile,
    maskFile = null,
    image,
    camera,
    width,
    height,
    transform,
    modelTransform,
  }: SparkSplatPsnrImageMetricOptions): Promise<PsnrResult> {
    this.assertNotDisposed();
    const safeWidth = requirePositiveInteger(width, 'width');
    const safeHeight = requirePositiveInteger(height, 'height');

    return this.enqueueRender(async () => {
      this.assertNotDisposed();
      await this.initialize();
      this.assertNotDisposed();

      const metricCamera = this.createMetricCamera(image, camera, safeWidth, safeHeight, transform);
      this.applySplatModelTransform(modelTransform ?? transform);
      const renderedPixels = flipRgbaRows(
        await this.renderSparkTarget(metricCamera, safeWidth, safeHeight),
        safeWidth,
        safeHeight
      );
      const groundTruthPixels = await this.createGroundTruthPixels(imageFile, camera, safeWidth, safeHeight);
      const maskPixels = maskFile
        ? await this.createGroundTruthPixels(maskFile, camera, safeWidth, safeHeight)
        : null;
      this.assertNotDisposed();

      return this.computeMetric(renderedPixels, groundTruthPixels, {
        width: safeWidth,
        height: safeHeight,
        maskPixels,
      });
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.disposeSparkRenderer();
    this.splatMesh?.dispose();
    this.splatMesh = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
  }

  private async initialize(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = this.createSplatMesh();
    }
    return this.initializePromise;
  }

  private async createSplatMesh(): Promise<void> {
    const mesh = new this.SplatMesh({
      ...this.sourceOptions,
      fileName: this.splatFile.name,
      raycastable: false,
    });
    this.splatMesh = mesh;
    this.scene.add(mesh);
    await mesh.initialized;
    this.assertNotDisposed();
  }

  private ensureRenderer(): THREE.WebGLRenderer {
    if (!this.renderer) {
      this.canvas = this.createCanvas();
      this.renderer = this.createRenderer(this.canvas);
      configureMetricRenderer(this.renderer);
    }
    return this.renderer;
  }

  private ensureSparkRenderer(width: number, height: number): SparkRendererInstance {
    const renderer = this.ensureRenderer();
    renderer.setSize(width, height, false);
    if (
      this.sparkRenderer &&
      this.sparkTargetSize?.width === width &&
      this.sparkTargetSize.height === height
    ) {
      return this.sparkRenderer;
    }

    this.disposeSparkRenderer();
    const sparkRenderer = new this.SparkRenderer({
      renderer,
      target: {
        width,
        height,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        colorSpace: THREE.SRGBColorSpace,
        depthBuffer: true,
        stencilBuffer: false,
      },
      premultipliedAlpha: false,
    });
    this.sparkRenderer = sparkRenderer;
    this.sparkTargetSize = { width, height };
    this.sparkTargetWarmed = false;
    this.scene.add(sparkRenderer);
    return sparkRenderer;
  }

  private disposeSparkRenderer(): void {
    if (!this.sparkRenderer) {
      return;
    }
    this.scene.remove(this.sparkRenderer);
    this.sparkRenderer.dispose();
    this.sparkRenderer = null;
    this.sparkTargetSize = null;
    this.sparkTargetWarmed = false;
  }

  private async renderSparkTarget(
    camera: THREE.Camera,
    width: number,
    height: number
  ): Promise<Uint8Array> {
    const renderer = this.ensureRenderer();
    const sparkRenderer = this.ensureSparkRenderer(width, height);
    configureMetricRenderer(renderer);
    if (!this.sparkTargetWarmed) {
      await sparkRenderer.renderReadTarget({
        scene: this.scene,
        camera,
      });
      this.assertNotDisposed();
      this.sparkTargetWarmed = true;
    }
    const pixels = await sparkRenderer.renderReadTarget({
      scene: this.scene,
      camera,
    });
    return copyRgbaPixels(pixels, width, height);
  }

  private applySplatModelTransform(transform: Sim3dEuler | undefined): void {
    const mesh = this.splatMesh;
    if (!mesh) {
      return;
    }

    if (transform) {
      mesh.matrix.copy(this.modelMatrix.copy(sim3dToMatrix4(createSim3dFromEuler(transform))));
      mesh.matrixAutoUpdate = false;
    } else {
      mesh.matrix.identity();
      mesh.matrixAutoUpdate = true;
    }
    mesh.updateMatrixWorld(true);
  }

  private enqueueRender<T>(task: () => Promise<T>): Promise<T> {
    const result = this.renderQueue.then(task, task);
    this.renderQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('Spark splat PSNR session has been disposed');
    }
  }
}

function createDetachedCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('Spark PSNR requires a browser document');
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
}

function createMetricRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  return new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
}

function configureMetricRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;
}

function copyRgbaPixels(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const byteLength = width * height * 4;
  const copy = new Uint8Array(byteLength);
  copy.set(pixels.subarray(0, byteLength));
  return copy;
}

export function flipRgbaRows(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const rowByteLength = width * 4;
  const flipped = new Uint8Array(rowByteLength * height);
  for (let y = 0; y < height; y++) {
    const sourceStart = (height - 1 - y) * rowByteLength;
    const targetStart = y * rowByteLength;
    flipped.set(pixels.subarray(sourceStart, sourceStart + rowByteLength), targetStart);
  }
  return flipped;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid Spark splat PSNR ${name}: expected a positive integer`);
  }
  return value;
}
