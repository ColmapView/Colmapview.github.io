import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SplatLayer } from './SplatLayer';
import type { SplatLayerStoreFacade } from './SplatLayerStoreFacade';
import { appLogger } from '../../../utils/logger';
import { SogBundleError } from '../../../splat/sogBundle';
import {
  useNotificationStore,
  usePointCloudStore,
  useReconstructionStore,
  useSplatBackendStore,
  useUIStore,
} from '../../../store';
import type { UrlLoadProgress } from '../../../types/manifest';
import { processFileDropzoneFiles } from '../../../hooks/fileDropzoneWorkflow';
import { noopLogger } from '../../../utils/logger';
import { buildLoadedFiles } from '../../../test/builders';

const {
  detectTouchDeviceMock,
  getSplatMeshSourceOptionsMock,
  preloadSparkModuleMock,
  threeContextMock,
  useThreeMock,
  useSplatLayerStoreFacadeMock,
  validateSogBundleMock,
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
    detectTouchDeviceMock: vi.fn<() => boolean>(),
    getSplatMeshSourceOptionsMock: vi.fn(),
    preloadSparkModuleMock: vi.fn(),
    threeContextMock: threeContext,
    useThreeMock: vi.fn(() => threeContext),
    useSplatLayerStoreFacadeMock: vi.fn<() => SplatLayerStoreFacade>(),
    validateSogBundleMock: vi.fn(),
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

vi.mock('../../../splat/sogBundle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../splat/sogBundle')>()),
  validateSogBundle: validateSogBundleMock,
}));

vi.mock('../../../hooks/useIsTouchDevice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useIsTouchDevice')>();
  // Real detection by default (jsdom has no matchMedia, so it reports desktop);
  // the touch-ceiling test overrides a single call.
  detectTouchDeviceMock.mockImplementation(actual.detectTouchDevice);
  return { ...actual, detectTouchDevice: detectTouchDeviceMock };
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

/** What validateSogBundle resolves to: the checked info and the canonical bundle Spark must receive. */
function validatedSog(bundle: Blob = new Blob(['canonical'])) {
  return { info: { version: 2 as const, count: 100, shBands: 0 }, bundle };
}

