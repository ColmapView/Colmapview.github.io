import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SplatLayer } from './SplatLayer';
import type { SplatLayerStoreFacade } from './SplatLayerStoreFacade';
import { appLogger } from '../../../utils/logger';

const {
  getSplatMeshSourceOptionsMock,
  preloadSparkModuleMock,
  threeContextMock,
  useThreeMock,
  useSplatLayerStoreFacadeMock,
} = vi.hoisted(() => {
  const threeContext = {
    gl: { label: 'webgl-renderer' },
    scene: {
      add: vi.fn(),
      remove: vi.fn(),
    },
    invalidate: vi.fn(),
  };

  return {
    getSplatMeshSourceOptionsMock: vi.fn(),
    preloadSparkModuleMock: vi.fn(),
    threeContextMock: threeContext,
    useThreeMock: vi.fn(() => threeContext),
    useSplatLayerStoreFacadeMock: vi.fn<() => SplatLayerStoreFacade>(),
  };
});

vi.mock('@react-three/fiber', () => ({
  useThree: useThreeMock,
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
        splatRenderer: 'spark',
      });
      expect(facade.actions.setUrlProgress).toHaveBeenCalledWith({
        percent: 93,
        message: 'Reading splat file...',
        currentFile: 'scene.ply',
        splatRenderer: 'spark',
      });
      expect(SparkRenderer).not.toHaveBeenCalled();

      act(() => {
        initialized.resolve();
      });

      await waitFor(() => {
        expect(SparkRenderer).toHaveBeenCalledTimes(1);
      });
      expect(threeContextMock.scene.add).toHaveBeenCalledTimes(1);
      expect(facade.actions.setUrlProgress).toHaveBeenCalledWith({
        percent: 100,
        message: 'Complete',
        currentFile: 'scene.ply',
        splatRenderer: 'spark',
      });
      expect(facade.actions.setUrlLoading).toHaveBeenLastCalledWith(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('waits for Spark sorting to settle before disposing the renderer', async () => {
    const initialized = createDeferred<void>();
    const sparkRendererDispose = vi.fn();
    const SparkRenderer = vi.fn(function SparkRenderer(this: {
      dispose: () => void;
      sorting: boolean;
      sortTimeoutId: number;
    }) {
      this.dispose = sparkRendererDispose;
      this.sorting = true;
      this.sortTimeoutId = -1;
    });
    const { SplatMesh } = createSplatMeshConstructor(initialized.promise);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    useSplatLayerStoreFacadeMock.mockReturnValue(createFacade());

    const view = render(<SplatLayer />);

    await waitFor(() => {
      expect(SplatMesh).toHaveBeenCalledTimes(1);
    });
    act(() => {
      initialized.resolve();
    });
    await waitFor(() => {
      expect(SparkRenderer).toHaveBeenCalledTimes(1);
    });

    const spark = SparkRenderer.mock.instances[0] as unknown as {
      sorting: boolean;
    };

    vi.useFakeTimers();
    try {
      act(() => {
        view.unmount();
      });

      expect(threeContextMock.scene.remove).toHaveBeenCalledWith(spark);
      expect(sparkRendererDispose).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(49);
      });
      expect(sparkRendererDispose).not.toHaveBeenCalled();

      spark.sorting = false;
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(sparkRendererDispose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppresses Spark driveSort target errors after teardown starts', async () => {
    const initialized = createDeferred<void>();
    const sparkRendererDispose = vi.fn();
    const driveSort = vi.fn(() => Promise.reject(new Error('No target')));
    const SparkRenderer = vi.fn(function SparkRenderer(this: {
      dispose: () => void;
      driveSort: () => Promise<void>;
    }) {
      this.dispose = sparkRendererDispose;
      this.driveSort = driveSort;
    });
    const { SplatMesh } = createSplatMeshConstructor(initialized.promise);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    useSplatLayerStoreFacadeMock.mockReturnValue(createFacade());

    const view = render(<SplatLayer />);

    await waitFor(() => {
      expect(SplatMesh).toHaveBeenCalledTimes(1);
    });
    act(() => {
      initialized.resolve();
    });
    await waitFor(() => {
      expect(SparkRenderer).toHaveBeenCalledTimes(1);
    });

    const spark = SparkRenderer.mock.instances[0] as unknown as {
      driveSort: () => Promise<void>;
    };

    act(() => {
      view.unmount();
    });

    await expect(spark.driveSort()).resolves.toBeUndefined();
    expect(driveSort).toHaveBeenCalledTimes(1);
    expect(sparkRendererDispose).toHaveBeenCalledTimes(1);
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

  it('loads and clears the Spark handoff while the point layer is hidden', async () => {
    const initialized = createDeferred<void>();
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) {
      this.dispose = vi.fn();
    });
    const { SplatMesh } = createSplatMeshConstructor(initialized.promise);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    const facade = createFacade({ showSplats: false });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);

    render(<SplatLayer />);

    await waitFor(() => {
      expect(SplatMesh).toHaveBeenCalledTimes(1);
    });
    act(() => {
      initialized.resolve();
    });

    await waitFor(() => {
      expect(facade.actions.setUrlProgress).toHaveBeenCalledWith({
        percent: 100,
        message: 'Complete',
        currentFile: 'scene.ply',
        splatRenderer: 'spark',
      });
    });
    expect(facade.actions.setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(SparkRenderer).not.toHaveBeenCalled();
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

    render(<SplatLayer visible={false} />);

    expect(facade.actions.addNotification).not.toHaveBeenCalled();
    expect(preloadSparkModuleMock).not.toHaveBeenCalled();
  });

  it('does not clear WebGPU URL loading when stale Spark unmount cleanup runs after backend switch', async () => {
    preloadSparkModuleMock.mockReturnValue(new Promise(() => undefined));
    const splatFile = new File(['splat'], 'scene.ply');
    const sparkFacade = createFacade({ splatFile });
    vi.mocked(sparkFacade.actions.getUrlProgress).mockReturnValue({
      percent: 92,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.ply',
      splatRenderer: 'spark',
    });
    useSplatLayerStoreFacadeMock.mockReturnValue(sparkFacade);

    const view = render(<SplatLayer />);

    await waitFor(() => {
      expect(sparkFacade.actions.addNotification).toHaveBeenCalledWith(
        'info',
        'Loading splat: scene.ply',
        0
      );
    });
    vi.mocked(sparkFacade.actions.setUrlLoading).mockClear();
    vi.mocked(sparkFacade.actions.getUrlProgress).mockReturnValue({
      percent: 92,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.ply',
      splatRenderer: 'webgpu',
    });

    view.unmount();

    await waitFor(() => {
      expect(sparkFacade.actions.removeNotification).toHaveBeenCalledWith('notice-id');
    });
    expect(sparkFacade.actions.setUrlLoading).not.toHaveBeenCalledWith(false);
  });

  it('does not overwrite WebGPU-owned progress when a stale Spark load finishes', async () => {
    const initialized = createDeferred<void>();
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) {
      this.dispose = vi.fn();
    });
    const { SplatMesh } = createSplatMeshConstructor(initialized.promise);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    const facade = createFacade();
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(<SplatLayer visible={false} />);

      await waitFor(() => {
        expect(SplatMesh).toHaveBeenCalledTimes(1);
      });
      vi.mocked(facade.actions.setUrlLoading).mockClear();
      vi.mocked(facade.actions.setUrlProgress).mockClear();
      vi.mocked(facade.actions.getUrlProgress).mockReturnValue({
        percent: 96,
        message: 'Uploading splat to GPU...',
        currentFile: 'scene.ply',
        splatRenderer: 'webgpu',
      });

      act(() => {
        initialized.resolve();
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(facade.actions.setUrlProgress).not.toHaveBeenCalledWith({
        percent: 99,
        message: 'Rendering first splat frame...',
        currentFile: 'scene.ply',
        splatRenderer: 'spark',
      });
      expect(facade.actions.setUrlProgress).not.toHaveBeenCalledWith({
        percent: 100,
        message: 'Complete',
        currentFile: 'scene.ply',
        splatRenderer: 'spark',
      });
      expect(facade.actions.setUrlLoading).not.toHaveBeenCalledWith(false);
      expect(facade.actions.addNotification).not.toHaveBeenCalledWith(
        'info',
        'Loaded splat: scene.ply',
        3000
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('preloads Spark while auto mode is preparing WebGPU', () => {
    preloadSparkModuleMock.mockReturnValue(new Promise(() => undefined));
    const facade = createFacade({
      splatBackendAvailability: {
        webGpu: 'unavailable',
        spark: false,
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

    expect(preloadSparkModuleMock).toHaveBeenCalledTimes(1);
    expect(facade.actions.addNotification).not.toHaveBeenCalled();
  });

  it('does not fail global splat loading when auto Spark preload fails while WebGPU can still warm up', async () => {
    preloadSparkModuleMock.mockRejectedValue(new Error('spark unavailable'));
    const facade = createFacade({
      splatBackendAvailability: {
        webGpu: 'unavailable',
        spark: false,
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
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(<SplatLayer />);

      await waitFor(() => {
        expect(facade.actions.setSparkBackendAvailable).toHaveBeenCalledWith(false);
      });
      expect(facade.actions.addNotification).not.toHaveBeenCalledWith(
        'warning',
        'Failed to load splat: scene.ply'
      );
      expect(facade.actions.setUrlLoading).not.toHaveBeenCalledWith(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('spark unavailable'));
    } finally {
      warn.mockRestore();
    }
  });

  it('clears untagged URL handoff loading when forced Spark preload fails', async () => {
    preloadSparkModuleMock.mockRejectedValue(new Error('spark unavailable'));
    const splatFile = new File(['splat'], 'scene.ply');
    const facade = createFacade({
      splatFile,
      requestedBackend: 'spark',
      splatBackendAvailability: {
        webGpu: 'unsupported',
        spark: false,
      },
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'spark',
        backend: null,
        gpuPsnr: false,
        reason: 'Spark renderer is unavailable',
      },
    });
    vi.mocked(facade.actions.getUrlProgress).mockReturnValue({
      percent: 92,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.ply',
    });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(<SplatLayer />);

      await waitFor(() => {
        expect(facade.actions.setSparkBackendAvailable).toHaveBeenCalledWith(false);
      });
      expect(facade.actions.setUrlLoading).toHaveBeenCalledWith(false);
      expect(facade.actions.addNotification).toHaveBeenCalledWith(
        'warning',
        'Failed to load splat: scene.ply'
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('spark unavailable'));
    } finally {
      warn.mockRestore();
    }
  });
});
