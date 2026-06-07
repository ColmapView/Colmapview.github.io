import type { GaussianCloud } from '../gaussianCloud';
import {
  GaussianSceneResourceManager,
} from './gaussianSceneResourceManager';
import {
  createSplatRenderSession,
  type SplatCameraFrame,
  type SplatRenderSession,
  type SplatRenderSessionOptions,
} from './gaussianRenderer';
import {
  initializeWebGpuSplatDevice,
  type WebGpuSplatDeviceHandle,
  type WebGpuSplatDeviceOptions,
} from './webGpuSplatDevice';
import type { WebGpuSplatRequiredLimits } from './webGpuSplatLimits';
import {
  getWebGpuSplatDefaultBackgroundColor,
} from './splatRenderBackground';
import { getWebGpuSplatRequiredLimitsForCloud } from './webGpuSplatLimits';

const MAX_VISIBLE_SPLAT_IN_FLIGHT_RENDERS = 2;
const VISIBLE_SPLAT_SORT_ALGORITHM: NonNullable<SplatRenderSessionOptions['sortAlgorithm']> = 'radix-16bit';
const VISIBLE_SPLAT_OUTPUT_ALGORITHM: NonNullable<SplatRenderSessionOptions['outputAlgorithm']> = 'composite';

export interface VisibleWebGpuSplatCloudOptions {
  sceneId: string;
  labelPrefix?: string;
}

export interface VisibleWebGpuSplatRendererAdapter {
  loadCloud: (cloud: GaussianCloud, options: VisibleWebGpuSplatCloudOptions) => Promise<void>;
  setFrameSnapshot: (frame: SplatCameraFrame) => void;
  render: () => void;
  dispose: () => void;
}

export interface VisibleWebGpuSplatRendererAdapterDeps {
  initializeDevice?: (
    canvas: HTMLCanvasElement,
    options?: WebGpuSplatDeviceOptions
  ) => Promise<WebGpuSplatDeviceHandle>;
  createSceneResourceManager?: () => GaussianSceneResourceManager;
  createRenderSession?: (options: SplatRenderSessionOptions) => SplatRenderSession;
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null;
  onFirstFrame?: () => void;
  onError?: (reason: string) => void;
}

export type LoadedVisibleWebGpuSplatRendererAdapterDeps =
  Omit<VisibleWebGpuSplatRendererAdapterDeps, 'requiredLimits'>;

export async function createLoadedVisibleWebGpuSplatRendererAdapter(
  canvas: HTMLCanvasElement,
  cloud: GaussianCloud,
  cloudOptions: VisibleWebGpuSplatCloudOptions,
  deps: LoadedVisibleWebGpuSplatRendererAdapterDeps = {}
): Promise<VisibleWebGpuSplatRendererAdapter> {
  const adapter = await createVisibleWebGpuSplatRendererAdapter(canvas, {
    ...deps,
    requiredLimits: getWebGpuSplatRequiredLimitsForCloud(cloud),
  });

  try {
    await adapter.loadCloud(cloud, cloudOptions);
  } catch (error) {
    adapter.dispose();
    throw error;
  }

  return adapter;
}

export async function createVisibleWebGpuSplatRendererAdapter(
  canvas: HTMLCanvasElement,
  deps: VisibleWebGpuSplatRendererAdapterDeps = {}
): Promise<VisibleWebGpuSplatRendererAdapter> {
  const initializeDevice = deps.initializeDevice ?? initializeWebGpuSplatDevice;
  let adapter: DefaultVisibleWebGpuSplatRendererAdapter | null = null;
  const deviceHandle = await initializeDevice(canvas, {
    alphaMode: 'opaque',
    requiredLimits: deps.requiredLimits,
    onDeviceLost: (info) => {
      adapter?.handleDeviceLost(info);
    },
  });

  adapter = new DefaultVisibleWebGpuSplatRendererAdapter({
    canvas,
    deviceHandle,
    createSceneResourceManager: deps.createSceneResourceManager,
    createRenderSession: deps.createRenderSession,
    onFirstFrame: deps.onFirstFrame,
    onError: deps.onError,
  });
  return adapter;
}

interface DefaultVisibleWebGpuSplatRendererAdapterOptions {
  canvas: HTMLCanvasElement;
  deviceHandle: WebGpuSplatDeviceHandle;
  createSceneResourceManager?: () => GaussianSceneResourceManager;
  createRenderSession?: (options: SplatRenderSessionOptions) => SplatRenderSession;
  onFirstFrame?: () => void;
  onError?: (reason: string) => void;
}

