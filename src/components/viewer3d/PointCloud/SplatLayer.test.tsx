import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      splatBackendResolution: {
        status: 'resolved',
        requested: 'auto',
        backend: 'spark',
        gpuPsnr: false,
        reason: 'Spark fallback selected until the WebGPU renderer is available',
      },
      ...overrides,
    },
    actions: {
      addNotification: vi.fn(() => 'notice-id'),
      removeNotification: vi.fn(),
      setSparkBackendAvailable: vi.fn(),
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
    const splatMeshDispose = vi.fn();
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) {
      this.dispose = sparkRendererDispose;
    });
    const SplatMesh = vi.fn(function SplatMesh(this: { initialized: Promise<void>; dispose: () => void }) {
      this.initialized = initialized.promise;
      this.dispose = splatMeshDispose;
    });
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    useSplatLayerStoreFacadeMock.mockReturnValue(createFacade());
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(<SplatLayer />);

      await waitFor(() => {
        expect(SplatMesh).toHaveBeenCalledTimes(1);
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
    } finally {
      animationFrame.restore();
      consoleError.mockRestore();
    }
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
});
