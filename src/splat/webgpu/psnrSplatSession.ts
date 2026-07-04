import type { Camera, Image } from '../../types/colmap';
import { CameraModelId } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';
import {
  loadGaussianCloudFromFile as defaultLoadGaussianCloudFromFile,
} from '../gaussianCloudLoader';
import type { LoadedGaussianCloud } from '../gaussianCloud';
import { cameraModelSupportsSplatMetric } from '../splatMetricCapability';
import {
  PSNR_METRIC_IMAGE_MISMATCH_MARKER,
  PsnrMetricImageDimensionMismatchError,
} from './psnrMetricImageError';
import {
  createColmapMetricWebGpuSplatFrame as defaultCreateMetricFrame,
} from './cameraFrames';
import {
  createSplatRenderSession as defaultCreateRenderSession,
  type SplatCameraFrame,
  type SplatRenderSession,
} from './gaussianRenderer';
import {
  GaussianSceneResourceManager,
  type GaussianSceneResourceManager as GaussianSceneResourceManagerType,
} from './gaussianSceneResourceManager';
import {
  createWebGpuPsnrGroundTruthTextureFromBitmap as defaultCreateGroundTruthTexture,
  type WebGpuPsnrGroundTruthTexture,
} from './psnrGroundTruthTexture';
import {
  accumulatePsnrTextureReductions,
  computePsnrFromTextureReduction,
  computePsnrFromRgbaTexturesWebGpu as defaultComputePsnrFromTextures,
  computePsnrTextureReductionFromRgbaTexturesWebGpu as defaultComputePsnrTextureReductionFromTextures,
  type WebGpuPsnrTextureReduction,
  type WebGpuPsnrTextureResult,
} from './psnrTextureCompute';
import {
  trackWebGpuSplatDebugCounter,
} from './webGpuSplatDebugCounters';
import {
  getWebGpuSplatDefaultBackgroundColor,
  type WebGpuSplatBackgroundColor,
} from './splatRenderBackground';
import {
  getWebGpuSplatTelemetryElapsedMs,
  nowWebGpuSplatTelemetryMs,
  recordWebGpuSplatTelemetryEvent,
} from './webGpuSplatTelemetry';

export interface WebGpuSplatPsnrSession {
  computeImageMetric: (options: WebGpuSplatPsnrImageMetricOptions) => Promise<WebGpuPsnrTextureResult>;
  submitImageMetric: (options: WebGpuSplatPsnrImageMetricOptions) => Promise<WebGpuSubmittedSplatPsnrImageMetric>;
  dispose: () => void;
}

export interface WebGpuSubmittedSplatPsnrImageMetric {
  result: Promise<WebGpuPsnrTextureResult>;
  dispose: () => void;
}

export interface WebGpuSplatPsnrImageMetricOptions {
  imageFile: File;
  maskFile?: File | null;
  image: Image;
  camera: Camera;
  width: number;
  height: number;
  transform?: Sim3dEuler;
  modelTransform?: Sim3dEuler;
}

export interface WebGpuSplatPsnrSessionOptions {
  device: GPUDevice;
  splatFile: File;
  loadedCloud?: LoadedGaussianCloud;
  sharedScene?: WebGpuSplatPsnrSharedScene;
  deps?: WebGpuSplatPsnrSessionDeps;
}

export interface WebGpuSplatPsnrSharedScene {
  sceneId: string;
  resourceManager: Pick<GaussianSceneResourceManagerType, 'acquire'>;
}

type WebGpuCreateImageBitmap = (
  source: ImageBitmapSource,
  options?: ImageBitmapOptions
) => Promise<ImageBitmap>;

export interface WebGpuSplatPsnrSessionDeps {
  loadGaussianCloudFromFile?: typeof defaultLoadGaussianCloudFromFile;
  createSceneResourceManager?: () => Pick<GaussianSceneResourceManagerType, 'acquire' | 'dispose'>;
  createRenderSession?: typeof defaultCreateRenderSession;
  createBitmap?: WebGpuCreateImageBitmap;
  createGroundTruthTexture?: typeof defaultCreateGroundTruthTexture;
  computePsnrFromTextures?: typeof defaultComputePsnrFromTextures;
  computePsnrTextureReductionFromTextures?: typeof defaultComputePsnrTextureReductionFromTextures;
  createMetricFrame?: typeof defaultCreateMetricFrame;
}