class DefaultVisibleWebGpuSplatRendererAdapter implements VisibleWebGpuSplatRendererAdapter {
  private readonly canvas: HTMLCanvasElement;
  private readonly deviceHandle: WebGpuSplatDeviceHandle;
  private readonly sceneResourceManager: GaussianSceneResourceManager;
  private readonly createRenderSession: (options: SplatRenderSessionOptions) => SplatRenderSession;
  private readonly onFirstFrame?: () => void;
  private readonly onError?: (reason: string) => void;
  private session: SplatRenderSession | null = null;
  private unsubscribeFirstFrame: (() => void) | null = null;
  private frame: SplatCameraFrame | null = null;
  private inFlightRenders = 0;
  private inFlightViewport: SplatViewportSize | null = null;
  private renderQueued = false;
  private rendering = false;
  private disposed = false;
  private failed = false;

  constructor({
    canvas,
    deviceHandle,
    createSceneResourceManager,
    createRenderSession,
    onFirstFrame,
    onError,
  }: DefaultVisibleWebGpuSplatRendererAdapterOptions) {
    this.canvas = canvas;
    this.deviceHandle = deviceHandle;
    this.sceneResourceManager = createSceneResourceManager?.() ?? new GaussianSceneResourceManager();
    this.createRenderSession = createRenderSession ?? createSplatRenderSession;
    this.onFirstFrame = onFirstFrame;
    this.onError = onError;
  }

  async loadCloud(cloud: GaussianCloud, options: VisibleWebGpuSplatCloudOptions): Promise<void> {
    this.assertUsable();

    const scene = await this.acquireScene(cloud, options);
    if (this.disposed || this.failed) {
      scene.release();
      return;
    }

    this.assertUsable();
    try {
      const session = this.createRenderSession({
        device: this.deviceHandle.device,
        scene,
        format: this.deviceHandle.format,
        canvasContext: this.deviceHandle.context,
        width: this.frame?.viewport.pixelWidth ?? getCanvasPixelWidth(this.canvas),
        height: this.frame?.viewport.pixelHeight ?? getCanvasPixelHeight(this.canvas),
        backgroundColor: getWebGpuSplatDefaultBackgroundColor(),
        outputAlgorithm: VISIBLE_SPLAT_OUTPUT_ALGORITHM,
        sortAlgorithm: VISIBLE_SPLAT_SORT_ALGORITHM,
      });

      this.replaceSession(session);
      if (this.frame) {
        this.render();
      }
    } catch (error) {
      scene.release();
      throw error;
    }
  }

  private acquireScene(
    cloud: GaussianCloud,
    options: VisibleWebGpuSplatCloudOptions
  ): Promise<ReturnType<GaussianSceneResourceManager['acquire']>> | ReturnType<GaussianSceneResourceManager['acquire']> {
    const resource = {
      sceneId: options.sceneId,
      cloud,
      labelPrefix: options.labelPrefix,
    };

    if (typeof this.sceneResourceManager.acquireAsync === 'function') {
      return this.sceneResourceManager.acquireAsync(this.deviceHandle.device, resource, {
        labelPrefix: options.labelPrefix,
      });
    }

    return this.sceneResourceManager.acquire(this.deviceHandle.device, resource);
  }

  setFrameSnapshot(frame: SplatCameraFrame): void {
    if (this.disposed || this.failed) {
      return;
    }

    const frameChanged = !this.frame || !sameSplatCameraFrame(this.frame, frame);
    this.frame = frame;
    if (!this.session || !frameChanged) {
      return;
    }

    this.render();
  }