function readText(blob: Blob): Promise<string> {
  // jsdom's Blob has no text(); FileReader reads it.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
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
      setSparkPreloadFailed: vi.fn(),
      getUrlProgress: vi.fn(() => null),
      setUrlLoading: vi.fn(),
      setUrlProgress: vi.fn(),
      dropFailedSplat: vi.fn(),
      isDatasetLoadPending: vi.fn(() => false),
      isSplatDownloadPending: vi.fn(() => false),
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

  it('does not preload Spark while auto mode is preparing WebGPU', () => {
    // 'unavailable' is a capable-but-not-yet-initialized WebGPU machine — the
    // state every fresh page reports until a splat canvas mounts. Preloading
    // here downloaded the 5 MB Spark fallback on the first drop of every
    // session, so the gate now waits for 'unsupported'/'failed'.
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

    expect(preloadSparkModuleMock).not.toHaveBeenCalled();
    expect(facade.actions.addNotification).not.toHaveBeenCalled();
    expect(facade.actions.setUrlLoading).not.toHaveBeenCalledWith(false);
  });

  it('preloads Spark and records a terminal failure when auto WebGPU has already failed', async () => {
    preloadSparkModuleMock.mockRejectedValue(new Error('spark unavailable'));
    const facade = createFacade({
      splatBackendAvailability: {
        webGpu: 'failed',
        spark: false,
      },
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'auto',
        backend: null,
        gpuPsnr: false,
        reason: 'WebGPU splat renderer failed to initialize',
      },
    });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(<SplatLayer />);

      expect(preloadSparkModuleMock).toHaveBeenCalledTimes(1);
      // Terminal failure, not "still not loaded": the availability flag alone
      // cannot end the pending window.
      await waitFor(() => {
        expect(facade.actions.setSparkPreloadFailed).toHaveBeenCalled();
      });
      expect(facade.actions.setSparkBackendAvailable).not.toHaveBeenCalled();
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
        expect(facade.actions.setSparkPreloadFailed).toHaveBeenCalled();
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

  it('does not re-attempt the Spark download after a terminal preload failure', async () => {
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
    // The real store now genuinely changes state on failure — that is the point
    // of the fix — so the availability OBJECT IDENTITY changes and the preload
    // effect's dep changes with it. A static facade hides the re-run; model the
    // store instead, or this test cannot see the second 5 MB download.
    vi.mocked(facade.actions.setSparkPreloadFailed).mockImplementation(() => {
      facade.data.splatBackendAvailability = {
        webGpu: 'unsupported',
        spark: false,
        sparkPreloadFailed: true,
      };
    });
    vi.mocked(facade.actions.getUrlProgress).mockReturnValue({
      percent: 92,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.ply',
    });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      const { rerender } = render(<SplatLayer />);

      await waitFor(() => {
        expect(facade.actions.setSparkPreloadFailed).toHaveBeenCalled();
      });

      // The re-render the store update would have caused.
      rerender(<SplatLayer />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(preloadSparkModuleMock).toHaveBeenCalledTimes(1);
      const failureWarnings = vi.mocked(facade.actions.addNotification).mock.calls.filter(
        ([type, message]) => type === 'warning' && message === `Failed to load splat: ${splatFile.name}`
      );
      expect(failureWarnings).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('reports a splat that began loading during a dataset load as that load\'s own', async () => {
    // The splat a load committed, or restored from saved settings, before the load finishes.
    const initialized = createDeferred<void>();
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(initialized.promise);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    const facade = createFacade();
    vi.mocked(facade.actions.isDatasetLoadPending).mockReturnValue(true);
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);
    // React DOM does not know R3F's <primitive>.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(<SplatLayer />);
      await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(1));
      expect(facade.actions.setUrlLoading).toHaveBeenCalledWith(true);
      expect(facade.actions.setUrlProgress).toHaveBeenCalledWith(expect.objectContaining({ message: 'Initializing splat renderer...' }));

      await act(async () => { initialized.resolve(); });

      await waitFor(() => {
        expect(facade.actions.setUrlProgress).toHaveBeenCalledWith(expect.objectContaining({ message: 'Complete' }));
      });
      expect(facade.actions.setUrlLoading).toHaveBeenLastCalledWith(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('leaves the scene without a splat Spark could not load, so its points show again', async () => {
    let failInit!: (error: Error) => void;
    const initialized = new Promise<void>((_resolve, reject) => { failInit = reject; });
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(initialized);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    const splatFile = new File(['splat'], 'scene.ply');
    const facade = createFacade({ splatFile });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(<SplatLayer />);
      await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(1));

      await act(async () => { failInit(new Error('decode failed')); });

      await waitFor(() => {
        expect(facade.actions.addNotification).toHaveBeenCalledWith('warning', 'Failed to load splat: scene.ply');
      });
      expect(facade.actions.dropFailedSplat).toHaveBeenCalledExactlyOnceWith(splatFile);
    } finally {
      warn.mockRestore();
    }
  });

  it('refuses a damaged SOG with its reason and never creates a Spark mesh', async () => {
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(Promise.resolve());
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    validateSogBundleMock.mockRejectedValue(new SogBundleError('meta.json is missing.'));
    const facade = createFacade({ splatFile: new File(['sog'], 'scene.sog') });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(<SplatLayer />);

      await waitFor(() => {
        expect(facade.actions.addNotification).toHaveBeenCalledWith('warning', "This SOG file can't be opened: meta.json is missing.");
      });
      expect(SplatMesh).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('meta.json is missing.'));
    } finally {
      warn.mockRestore();
    }
  });

  it('hands Spark the canonical SOG bundle, never the original file, and never validates PLY files', async () => {
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(Promise.resolve());
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    validateSogBundleMock.mockResolvedValue(validatedSog(new Blob(['canonical-bundle'])));
    const original = new File(['sog'], 'scene.sog', { type: 'application/octet-stream', lastModified: 1234 });
    useSplatLayerStoreFacadeMock.mockReturnValue(createFacade({ splatFile: original }));
    const info = vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
    const { unmount } = render(<SplatLayer />);
    await waitFor(() => expect(SplatMesh).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'scene.sog' })));
    // The validated info is logged once: file name, SOG version, splat count and SH bands.
    expect(info.mock.calls.filter(([line]) => String(line).includes('scene.sog'))).toEqual([
      ['[Splats] Validated scene.sog: SOG v2, 100 splats, 0 SH bands'],
    ]);
    info.mockRestore();
    expect(validateSogBundleMock).toHaveBeenCalledTimes(1);
    expect(validateSogBundleMock.mock.calls[0][0]).toBe(original);
    expect(getSplatMeshSourceOptionsMock).toHaveBeenCalledTimes(1);
    const handed = getSplatMeshSourceOptionsMock.mock.calls[0][0] as File;
    expect(handed).not.toBe(original);
    expect(handed).toBeInstanceOf(File);
    expect(handed).toMatchObject({ name: 'scene.sog', type: 'application/octet-stream', lastModified: 1234 });
    expect(await readText(handed)).toBe('canonical-bundle');
    unmount();

    validateSogBundleMock.mockClear();
    useSplatLayerStoreFacadeMock.mockReturnValue(createFacade());
    render(<SplatLayer />);
    await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(2));
    expect(validateSogBundleMock).not.toHaveBeenCalled();
  });

  it('caps SOG validation at the touch splat ceiling on touch devices only', async () => {
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(Promise.resolve());
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    validateSogBundleMock.mockResolvedValue(validatedSog());
    // Each validated SOG is reported at info level.
    const info = vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);

    try {
      detectTouchDeviceMock.mockReturnValueOnce(true);
      const touchFile = new File(['sog'], 'phone.sog');
      useSplatLayerStoreFacadeMock.mockReturnValue(createFacade({ splatFile: touchFile }));
      const { unmount } = render(<SplatLayer />);
      await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(1));
      expect(validateSogBundleMock).toHaveBeenCalledWith(touchFile, { maxSplats: 3_000_000 });
      unmount();

      validateSogBundleMock.mockClear();
      const desktopFile = new File(['sog'], 'desktop.sog');
      useSplatLayerStoreFacadeMock.mockReturnValue(createFacade({ splatFile: desktopFile }));
      render(<SplatLayer />);
      await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(2));
      expect(validateSogBundleMock).toHaveBeenCalledTimes(1);
      const [validatedFile, options] = validateSogBundleMock.mock.calls[0] as [File, { maxSplats?: number }];
      expect(validatedFile).toBe(desktopFile);
      expect(options).toHaveProperty('maxSplats', undefined);
    } finally {
      info.mockRestore();
    }
  });

  it('drops a SOG whose validation finishes after the layer unmounts', async () => {
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(Promise.resolve());
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    const validation = createDeferred<ReturnType<typeof validatedSog>>();
    validateSogBundleMock.mockReturnValue(validation.promise);
    const facade = createFacade({ splatFile: new File(['sog'], 'scene.sog') });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);

    const { unmount } = render(<SplatLayer />);
    await waitFor(() => expect(validateSogBundleMock).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      validation.resolve(validatedSog());
      await validation.promise;
    });

    expect(getSplatMeshSourceOptionsMock).not.toHaveBeenCalled();
    expect(SplatMesh).not.toHaveBeenCalled();
    expect(facade.actions.addNotification).not.toHaveBeenCalledWith('warning', expect.any(String));
  });
});