const GPU_TEXTURE_USAGE_COPY_SRC = 0x01;
const GPU_TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const GPU_TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const WEBGPU_PSNR_FORMAT: GPUTextureFormat = 'rgba8unorm';
const WEBGPU_PSNR_RENDER_TARGET_USAGE = GPU_TEXTURE_USAGE_COPY_SRC
  | GPU_TEXTURE_USAGE_TEXTURE_BINDING
  | GPU_TEXTURE_USAGE_RENDER_ATTACHMENT;

const createDefaultImageBitmap: WebGpuCreateImageBitmap = (source, options) => {
  return globalThis.createImageBitmap(source, options);
};

function disposeOwnedSceneResourceManager(
  resourceManager: Pick<GaussianSceneResourceManagerType, 'acquire'> | Pick<GaussianSceneResourceManagerType, 'acquire' | 'dispose'>
): void {
  (resourceManager as Pick<GaussianSceneResourceManagerType, 'dispose'>).dispose?.();
}

export async function createWebGpuSplatPsnrSession({
  device,
  splatFile,
  loadedCloud: providedLoadedCloud,
  sharedScene,
  deps = {},
}: WebGpuSplatPsnrSessionOptions): Promise<WebGpuSplatPsnrSession> {
  const loadGaussianCloudFromFile = deps.loadGaussianCloudFromFile ?? defaultLoadGaussianCloudFromFile;
  const createSceneResourceManager = deps.createSceneResourceManager
    ?? (() => new GaussianSceneResourceManager());
  const createRenderSession = deps.createRenderSession ?? defaultCreateRenderSession;
  const loadedCloud = providedLoadedCloud ?? await loadGaussianCloudFromFile(splatFile);
  const resourceManager = sharedScene?.resourceManager ?? createSceneResourceManager();
  const ownsResourceManager = !sharedScene;
  const scene = resourceManager.acquire(device, {
    sceneId: sharedScene?.sceneId ?? createPsnrSceneId(splatFile, loadedCloud),
    cloud: loadedCloud.cloud,
    labelPrefix: `psnr ${splatFile.name}`,
  });

  try {
    const renderSession = createRenderSession({
      device,
      scene,
      format: WEBGPU_PSNR_FORMAT,
      width: 1,
      height: 1,
      backgroundColor: getWebGpuSplatDefaultBackgroundColor(),
      sortAlgorithm: 'radix',
    });
    return new DefaultWebGpuSplatPsnrSession({
      device,
      renderSession,
      disposeResourceManager: ownsResourceManager ? () => disposeOwnedSceneResourceManager(resourceManager) : undefined,
      deps,
    });
  } catch (error) {
    scene.release();
    if (ownsResourceManager) {
      disposeOwnedSceneResourceManager(resourceManager);
    }
    throw error;
  }
}

class DefaultWebGpuSplatPsnrSession implements WebGpuSplatPsnrSession {
  private readonly device: GPUDevice;
  private readonly renderSession: SplatRenderSession;
  private readonly disposeResourceManager?: () => void;
  private readonly createBitmap: WebGpuCreateImageBitmap;
  private readonly createGroundTruthTexture: typeof defaultCreateGroundTruthTexture;
  private readonly computePsnrFromTextures: typeof defaultComputePsnrFromTextures;
  private readonly computePsnrTextureReductionFromTextures: typeof defaultComputePsnrTextureReductionFromTextures;
  private readonly createMetricFrame: typeof defaultCreateMetricFrame;
  private readonly activeResourceScopes = new Set<ActivePsnrImageResources>();
  private readonly releasePsnrSessionCounter = trackWebGpuSplatDebugCounter('psnrSessions');
  private renderQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor({
    device,
    renderSession,
    disposeResourceManager,
    deps,
  }: {
    device: GPUDevice;
    renderSession: SplatRenderSession;
    disposeResourceManager?: () => void;
    deps: WebGpuSplatPsnrSessionDeps;
  }) {
    this.device = device;
    this.renderSession = renderSession;
    this.disposeResourceManager = disposeResourceManager;
    this.createBitmap = deps.createBitmap ?? createDefaultImageBitmap;
    this.createGroundTruthTexture = deps.createGroundTruthTexture ?? defaultCreateGroundTruthTexture;
    this.computePsnrFromTextures = deps.computePsnrFromTextures ?? defaultComputePsnrFromTextures;
    this.computePsnrTextureReductionFromTextures = deps.computePsnrTextureReductionFromTextures
      ?? defaultComputePsnrTextureReductionFromTextures;
    this.createMetricFrame = deps.createMetricFrame ?? defaultCreateMetricFrame;
  }

