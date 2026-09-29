import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SplatLayer } from './SplatLayer';
import type { SplatLayerStoreFacade } from './SplatLayerStoreFacade';
import { appLogger } from '../../../utils/logger';
import { SogBundleError } from '../../../splat/sogBundle';

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
    const { unmount } = render(<SplatLayer />);
    await waitFor(() => expect(SplatMesh).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'scene.sog' })));
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
