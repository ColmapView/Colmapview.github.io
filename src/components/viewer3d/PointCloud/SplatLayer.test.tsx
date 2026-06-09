import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SplatLayer } from './SplatLayer';
import type { SplatLayerStoreFacade } from './SplatLayerStoreFacade';

const {
  getSplatMeshSourceOptionsMock,
  preloadSparkModuleMock,
  useSplatLayerStoreFacadeMock,
} = vi.hoisted(() => ({
  getSplatMeshSourceOptionsMock: vi.fn(),
  preloadSparkModuleMock: vi.fn(),
  useSplatLayerStoreFacadeMock: vi.fn<() => SplatLayerStoreFacade>(),
}));

vi.mock('@react-three/fiber', () => ({
  useThree: vi.fn(() => ({
    gl: { label: 'webgl-renderer' },
    scene: {
      add: vi.fn(),
      remove: vi.fn(),
    },
    invalidate: vi.fn(),
  })),
}));

vi.mock('../../../utils/sparkSplatRuntime', () => ({
  getSplatMeshSourceOptions: getSplatMeshSourceOptionsMock,
  preloadSparkModule: preloadSparkModuleMock,
}));

vi.mock('./SplatLayerStoreFacade', () => ({
  useSplatLayerStoreFacade: () => useSplatLayerStoreFacadeMock(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

interface TestSplatMesh {
  initialized: Promise<void>;
  dispose: () => void;
  matrix: {
    copy: (matrix: THREE.Matrix4) => void;
    identity: () => void;
  };
  matrixAutoUpdate: boolean;
  updateMatrixWorld: (force?: boolean) => void;
}

function createSplatMeshConstructor(initialized: Promise<void>, dispose = vi.fn()) {
  const instances: TestSplatMesh[] = [];
  const SplatMesh = vi.fn(function SplatMesh(this: TestSplatMesh) {
    this.initialized = initialized;
    this.dispose = dispose;
    this.matrix = {
      copy: vi.fn(),
      identity: vi.fn(),
    };
    this.matrixAutoUpdate = true;
    this.updateMatrixWorld = vi.fn();
    instances.push(this);
  });

  return { SplatMesh, instances, dispose };
}

function installAnimationFrameStub() {
  const callbacks: Array<{
    id: number;
    callback: FrameRequestCallback;
    cancelled: boolean;
  }> = [];
  let nextId = 1;
  const requestAnimationFrameSpy = vi
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      const id = nextId;
      nextId += 1;
      callbacks.push({ id, callback, cancelled: false });
      return id;
    });
  const cancelAnimationFrameSpy = vi
    .spyOn(globalThis, 'cancelAnimationFrame')
    .mockImplementation((id: number) => {
      const entry = callbacks.find((item) => item.id === id);
      if (entry) {
        entry.cancelled = true;
      }
    });

  return {
    getActiveCount() {
      return callbacks.filter((item) => !item.cancelled).length;
    },
    fireNextFrame() {
      let entry = callbacks.shift();
      while (entry?.cancelled) {
        entry = callbacks.shift();
      }
      if (!entry) {
        throw new Error('Expected a queued animation frame');
      }
      act(() => {
        entry.callback(performance.now());
      });
    },
    restore() {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    },
  };
}

function createFacade(overrides: Partial<SplatLayerStoreFacade['data']> = {}): SplatLayerStoreFacade {
  return {
    data: {
      showSplats: true,
      splatFile: new File(['splat'], 'scene.ply'),
      requestedBackend: 'auto',
      splatBackendAvailability: {
        webGpu: 'unsupported',
        spark: true,
      },
      splatBackendResolution: {
        status: 'resolved',
        requested: 'auto',
        backend: 'spark',
        gpuPsnr: false,
        reason: 'Spark fallback selected because WebGPU is unsupported',
      },
      ...overrides,
    },
    actions: {
      addNotification: vi.fn(() => 'notice-id'),
      removeNotification: vi.fn(),
      setSparkBackendAvailable: vi.fn(),
      getUrlProgress: vi.fn(() => null),
      setUrlLoading: vi.fn(),
      setUrlProgress: vi.fn(),
    },
  };
}

describe('SplatLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSplatMeshSourceOptionsMock.mockResolvedValue({ file: new File(['splat'], 'scene.ply') });
  });

  it('does not mount SparkRenderer until a SplatMesh has initialized', async () => {
    const initialized = createDeferred<void>();
    const animationFrame = installAnimationFrameStub();
    const sparkRendererDispose = vi.fn();
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) {
      this.dispose = sparkRendererDispose;
    });
    const { SplatMesh } = createSplatMeshConstructor(initialized.promise);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    const facade = createFacade();
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(<SplatLayer />);

      await waitFor(() => {
        expect(SplatMesh).toHaveBeenCalledTimes(1);
      });
      expect(facade.actions.setUrlLoading).toHaveBeenCalledWith(true);
      expect(facade.actions.setUrlProgress).toHaveBeenCalledWith({
        percent: 92,
        message: 'Preparing splat renderer...',
        currentFile: 'scene.ply',
      });
      expect(facade.actions.setUrlProgress).toHaveBeenCalledWith({
        percent: 93,
        message: 'Reading splat file...',
        currentFile: 'scene.ply',
      });
      expect(SparkRenderer).not.toHaveBeenCalled();

      act(() => {
        initialized.resolve();
      });

      await waitFor(() => {
        expect(animationFrame.getActiveCount()).toBe(1);
      });
      expect(SparkRenderer).not.toHaveBeenCalled();

      animationFrame.fireNextFrame();
      await Promise.resolve();
      await Promise.resolve();

      await waitFor(() => {
        expect(SparkRenderer).toHaveBeenCalledTimes(1);
      });
      expect(facade.actions.setUrlProgress).toHaveBeenCalledWith({
        percent: 100,
        message: 'Complete',
        currentFile: 'scene.ply',
      });
      expect(facade.actions.setUrlLoading).toHaveBeenLastCalledWith(false);
    } finally {
      animationFrame.restore();
      consoleError.mockRestore();
    }
  });

  it('applies the splat model matrix to an initialized Spark mesh', async () => {
    const initialized = createDeferred<void>();
    const modelMatrix = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) {
      this.dispose = vi.fn();
    });
    const { SplatMesh, instances } = createSplatMeshConstructor(initialized.promise);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    useSplatLayerStoreFacadeMock.mockReturnValue(createFacade({ showSplats: false }));

    render(<SplatLayer modelMatrix={modelMatrix} />);

    await waitFor(() => {
      expect(SplatMesh).toHaveBeenCalledTimes(1);
    });
    act(() => {
      initialized.resolve();
    });

    await waitFor(() => {
      expect(instances[0].matrix.copy).toHaveBeenCalledWith(modelMatrix);
    });
    expect(instances[0].matrix.identity).not.toHaveBeenCalled();
    expect(instances[0].matrixAutoUpdate).toBe(false);
    expect(instances[0].updateMatrixWorld).toHaveBeenCalledWith(true);
  });

  it('does not show Spark loading notifications when WebGPU is forced', () => {
    const facade = createFacade({
      requestedBackend: 'webgpu',
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'webgpu',
        backend: null,
        gpuPsnr: false,
        reason: 'WebGPU splat renderer is not available',
      },
    });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);

    render(<SplatLayer />);

    expect(facade.actions.addNotification).not.toHaveBeenCalled();
    expect(preloadSparkModuleMock).not.toHaveBeenCalled();
  });

  it('does not preload Spark while auto mode is preparing WebGPU', () => {
    const facade = createFacade({
      splatBackendAvailability: {
        webGpu: 'unavailable',
        spark: true,
      },
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'auto',
        backend: null,
        gpuPsnr: false,
        reason: 'Preparing WebGPU splat renderer',
      },
    });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);

    render(<SplatLayer />);

    expect(preloadSparkModuleMock).not.toHaveBeenCalled();
    expect(facade.actions.addNotification).not.toHaveBeenCalled();
  });
});