  render(): void {
    if (this.disposed || this.failed || !this.session || !this.frame) {
      return;
    }

    this.renderQueued = true;
    if (!this.rendering) {
      void this.flushRenderQueue();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.renderQueued = false;
    this.disposeRendererResources();
    this.deviceHandle.dispose();
  }

  handleDeviceLost(info: GPUDeviceLostInfo): void {
    if (this.disposed) {
      return;
    }

    this.fail(getDeviceLostReason(info));
  }

  private replaceSession(session: SplatRenderSession): void {
    this.unsubscribeFirstFrame?.();
    this.unsubscribeFirstFrame = null;
    this.session?.dispose();
    this.session = session;
    this.unsubscribeFirstFrame = session.onFirstFrame(() => {
      this.onFirstFrame?.();
    });
  }

  private async flushRenderQueue(): Promise<void> {
    if (this.rendering) {
      return;
    }

    this.rendering = true;
    try {
      while (this.renderQueued && !this.disposed && !this.failed) {
        const session = this.session;
        const frame = this.frame;
        if (!session || !frame) {
          this.renderQueued = false;
          continue;
        }
        if (!this.canSubmitFrame(frame)) {
          break;
        }

        this.renderQueued = false;
        session.setCamera(frame);
        this.beginSubmittedFrame(frame);
        try {
          await session.renderToCanvas({ completion: 'submitted' });
        } catch (error) {
          this.completeSubmittedFrame();
          throw error;
        }
        this.trackSubmittedFrameCompletion();
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.rendering = false;
      if (this.renderQueued && this.canSubmitQueuedFrame()) {
        void this.flushRenderQueue();
      }
    }
  }

  private canSubmitQueuedFrame(): boolean {
    return Boolean(
      !this.disposed
      && !this.failed
      && this.session
      && this.frame
      && this.canSubmitFrame(this.frame)
    );
  }

  private canSubmitFrame(frame: SplatCameraFrame): boolean {
    if (this.inFlightRenders >= MAX_VISIBLE_SPLAT_IN_FLIGHT_RENDERS) {
      return false;
    }

    return !this.inFlightViewport || sameViewportSize(this.inFlightViewport, frame.viewport);
  }

  private beginSubmittedFrame(frame: SplatCameraFrame): void {
    this.inFlightRenders += 1;
    this.inFlightViewport = getViewportSize(frame.viewport);
  }

  private trackSubmittedFrameCompletion(): void {
    void waitForSubmittedWork(this.deviceHandle.device)
      .catch((error: unknown) => {
        this.fail(error);
      })
      .finally(() => {
        this.completeSubmittedFrame();
        if (this.renderQueued && this.canSubmitQueuedFrame()) {
          void this.flushRenderQueue();
        }
      });
  }

  private completeSubmittedFrame(): void {
    this.inFlightRenders = Math.max(0, this.inFlightRenders - 1);
    if (this.inFlightRenders === 0) {
      this.inFlightViewport = null;
    }
  }

  private fail(error: unknown): void {
    if (this.disposed || this.failed) {
      return;
    }

    this.failed = true;
    this.disposed = true;
    this.renderQueued = false;
    this.inFlightRenders = 0;
    this.inFlightViewport = null;
    this.disposeRendererResources();
    this.deviceHandle.dispose();
    this.onError?.(errorToReason(error));
  }

  private disposeRendererResources(): void {
    this.unsubscribeFirstFrame?.();
    this.unsubscribeFirstFrame = null;
    this.session?.dispose();
    this.session = null;
    this.sceneResourceManager.dispose();
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error('Visible WebGPU splat renderer has been disposed');
    }
    if (this.failed) {
      throw new Error('Visible WebGPU splat renderer has failed');
    }
  }
}

function getCanvasPixelWidth(canvas: HTMLCanvasElement): number {
  return Math.max(1, Math.trunc(canvas.width || canvas.clientWidth || 1));
}

function getCanvasPixelHeight(canvas: HTMLCanvasElement): number {
  return Math.max(1, Math.trunc(canvas.height || canvas.clientHeight || 1));
}

interface SplatViewportSize {
  pixelWidth: number;
  pixelHeight: number;
}

function getViewportSize(viewport: SplatCameraFrame['viewport']): SplatViewportSize {
  return {
    pixelWidth: viewport.pixelWidth,
    pixelHeight: viewport.pixelHeight,
  };
}

function sameViewportSize(a: SplatViewportSize, b: SplatCameraFrame['viewport']): boolean {
  return a.pixelWidth === b.pixelWidth && a.pixelHeight === b.pixelHeight;
}

function sameSplatCameraFrame(a: SplatCameraFrame, b: SplatCameraFrame): boolean {
  return sameSplatViewport(a.viewport, b.viewport)
    && a.camera.kind === b.camera.kind
    && a.camera.near === b.camera.near
    && a.camera.far === b.camera.far
    && sameNumberArray(a.camera.position, b.camera.position)
    && sameNumberArray(a.camera.viewMatrix, b.camera.viewMatrix)
    && sameNumberArray(a.camera.projectionMatrix, b.camera.projectionMatrix)
    && sameNumberArray(a.camera.worldMatrix, b.camera.worldMatrix);
}

function sameSplatViewport(a: SplatCameraFrame['viewport'], b: SplatCameraFrame['viewport']): boolean {
  return a.cssWidth === b.cssWidth
    && a.cssHeight === b.cssHeight
    && a.pixelWidth === b.pixelWidth
    && a.pixelHeight === b.pixelHeight
    && a.dpr === b.dpr;
}

function sameNumberArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

async function waitForSubmittedWork(device: GPUDevice): Promise<void> {
  const queue = (device as GPUDevice & { queue?: GPUQueue & {
    onSubmittedWorkDone?: () => Promise<void>;
  } }).queue;
  await queue?.onSubmittedWorkDone?.();
}

function errorToReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getDeviceLostReason(info: GPUDeviceLostInfo): string {
  const detail = info.message || info.reason;
  return detail ? `WebGPU device lost: ${detail}` : 'WebGPU device lost';
}