/** A URL load that has parsed its files and is settling its saved settings: the scene on screen is still the old one. */
function holdUrlLoadBeforeSceneCommit() {
  const store = useReconstructionStore.getState;
  const signal = store().tryStartUrlLoad()!;
  const settings: UrlLoadProgress = { percent: 90, message: 'Loading saved view settings...' };
  const pending = processFileDropzoneFiles(new Map([['photo.jpg', new File(['jpg'], 'photo.jpg')]]), {
    addNotification: vi.fn(), clearCaches: vi.fn(), getLoadedFiles: () => store().loadedFiles,
    getMinTrackLength: () => 1, getSourceInfo: () => ({ sourceType: 'url', imageUrlBase: null }),
    getUrlLoading: () => store().urlLoading, logger: noopLogger, resetView: vi.fn(), setDroppedFiles: vi.fn(),
    setError: vi.fn(), setLoadedFiles: vi.fn(), setReconstruction: vi.fn(), setUrlLoading: store().setUrlLoading,
    setUrlProgress: store().setUrlProgress, setWasmReconstruction: vi.fn(),
  }, {
    signal,
    beforeSceneCommit: () => {
      store().setUrlProgress(settings);
      // Like the settings fetch, it ends only when the load is cancelled.
      return new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    },
  });
  return { pending, settings };
}