  async computeImageMetric({
    imageFile,
    maskFile,
    image,
    camera,
    width,
    height,
    transform,
    modelTransform,
  }: WebGpuSplatPsnrImageMetricOptions): Promise<WebGpuPsnrTextureResult> {
    const submitted = await this.submitImageMetric({
      imageFile,
      maskFile,
      image,
      camera,
      width,
      height,
      transform,
      modelTransform,
    });
    try {
      return await submitted.result;
    } finally {
      submitted.dispose();
    }
  }

  async submitImageMetric({
    imageFile,
    maskFile,
    image,
    camera,
    width,
    height,
    transform,
    modelTransform,
  }: WebGpuSplatPsnrImageMetricOptions): Promise<WebGpuSubmittedSplatPsnrImageMetric> {
    this.assertNotDisposed();
    const safeWidth = requirePositiveInteger(width, 'width');
    const safeHeight = requirePositiveInteger(height, 'height');
    assertPinholeCamera(camera);
    assertMetricRenderSizeMatchesCamera({
      camera,
      width: safeWidth,
      height: safeHeight,
      imageName: image.name,
    });
    const resources = this.createResourceScope();
    const releaseActiveJobCounter = trackWebGpuSplatDebugCounter('activePsnrImageJobs');
    const telemetryStart = nowWebGpuSplatTelemetryMs();

    try {
      const bitmap = await this.createBitmap(imageFile, {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });
      resources.setBitmap(bitmap);
      this.assertNotDisposed();

      const sourceWidth = requirePositiveInteger(bitmap.width, 'source width');
      const sourceHeight = requirePositiveInteger(bitmap.height, 'source height');
      assertMetricBitmapSizeMatchesCamera({
        camera,
        sourceWidth,
        sourceHeight,
        imageName: image.name,
      });
      let maskBitmap: ImageBitmap | null = null;
      if (maskFile) {
        maskBitmap = await this.createBitmap(maskFile, {
          colorSpaceConversion: 'none',
          premultiplyAlpha: 'none',
        });
        resources.setMaskBitmap(maskBitmap);
        this.assertNotDisposed();
        assertMetricMaskBitmapSizeMatchesCamera({
          camera,
          sourceWidth: requirePositiveInteger(maskBitmap.width, 'mask source width'),
          sourceHeight: requirePositiveInteger(maskBitmap.height, 'mask source height'),
          imageName: image.name,
        });
      }
      const maxTextureDimension2D = getMaxTextureDimension2D(this.device);
      if (fitsSingleTexture(maxTextureDimension2D, safeWidth, safeHeight, sourceWidth, sourceHeight)) {
        return this.submitSingleImageMetric({
          resources,
          bitmap,
          maskBitmap,
          releaseActiveJobCounter,
          telemetryStart,
          image,
          camera,
          width: safeWidth,
          height: safeHeight,
          transform,
          modelTransform,
        });
      }

      assertTiledOverflowSupported({
        maxTextureDimension2D,
        sourceWidth,
        sourceHeight,
        targetWidth: safeWidth,
        targetHeight: safeHeight,
      });

      const result = await this.computeTiledImageMetric({
        resources,
        bitmap,
        maskBitmap,
        image,
        camera,
        width: safeWidth,
        height: safeHeight,
        transform,
        modelTransform,
        maxTextureDimension2D,
      });
      this.recordImageTelemetry({
        telemetryStart,
        image,
        width: safeWidth,
        height: safeHeight,
        tiled: true,
        result,
      });
      resources.releaseAll();
      this.activeResourceScopes.delete(resources);
      releaseActiveJobCounter();
      return {
        result: Promise.resolve(result),
        dispose: () => undefined,
      };
    } catch (error) {
      resources.releaseAll();
      this.activeResourceScopes.delete(resources);
      releaseActiveJobCounter();
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const resources of this.activeResourceScopes) {
      resources.releaseAll();
    }
    this.activeResourceScopes.clear();
    this.renderSession.dispose();
    this.disposeResourceManager?.();
    this.releasePsnrSessionCounter();
  }

