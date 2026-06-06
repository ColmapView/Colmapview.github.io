import type { GaussianCloud } from '../gaussianCloud';
import type { WebGpuSplatUniformFrame } from './cameraUniforms';

type LocalGsplatRendererModule = typeof import('@local-gsplat-webgpu/renderer');
type LocalGsplatRenderer = Awaited<ReturnType<LocalGsplatRendererModule['GaussianRenderer']['create']>>;

export interface LocalGsplatRendererAdapterDeps {
  loadRendererModule?: () => Promise<LocalGsplatRendererModule>;
}

export interface LocalGsplatRendererAdapter {
  loadCloud: (cloud: GaussianCloud) => void;
  setFrameSnapshot: (frame: LocalGsplatRendererFrame) => void;
  render: () => void;
  dispose: () => void;
}

export type LocalGsplatRendererFrame = WebGpuSplatUniformFrame & {
  camera: WebGpuSplatUniformFrame['camera'] & {
    worldMatrix: ArrayLike<number>;
  };
};

export async function createLocalGsplatRendererAdapter(
  canvas: HTMLCanvasElement,
  deps: LocalGsplatRendererAdapterDeps = {}
): Promise<LocalGsplatRendererAdapter> {
  const loadRendererModule = deps.loadRendererModule ?? loadLocalGsplatRendererModule;
  const rendererModule = await loadRendererModule();
  const renderer = await rendererModule.GaussianRenderer.create(canvas);
  renderer.setCameraModel?.(rendererModule.GaussianRenderer.CAMERA_PINHOLE);
  renderer.setBackgroundColor?.(0, 0, 0);
  return new DefaultLocalGsplatRendererAdapter(renderer, rendererModule);
}

async function loadLocalGsplatRendererModule(): Promise<LocalGsplatRendererModule> {
  return import('@local-gsplat-webgpu/renderer');
}

class DefaultLocalGsplatRendererAdapter implements LocalGsplatRendererAdapter {
  private hasCloud = false;
  private disposed = false;
  private viewport: { width: number; height: number } | null = null;
  private readonly renderer: LocalGsplatRenderer;
  private readonly rendererModule: LocalGsplatRendererModule;

  constructor(
    renderer: LocalGsplatRenderer,
    rendererModule: LocalGsplatRendererModule
  ) {
    this.renderer = renderer;
    this.rendererModule = rendererModule;
  }

  loadCloud(cloud: GaussianCloud): void {
    if (this.disposed) {
      throw new Error('Local gsplat renderer adapter has been disposed');
    }

    this.renderer.loadGaussians(cloud, { fitCamera: false });
    this.hasCloud = true;
    this.render();
  }

  setFrameSnapshot(frame: LocalGsplatRendererFrame): void {
    if (this.disposed) {
      return;
    }

    this.resizeToFrame(frame);
    this.syncCamera(frame);
    this.render();
  }

  render(): void {
    if (this.disposed || !this.hasCloud) {
      return;
    }

    this.renderer.render();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.renderer.destroy();
  }

  private resizeToFrame(frame: LocalGsplatRendererFrame): void {
    const width = requirePositiveInteger(frame.viewport.pixelWidth, 'viewport pixelWidth');
    const height = requirePositiveInteger(frame.viewport.pixelHeight, 'viewport pixelHeight');
    if (this.viewport?.width === width && this.viewport.height === height) {
      return;
    }

    this.viewport = { width, height };
    this.renderer.resize(width, height);
  }

  private syncCamera(frame: LocalGsplatRendererFrame): void {
    const camera = this.renderer.getCamera();
    const world = frame.camera.worldMatrix;
    requireMatrixLength('worldMatrix', world);
    requireMatrixLength('projectionMatrix', frame.camera.projectionMatrix);

    const position = frame.camera.position;
    camera.position[0] = position[0];
    camera.position[1] = position[1];
    camera.position[2] = position[2];

    const forwardX = -world[8];
    const forwardY = -world[9];
    const forwardZ = -world[10];
    camera.target[0] = position[0] + forwardX;
    camera.target[1] = position[1] + forwardY;
    camera.target[2] = position[2] + forwardZ;
    camera.up[0] = world[4];
    camera.up[1] = world[5];
    camera.up[2] = world[6];

    camera.aspect = frame.viewport.pixelWidth / frame.viewport.pixelHeight;
    camera.near = frame.camera.near ?? 0.1;
    camera.far = frame.camera.far ?? 1000;

    if (frame.camera.kind === 'orthographic') {
      this.renderer.setCameraModel?.(this.rendererModule.GaussianRenderer.CAMERA_ORTHO);
      return;
    }

    this.renderer.setCameraModel?.(this.rendererModule.GaussianRenderer.CAMERA_PINHOLE);
    this.renderer.setFov?.(projectionMatrixToVerticalFovDegrees(frame.camera.projectionMatrix));
  }
}

function projectionMatrixToVerticalFovDegrees(projectionMatrix: ArrayLike<number>): number {
  const focalScaleY = projectionMatrix[5];
  if (!Number.isFinite(focalScaleY) || focalScaleY <= 0) {
    return 50;
  }
  return 2 * Math.atan(1 / focalScaleY) * 180 / Math.PI;
}

function requireMatrixLength(name: string, matrix: ArrayLike<number>): void {
  if (matrix.length !== 16) {
    throw new Error(`Invalid local gsplat ${name}: expected 16 values, got ${matrix.length}`);
  }
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid local gsplat ${name}: expected a positive integer`);
  }
  return value;
}