describe('SplatLayer while a new dataset load settles before replacing the scene', () => {
  const oldSplat = new File(['splat'], 'old.ply');
  const notices = () => useNotificationStore.getState().notifications.map(notification => notification.message);

  beforeEach(async () => {
    vi.clearAllMocks();
    getSplatMeshSourceOptionsMock.mockResolvedValue({ file: oldSplat });
    // The real facade and stores: the overlay, progress and Cancel under test are the store's.
    const actual = await vi.importActual<typeof import('./SplatLayerStoreFacade')>('./SplatLayerStoreFacade');
    useSplatLayerStoreFacadeMock.mockImplementation(actual.useSplatLayerStoreFacade);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useSplatBackendStore.getState().setRequestedBackend('spark');
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'), imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'), splatFile: oldSplat,
      splatFileSources: [{ id: 'old.ply', path: 'old.ply', file: oldSplat }],
    }));
  });

  afterEach(() => {
    cleanup();
    useReconstructionStore.getState().clear();
    useSplatLayerStoreFacadeMock.mockReset();
  });

  /** The old splat decodes in Spark, then a URL load starts and holds just before its scene commit. */
  async function holdLoadWhileOldSplatDecodes(sourceOptions?: Promise<unknown>) {
    let settleInit!: { resolve: () => void; reject: (error: Error) => void };
    const initialized = new Promise<void>((resolve, reject) => { settleInit = { resolve, reject }; });
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(initialized);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    if (sourceOptions) getSplatMeshSourceOptionsMock.mockReturnValue(sourceOptions);

    render(<SplatLayer />);
    await waitFor(() => expect(sourceOptions ? getSplatMeshSourceOptionsMock : SplatMesh).toHaveBeenCalledTimes(1));
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true,
      urlProgress: expect.objectContaining({ currentFile: 'old.ply', splatRenderer: 'spark' }) });

    const load = holdUrlLoadBeforeSceneCommit();
    await waitFor(() => expect(useReconstructionStore.getState().urlProgress).toEqual(load.settings));
    return { ...load, settleInit, SplatMesh };
  }

  async function expectNewLoadKeepsOverlayProgressAndCancel(load: ReturnType<typeof holdUrlLoadBeforeSceneCommit>) {
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: load.settings, urlLoadActive: true });
    act(() => useReconstructionStore.getState().cancelLoading());
    expect(await load.pending).toBe(false);
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
  }

  it('keeps them when the old splat fails, and still shows the old scene without it', async () => {
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    try {
      const load = await holdLoadWhileOldSplatDecodes();

      await act(async () => { load.settleInit.reject(new Error('decode failed')); });

      await waitFor(() => expect(notices()).toContain('Failed to load splat: old.ply'));
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
      expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
      await expectNewLoadKeepsOverlayProgressAndCancel(load);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps them when the old splat finishes loading', async () => {
    // React DOM does not know R3F's <primitive>.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const load = await holdLoadWhileOldSplatDecodes();

      await act(async () => { load.settleInit.resolve(); });

      await waitFor(() => expect(notices()).toContain('Loaded splat: old.ply'));
      await expectNewLoadKeepsOverlayProgressAndCancel(load);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps them when the old splat reports progress', async () => {
    const sourceOptions = createDeferred<{ file: File }>();
    const load = await holdLoadWhileOldSplatDecodes(sourceOptions.promise);

    // Spark reports its next phase, initializing the mesh, just before it creates the mesh.
    await act(async () => { sourceOptions.resolve({ file: oldSplat }); });

    await waitFor(() => expect(load.SplatMesh).toHaveBeenCalledTimes(1));
    await expectNewLoadKeepsOverlayProgressAndCancel(load);
  });
});