  private submitSingleImageMetric({
    resources,
    bitmap,
    maskBitmap,
    releaseActiveJobCounter,
    telemetryStart,
    image,
    camera,
    width,
    height,
    transform,
    modelTransform,
  }: {
    resources: ActivePsnrImageResources;
    bitmap: ImageBitmap;
    maskBitmap: ImageBitmap | null;
    releaseActiveJobCounter: () => void;
    telemetryStart: number;
    image: Image;
    camera: Camera;
    width: number;
    height: number;
    transform?: Sim3dEuler;
    modelTransform?: Sim3dEuler;
  }): WebGpuSubmittedSplatPsnrImageMetric {
    let renderedTexture: TrackedGpuTexture | null = null;
    let groundTruthTexture: WebGpuPsnrGroundTruthTexture | null = null;
    let maskTexture: WebGpuPsnrGroundTruthTexture | null = null;
    let reductionPromise: Promise<WebGpuPsnrTextureResult> | null = null;
    let disposed = false;
    let released = false;

    try {
      groundTruthTexture = this.createGroundTruthTexture({
        device: this.device,
        source: bitmap,
        targetWidth: width,
        targetHeight: height,
      });
      resources.trackGroundTruthTexture(groundTruthTexture);
      if (maskBitmap) {
        maskTexture = this.createGroundTruthTexture({
          device: this.device,
          source: maskBitmap,
          targetWidth: width,
          targetHeight: height,
        });
        resources.trackGroundTruthTexture(maskTexture);
      }
      renderedTexture = this.createRenderedTexture(width, height, image.name);
      resources.trackRenderedTexture(renderedTexture);
      const frame = this.createMetricFrame({
        image,
        camera,
        width,
        height,
        transform,
        modelTransform,
      });

      const renderPromise = this.renderMetricFrameToTexture({
        frame,
        target: renderedTexture.texture,
        backgroundColor: getWebGpuSplatDefaultBackgroundColor(),
      });
      const submittedRenderedTexture = renderedTexture;
      const submittedGroundTruthTexture = groundTruthTexture;
      const submittedMaskTexture = maskTexture;
      this.assertNotDisposed();
      const createReductionPromise = async (): Promise<WebGpuPsnrTextureResult> => {
        await renderPromise;
        this.assertNotDisposed();
        if (disposed) {
          throw new Error('WebGPU splat PSNR image metric has been disposed');
        }
        const result = await this.computePsnrFromTextures({
          device: this.device,
          renderedTexture: submittedRenderedTexture.texture,
          groundTruthTexture: submittedGroundTruthTexture.texture,
          ...(submittedMaskTexture ? { maskTexture: submittedMaskTexture.texture } : {}),
          width,
          height,
        });
        this.assertNotDisposed();
        if (disposed) {
          throw new Error('WebGPU splat PSNR image metric has been disposed');
        }
        this.recordImageTelemetry({
          telemetryStart,
          image,
          width,
          height,
          tiled: false,
          result,
        });
        return result;
      };
      const release = () => {
        if (released) return;
        released = true;
        if (renderedTexture) {
          resources.destroyRenderedTexture(renderedTexture);
        }
        if (groundTruthTexture) {
          resources.disposeGroundTruthTexture(groundTruthTexture);
        }
        if (maskTexture) {
          resources.disposeGroundTruthTexture(maskTexture);
        }
        resources.releaseAll();
        this.activeResourceScopes.delete(resources);
        releaseActiveJobCounter();
      };
      reductionPromise = createReductionPromise().finally(release);
      return {
        result: reductionPromise,
        dispose() {
          disposed = true;
          release();
        },
      };
    } finally {
      if (!reductionPromise) {
        if (renderedTexture) {
          resources.destroyRenderedTexture(renderedTexture);
        }
        if (groundTruthTexture) {
          resources.disposeGroundTruthTexture(groundTruthTexture);
        }
        if (maskTexture) {
          resources.disposeGroundTruthTexture(maskTexture);
        }
      }
    }
  }

  private async computeTiledImageMetric({
    resources,
    bitmap,
    maskBitmap,
    image,
    camera,
    width,
    height,
    transform,
    modelTransform,
    maxTextureDimension2D,
  }: {
    resources: ActivePsnrImageResources;
    bitmap: ImageBitmap;
    maskBitmap: ImageBitmap | null;
    image: Image;
    camera: Camera;
    width: number;
    height: number;
    transform?: Sim3dEuler;
    modelTransform?: Sim3dEuler;
    maxTextureDimension2D: number;
  }): Promise<WebGpuPsnrTextureResult> {
    const reductions: WebGpuPsnrTextureReduction[] = [];
    for (const tile of createPsnrTiles(width, height, maxTextureDimension2D)) {
      this.assertNotDisposed();
      let renderedTexture: TrackedGpuTexture | null = null;
      let groundTruthTexture: WebGpuPsnrGroundTruthTexture | null = null;
      let maskTexture: WebGpuPsnrGroundTruthTexture | null = null;

      try {
        groundTruthTexture = this.createGroundTruthTexture({
          device: this.device,
          source: bitmap,
          sourceOrigin: { x: tile.originX, y: tile.originY },
          sourceWidth: tile.width,
          sourceHeight: tile.height,
          targetWidth: tile.width,
          targetHeight: tile.height,
        });
        resources.trackGroundTruthTexture(groundTruthTexture);
        if (maskBitmap) {
          maskTexture = this.createGroundTruthTexture({
            device: this.device,
            source: maskBitmap,
            sourceOrigin: { x: tile.originX, y: tile.originY },
            sourceWidth: tile.width,
            sourceHeight: tile.height,
            targetWidth: tile.width,
            targetHeight: tile.height,
          });
          resources.trackGroundTruthTexture(maskTexture);
        }
        renderedTexture = this.createRenderedTexture(tile.width, tile.height, image.name, tile);
        resources.trackRenderedTexture(renderedTexture);
        const frame = this.createMetricFrame({
          image,
          camera,
          width: tile.width,
          height: tile.height,
          transform,
          modelTransform,
          tile: {
            fullWidth: width,
            fullHeight: height,
            originX: tile.originX,
            originY: tile.originY,
          },
        });

        await this.renderMetricFrameToTexture({
          frame,
          target: renderedTexture.texture,
          backgroundColor: getWebGpuSplatDefaultBackgroundColor(),
        });
        this.assertNotDisposed();
        reductions.push(await this.computePsnrTextureReductionFromTextures({
          device: this.device,
          renderedTexture: renderedTexture.texture,
          groundTruthTexture: groundTruthTexture.texture,
          ...(maskTexture ? { maskTexture: maskTexture.texture } : {}),
          width: tile.width,
          height: tile.height,
        }));
        this.assertNotDisposed();
      } finally {
        if (renderedTexture) {
          resources.destroyRenderedTexture(renderedTexture);
        }
        if (groundTruthTexture) {
          resources.disposeGroundTruthTexture(groundTruthTexture);
        }
        if (maskTexture) {
          resources.disposeGroundTruthTexture(maskTexture);
        }
      }
    }

    return computePsnrFromTextureReduction(accumulatePsnrTextureReductions(reductions));
  }

  private renderMetricFrameToTexture({
    frame,
    target,
    backgroundColor,
  }: {
    frame: SplatCameraFrame;
    target: GPUTexture;
    backgroundColor: WebGpuSplatBackgroundColor;
  }): Promise<void> {
    return this.enqueueRender(async () => {
      this.renderSession.setCamera(frame);
      this.renderSession.setBackgroundColor(backgroundColor);
      this.assertNotDisposed();
      await this.renderSession.renderToTexture(target, { completion: 'completed' });
      this.assertNotDisposed();
    });
  }

  private enqueueRender<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.renderQueue.then(task, task);
    this.renderQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private createResourceScope(): ActivePsnrImageResources {
    const resources = new ActivePsnrImageResources();
    this.activeResourceScopes.add(resources);
    return resources;
  }