describe('SplatLayer while a tile picked with n downloads', () => {
  const oldSplat = new File(['splat'], 'old.ply');
  const notices = () => useNotificationStore.getState().notifications.map(notification => notification.message);
  let download: { signal?: AbortSignal; fail: (error: Error) => void } | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    download = undefined;
    getSplatMeshSourceOptionsMock.mockResolvedValue({ file: oldSplat });
    // The real facade and stores: the overlay, progress and Cancel under test are the store's.
    const actual = await vi.importActual<typeof import('./SplatLayerStoreFacade')>('./SplatLayerStoreFacade');
    useSplatLayerStoreFacadeMock.mockImplementation(actual.useSplatLayerStoreFacade);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useSplatBackendStore.getState().setRequestedBackend('spark');
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    // A remote dataset: the old tile was downloaded and is active, the next one is listed lazily.
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'), imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'), splatFile: oldSplat, splatFiles: [oldSplat],
      splatFileSources: [
        { id: 'tiles/old.ply', path: 'tiles/old.ply', url: 'https://x/tiles/old.ply', file: oldSplat, size: 5 },
        { id: 'tiles/next.ply', path: 'tiles/next.ply', url: 'https://x/tiles/next.ply', size: 100 },
      ],
    }));
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      download = { signal: init?.signal ?? undefined, fail: reject };
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
  });

  afterEach(() => {
    cleanup();
    useReconstructionStore.getState().clear();
    useSplatLayerStoreFacadeMock.mockReset();
    vi.unstubAllGlobals();
  });

  /** Spark decodes the old tile, then `n` starts downloading the next one, with its own overlay and Cancel. */
  async function pickNextWhileOldDecodes() {
    let settleInit!: { resolve: () => void; reject: (error: Error) => void };
    const initialized = new Promise<void>((resolve, reject) => { settleInit = { resolve, reject }; });
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(initialized);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    render(<SplatLayer />);
    await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(1));
    act(() => { void useReconstructionStore.getState().selectSplatSource('tiles/next.ply'); });
    await waitFor(() => expect(download).toBeDefined());
    const progress = useReconstructionStore.getState().urlProgress;
    expect(progress).toMatchObject({ currentFile: 'next.ply' });
    return { settleInit, progress };
  }

  it('leaves the tile download its overlay, progress, URL error and Cancel when Spark starts meanwhile', async () => {
    // Spark takes over a tile another renderer was showing after the next tile's download began.
    const initialized = createDeferred<void>();
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(initialized.promise);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    let selecting!: Promise<void>;
    act(() => { selecting = useReconstructionStore.getState().selectSplatSource('tiles/next.ply'); });
    await waitFor(() => expect(download).toBeDefined());
    const progress = useReconstructionStore.getState().urlProgress;
    const urlError = { type: 'network' as const, message: 'Earlier URL error' };
    useReconstructionStore.setState({ urlError });

    render(<SplatLayer />);
    await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(1));

    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: progress, urlError });
    expect(download!.signal!.aborted).toBe(false);
    await act(async () => { useReconstructionStore.getState().cancelLoading(); await selecting; });
    expect(download!.signal!.aborted).toBe(true);
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: false, urlProgress: null });
  });

  it('keeps the download overlay when the old splat finishes', async () => {
    // React DOM does not know R3F's <primitive>.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { settleInit, progress } = await pickNextWhileOldDecodes();

      await act(async () => { settleInit.resolve(); });

      await waitFor(() => expect(notices()).toContain('Loaded splat: old.ply'));
      expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: progress });
      expect(download?.signal?.aborted).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps the download overlay when the old splat fails, and shows the points again', async () => {
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    try {
      const { settleInit, progress } = await pickNextWhileOldDecodes();

      await act(async () => { settleInit.reject(new Error('decode failed')); });

      await waitFor(() => expect(notices()).toContain('Failed to load splat: old.ply'));
      expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: progress });
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
      expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });

      // The download fails as well: nothing is left with the near-invisible splat point display.
      await act(async () => { download!.fail(new TypeError('network down')); });
      await waitFor(() => expect(useReconstructionStore.getState().urlLoading).toBe(false));
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
      expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
    } finally {
      warn.mockRestore();
    }
  });
});