  private recordImageTelemetry({
    telemetryStart,
    image,
    width,
    height,
    tiled,
    result,
  }: {
    telemetryStart: number;
    image: Image;
    width: number;
    height: number;
    tiled: boolean;
    result: WebGpuPsnrTextureResult;
  }): void {
    const durationMs = getWebGpuSplatTelemetryElapsedMs(telemetryStart);
    recordWebGpuSplatTelemetryEvent({
      name: 'psnr-image',
      durationMs,
      imagesPerSecond: durationMs > 0 ? 1000 / durationMs : 0,
      details: {
        imageName: image.name,
        width,
        height,
        tiled,
        validPixelCount: result.validPixelCount,
      },
    });
  }

  private createRenderedTexture(
    width: number,
    height: number,
    imageName: string,
    tile?: WebGpuPsnrTile
  ): TrackedGpuTexture {
    const texture = this.device.createTexture({
      label: tile
        ? `webgpu splat psnr rendered ${imageName} tile ${tile.originX},${tile.originY}`
        : `webgpu splat psnr rendered ${imageName}`,
      size: { width, height },
      format: WEBGPU_PSNR_FORMAT,
      usage: WEBGPU_PSNR_RENDER_TARGET_USAGE,
    });
    return {
      texture,
      releaseCounter: trackWebGpuSplatDebugCounter('textures'),
    };
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('WebGPU splat PSNR session has been disposed');
    }
  }
}

class ActivePsnrImageResources {
  private bitmap: ImageBitmap | null = null;
  private maskBitmap: ImageBitmap | null = null;
  private readonly renderedTextures = new Set<TrackedGpuTexture>();
  private readonly groundTruthTextures = new Set<WebGpuPsnrGroundTruthTexture>();
  private released = false;

  setBitmap(bitmap: ImageBitmap): void {
    if (this.released) {
      bitmap.close();
      return;
    }
    this.bitmap = bitmap;
  }

  setMaskBitmap(bitmap: ImageBitmap): void {
    if (this.released) {
      bitmap.close();
      return;
    }
    this.maskBitmap = bitmap;
  }

  trackRenderedTexture(texture: TrackedGpuTexture): void {
    if (this.released) {
      texture.texture.destroy();
      texture.releaseCounter();
      return;
    }
    this.renderedTextures.add(texture);
  }

  destroyRenderedTexture(texture: TrackedGpuTexture): void {
    if (this.renderedTextures.delete(texture)) {
      texture.texture.destroy();
      texture.releaseCounter();
    }
  }

  trackGroundTruthTexture(texture: WebGpuPsnrGroundTruthTexture): void {
    if (this.released) {
      texture.dispose();
      return;
    }
    this.groundTruthTextures.add(texture);
  }

  disposeGroundTruthTexture(texture: WebGpuPsnrGroundTruthTexture): void {
    if (this.groundTruthTextures.delete(texture)) {
      texture.dispose();
    }
  }

  releaseAll(): void {
    if (this.released) return;
    this.released = true;
    this.bitmap?.close();
    this.bitmap = null;
    this.maskBitmap?.close();
    this.maskBitmap = null;
    for (const texture of this.renderedTextures) {
      texture.texture.destroy();
      texture.releaseCounter();
    }
    this.renderedTextures.clear();
    for (const texture of this.groundTruthTextures) {
      texture.dispose();
    }
    this.groundTruthTextures.clear();
  }
}

interface WebGpuPsnrTile {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

interface TrackedGpuTexture {
  texture: GPUTexture;
  releaseCounter: () => void;
}

function createPsnrSceneId(file: File, loadedCloud: LoadedGaussianCloud): string {
  return [
    'psnr',
    loadedCloud.format,
    file.name,
    file.size,
    file.lastModified,
    loadedCloud.byteLength,
  ].join(':');
}

function assertPinholeCamera(camera: Camera): void {
  // Defensive backstop only: the UI gate and image selection already exclude non-capable
  // cameras, so this should be unreachable in normal flow. It shares the same capability
  // predicate so it cannot drift from what the UI offered.
  if (cameraModelSupportsSplatMetric(camera.modelId)) {
    return;
  }

  throw new Error(
    `WebGPU PSNR currently requires an undistorted pinhole ground-truth image for camera model ${getCameraModelName(camera.modelId)}`
  );
}

function assertMetricRenderSizeMatchesCamera({
  camera,
  width,
  height,
  imageName,
}: {
  camera: Camera;
  width: number;
  height: number;
  imageName: string;
}): void {
  if (width === camera.width && height === camera.height) {
    return;
  }

  throw new Error(
    `WebGPU PSNR requires full-resolution metric rendering for ${imageName}: requested ${width}x${height}, camera is ${camera.width}x${camera.height}`
  );
}

function assertMetricBitmapSizeMatchesCamera({
  camera,
  sourceWidth,
  sourceHeight,
  imageName,
}: {
  camera: Camera;
  sourceWidth: number;
  sourceHeight: number;
  imageName: string;
}): void {
  if (sourceWidth === camera.width && sourceHeight === camera.height) {
    return;
  }

  throw new PsnrMetricImageDimensionMismatchError(
    `WebGPU PSNR requires an ${PSNR_METRIC_IMAGE_MISMATCH_MARKER} for ${imageName}: decoded ${sourceWidth}x${sourceHeight}, camera is ${camera.width}x${camera.height}. Load the image set that belongs to the sparse model.`
  );
}

function assertMetricMaskBitmapSizeMatchesCamera({
  camera,
  sourceWidth,
  sourceHeight,
  imageName,
}: {
  camera: Camera;
  sourceWidth: number;
  sourceHeight: number;
  imageName: string;
}): void {
  if (sourceWidth === camera.width && sourceHeight === camera.height) {
    return;
  }

  throw new Error(
    `WebGPU PSNR requires a mask matching the PINHOLE camera for ${imageName}: decoded ${sourceWidth}x${sourceHeight}, camera is ${camera.width}x${camera.height}.`
  );
}

function getCameraModelName(modelId: Camera['modelId']): string {
  for (const [name, value] of Object.entries(CameraModelId)) {
    if (value === modelId) return name;
  }
  return String(modelId);
}

function getMaxTextureDimension2D(device: GPUDevice): number {
  const maxTextureDimension2D = device.limits?.maxTextureDimension2D;
  if (typeof maxTextureDimension2D === 'number' && Number.isInteger(maxTextureDimension2D) && maxTextureDimension2D > 0) {
    return maxTextureDimension2D;
  }
  return Number.MAX_SAFE_INTEGER;
}

function fitsSingleTexture(
  maxTextureDimension2D: number,
  targetWidth: number,
  targetHeight: number,
  sourceWidth: number,
  sourceHeight: number
): boolean {
  return targetWidth <= maxTextureDimension2D
    && targetHeight <= maxTextureDimension2D
    && sourceWidth <= maxTextureDimension2D
    && sourceHeight <= maxTextureDimension2D;
}

function assertTiledOverflowSupported({
  maxTextureDimension2D,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
}: {
  maxTextureDimension2D: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}): void {
  if (sourceWidth !== targetWidth || sourceHeight !== targetHeight) {
    throw new Error(
      `WebGPU PSNR texture-limit tiling currently requires decoded source size ${sourceWidth}x${sourceHeight} to match target size ${targetWidth}x${targetHeight}`
    );
  }
  if (!Number.isInteger(maxTextureDimension2D) || maxTextureDimension2D <= 0) {
    throw new Error('WebGPU PSNR texture-limit tiling requires a positive maxTextureDimension2D');
  }
}

function createPsnrTiles(width: number, height: number, maxTextureDimension2D: number): WebGpuPsnrTile[] {
  const tiles: WebGpuPsnrTile[] = [];
  const tileSize = requirePositiveInteger(maxTextureDimension2D, 'tile size');
  for (let originY = 0; originY < height; originY += tileSize) {
    for (let originX = 0; originX < width; originX += tileSize) {
      tiles.push({
        originX,
        originY,
        width: Math.min(tileSize, width - originX),
        height: Math.min(tileSize, height - originY),
      });
    }
  }
  return tiles;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid WebGPU splat PSNR ${name}: expected a positive integer`);
  }
  return value;
}
