import { act, render, screen, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createLoadedVisibleWebGpuSplatRendererAdapter,
  createVisibleWebGpuSplatRendererAdapter,
} from '../../splat/webgpu/visibleSplatRendererAdapter';
import { loadGaussianCloudFromFile } from '../../splat/gaussianCloudLoader';
import {
  shouldClearUnavailableForcedWebGpuSplatLoading,
  shouldMountWebGpuSplatCanvas,
  shouldRenderWebGpuSplatCanvas,
  shouldSyncWebGpuSplatCanvasFrame,
} from './WebGpuSplatCanvasLayerPolicy';
import {
  WebGpuSplatCanvasLayer,
} from './WebGpuSplatCanvasLayer';
import { waitForWebGpuSplatViewIdle } from './webGpuSplatViewIdle';
import {
  createWebGpuSplatFrameSnapshot,
  syncWebGpuSplatFrameSnapshot,
} from './WebGpuSplatCanvasRuntime';
import type {
  SplatBackendAvailability,
  SplatBackendResolution,
} from '../../utils/splatBackendPolicy';
import type { GaussianCloud } from '../../splat';
import type { LoadedGaussianCloud } from '../../splat/gaussianCloud';
import type { UrlLoadProgress } from '../../types/manifest';
import type { NotificationState } from '../../store';
import type {
  LoadedVisibleWebGpuSplatRendererAdapterDeps,
  VisibleWebGpuSplatCloudOptions,
  VisibleWebGpuSplatRendererAdapter,
} from '../../splat/webgpu/visibleSplatRendererAdapter';
import { appLogger } from '../../utils/logger';
import { useSplatBackendStore } from '../../store';

vi.mock('../../splat/webgpu/visibleSplatRendererAdapter', () => ({
  createLoadedVisibleWebGpuSplatRendererAdapter: vi.fn(),
  createVisibleWebGpuSplatRendererAdapter: vi.fn(),
}));

vi.mock('../../splat/gaussianCloudLoader', () => ({
  loadGaussianCloudFromFile: vi.fn(),
}));

function makeCloud(): GaussianCloud {
  return {
    count: 1,
    positions: new Float32Array([0, 0, 0]),
    scales: new Float32Array([1, 1, 1]),
    rotations: new Float32Array([1, 0, 0, 0]),
    opacities: new Float32Array([0.5]),
    sh0: new Float32Array([0.1, 0.2, 0.3]),
    shDegree: 0,
  };
}

function makeLargeShCloud(options: { shByteLength?: number } = {}): GaussianCloud {
  return {
    ...makeCloud(),
    count: 5_000_000,
    shDegree: 3,
    shN: options.shByteLength === undefined
      ? undefined
      : { byteLength: options.shByteLength } as Float32Array,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function makePreflightAdapter(
  limits: Partial<GPUSupportedLimits> = {}
): Pick<GPUAdapter, 'limits' | 'requestDevice'> {
  return {
    limits: limits as GPUSupportedLimits,
    requestDevice: vi.fn(),
  };
}

function installWebGpuPreflightProvider(
  requestAdapter = vi.fn().mockResolvedValue(makePreflightAdapter())
) {
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: {
      requestAdapter,
      getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm'),
    },
  });
  return requestAdapter;
}

function resolveLoadedRenderer(renderer: unknown) {
  return async (
    _canvas: HTMLCanvasElement,
    cloud: GaussianCloud,
    cloudOptions: VisibleWebGpuSplatCloudOptions
  ): Promise<VisibleWebGpuSplatRendererAdapter> => {
    (renderer as VisibleWebGpuSplatRendererAdapter).loadCloud(cloud, cloudOptions);
    return renderer as VisibleWebGpuSplatRendererAdapter;
  };
}

function WebGpuFailureHarness({ splatFile }: { splatFile: File }) {
  const requestedBackend = useSplatBackendStore((s) => s.requestedBackend);
  const availability = useSplatBackendStore((s) => s.availability);
  const resolution = useSplatBackendStore((s) => s.resolution);
  const setWebGpuBackendState = useSplatBackendStore((s) => s.setWebGpuBackendState);
  const mounted = shouldMountWebGpuSplatCanvas(requestedBackend, availability, splatFile);
  const visible = shouldRenderWebGpuSplatCanvas(resolution, splatFile);

  return (
    <>
      <span data-testid="webgpu-mounted-state">{String(mounted)}</span>
      <span data-testid="webgpu-resolution-state">{resolution.status}</span>
      <WebGpuSplatCanvasLayer
        mounted={mounted}
        visible={visible}
        splatFile={splatFile}
        onRuntimeFailed={(reason) => setWebGpuBackendState('failed', reason)}
      />
    </>
  );
}

function WebGpuAutoTransitionHarness({
  splatFile,
  addNotification,
  removeNotification,
  getUrlProgress,
  setUrlLoading,
  setUrlProgress,
}: {
  splatFile: File;
  addNotification?: NotificationState['addNotification'];
  removeNotification?: NotificationState['removeNotification'];
  getUrlProgress?: () => UrlLoadProgress | null;
  setUrlLoading?: (loading: boolean) => void;
  setUrlProgress?: (progress: UrlLoadProgress | null) => void;
}) {
  const requestedBackend = useSplatBackendStore((s) => s.requestedBackend);
  const availability = useSplatBackendStore((s) => s.availability);
  const resolution = useSplatBackendStore((s) => s.resolution);
  const setWebGpuBackendState = useSplatBackendStore((s) => s.setWebGpuBackendState);
  const mounted = shouldMountWebGpuSplatCanvas(requestedBackend, availability, splatFile);
  const visible = shouldRenderWebGpuSplatCanvas(resolution, splatFile);
  const webGpuBackendSelected = resolution.status === 'resolved'
    && resolution.backend === 'webgpu';
  const reportLoadingProgress = requestedBackend === 'webgpu'
    || webGpuBackendSelected
    || (
      requestedBackend === 'auto'
      && !availability.spark
    );
  const handleRuntimeReady = useCallback(() => {
    setWebGpuBackendState('ready');
  }, [setWebGpuBackendState]);
  const handleRuntimeFailed = useCallback((reason: string) => {
    setWebGpuBackendState('failed', reason);
  }, [setWebGpuBackendState]);

  return (
    <>
      <span data-testid="auto-backend-state">
        {resolution.status === 'resolved' ? resolution.backend : resolution.status}
      </span>
      <span data-testid="auto-webgpu-mounted-state">{String(mounted)}</span>
      <span data-testid="auto-webgpu-visible-state">{String(visible)}</span>
      <WebGpuSplatCanvasLayer
        mounted={mounted}
        visible={visible}
        splatFile={splatFile}
        addNotification={addNotification}
        removeNotification={removeNotification}
        getUrlProgress={getUrlProgress}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
        reportLoadingProgress={reportLoadingProgress}
        onRuntimeReady={handleRuntimeReady}
        onRuntimeFailed={handleRuntimeFailed}
      />
    </>
  );
}

describe('WebGpuSplatCanvasLayer', () => {
  const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
  const webGpuResolution: SplatBackendResolution = {
    status: 'resolved',
    requested: 'auto',
    backend: 'webgpu',
    gpuPsnr: true,
    reason: 'WebGPU renderer selected automatically',
  };
  const unavailableWebGpuAvailability: SplatBackendAvailability = {
    webGpu: 'unavailable',
    spark: true,
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
    installWebGpuPreflightProvider();
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: originalGpu,
    });
  });

  it('renders only for the resolved WebGPU splat backend with a splat file', () => {
    const file = new File(['x'], 'scene.spz');
    expect(shouldRenderWebGpuSplatCanvas(webGpuResolution, file)).toBe(true);
    expect(shouldRenderWebGpuSplatCanvas(webGpuResolution, file, false)).toBe(false);
    expect(shouldRenderWebGpuSplatCanvas(webGpuResolution, undefined)).toBe(false);
    expect(shouldRenderWebGpuSplatCanvas({
      status: 'resolved',
      requested: 'auto',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU is unsupported',
    }, file)).toBe(false);
  });

  it('mounts only for supported Gaussian files when WebGPU can still initialize', () => {
    const readyWebGpuAvailability: SplatBackendAvailability = {
      webGpu: 'ready',
      spark: true,
    };
    expect(shouldMountWebGpuSplatCanvas('auto', unavailableWebGpuAvailability, new File(['x'], 'scene.spz')))
      .toBe(true);
    expect(shouldMountWebGpuSplatCanvas('webgpu', unavailableWebGpuAvailability, new File(['x'], 'scene.spz')))
      .toBe(true);
    expect(shouldMountWebGpuSplatCanvas('webgpu', unavailableWebGpuAvailability, new File(['x'], 'scene.ply')))
      .toBe(true);
    expect(shouldMountWebGpuSplatCanvas('webgpu', readyWebGpuAvailability, new File(['x'], 'scene.SPZ')))
      .toBe(true);
    expect(shouldMountWebGpuSplatCanvas('webgpu', readyWebGpuAvailability, new File(['x'], 'scene.PLY')))
      .toBe(true);
    expect(shouldMountWebGpuSplatCanvas('webgpu', readyWebGpuAvailability, new File(['x'], 'scene.splat')))
      .toBe(false);
    expect(shouldMountWebGpuSplatCanvas('spark', unavailableWebGpuAvailability, new File(['x'], 'scene.spz')))
      .toBe(false);
    expect(shouldMountWebGpuSplatCanvas('spark', readyWebGpuAvailability, new File(['x'], 'scene.spz')))
      .toBe(false);
    expect(shouldMountWebGpuSplatCanvas('auto', unavailableWebGpuAvailability, new File(['x'], 'scene.splat')))
      .toBe(false);
    expect(shouldMountWebGpuSplatCanvas('auto', { webGpu: 'unsupported', spark: true }, new File(['x'], 'scene.spz')))
      .toBe(false);
    expect(shouldMountWebGpuSplatCanvas('auto', { webGpu: 'failed', spark: true }, new File(['x'], 'scene.spz')))
      .toBe(false);
  });

  it('syncs hidden WebGPU frames only until the backend has produced its first frame', () => {
    const preparingResolution: SplatBackendResolution = {
      status: 'unavailable',
      requested: 'auto',
      backend: null,
      gpuPsnr: false,
      reason: 'Preparing WebGPU splat renderer',
    };
    const sparkFallbackResolution: SplatBackendResolution = {
      status: 'resolved',
      requested: 'auto',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark compatibility renderer active while WebGPU initializes',
    };

    expect(shouldSyncWebGpuSplatCanvasFrame(true, false, preparingResolution)).toBe(true);
    expect(shouldSyncWebGpuSplatCanvasFrame(true, false, sparkFallbackResolution)).toBe(true);
    expect(shouldSyncWebGpuSplatCanvasFrame(true, true, webGpuResolution)).toBe(true);
    expect(shouldSyncWebGpuSplatCanvasFrame(true, false, webGpuResolution)).toBe(false);
    expect(shouldSyncWebGpuSplatCanvasFrame(true, false, webGpuResolution, true)).toBe(true);
    expect(shouldSyncWebGpuSplatCanvasFrame(false, true, webGpuResolution)).toBe(false);
  });

  it('clears forced WebGPU loading only when the unavailable state belongs to the active splat file', () => {
    const file = new File(['x'], 'scene.spz');
    const unavailableResolution: SplatBackendResolution = {
      status: 'unavailable',
      requested: 'webgpu',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU splat renderer is not available',
    };

    expect(shouldClearUnavailableForcedWebGpuSplatLoading(
      'webgpu',
      unavailableResolution,
      file,
      false,
      {
        percent: 60,
        message: 'Preparing splat renderer...',
        currentFile: 'scene.spz',
        splatRenderer: 'webgpu',
      }
    )).toBe(true);
    expect(shouldClearUnavailableForcedWebGpuSplatLoading(
      'webgpu',
      unavailableResolution,
      file,
      true,
      { percent: 60, message: 'Preparing splat renderer...', currentFile: 'scene.spz' }
    )).toBe(false);
    expect(shouldClearUnavailableForcedWebGpuSplatLoading(
      'auto',
      unavailableResolution,
      file,
      false,
      { percent: 60, message: 'Preparing splat renderer...', currentFile: 'scene.spz' }
    )).toBe(false);
    expect(shouldClearUnavailableForcedWebGpuSplatLoading(
      'webgpu',
      unavailableResolution,
      file,
      false,
      { percent: 60, message: 'Preparing splat renderer...', currentFile: 'other.spz' }
    )).toBe(false);
    expect(shouldClearUnavailableForcedWebGpuSplatLoading(
      'webgpu',
      unavailableResolution,
      file,
      false,
      { percent: 60, message: 'Preparing splat renderer...', currentFile: 'scene.spz' }
    )).toBe(true);
    expect(shouldClearUnavailableForcedWebGpuSplatLoading(
      'webgpu',
      unavailableResolution,
      file,
      false,
      {
        percent: 60,
        message: 'Preparing splat renderer...',
        currentFile: 'scene.spz',
        splatRenderer: 'spark',
      }
    )).toBe(false);
  });

  it('creates a pointer-transparent canvas layer when visible', () => {
    render(<WebGpuSplatCanvasLayer visible />);

    const canvas = screen.getByTestId('webgpu-splat-canvas');
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas.className).toContain('pointer-events-none');
    expect(canvas.className).toContain('absolute');
  });

  it('does not render a canvas when hidden', () => {
    render(<WebGpuSplatCanvasLayer visible={false} />);

    expect(screen.queryByTestId('webgpu-splat-canvas')).toBeNull();
  });

  it('can mount a hidden canvas for background initialization', () => {
    render(<WebGpuSplatCanvasLayer mounted visible={false} />);

    const canvas = screen.getByTestId('webgpu-splat-canvas');
    expect(canvas.className).toContain('opacity-0');
  });

  it('reports runtime ready only after the app renderer reports its first rendered frame', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      renderer.loadCloud(cloud, cloudOptions);
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });
    const onRuntimeReady = vi.fn();
    const addNotification = vi.fn(() => 'loading-notice');
    const removeNotification = vi.fn();
    const setUrlLoading = vi.fn();
    const setUrlProgress = vi.fn();

    render(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={file}
        addNotification={addNotification}
        removeNotification={removeNotification}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
        onRuntimeReady={onRuntimeReady}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
    expect(addNotification).toHaveBeenCalledWith('info', 'Loading splat: scene.spz', 0);
    expect(setUrlLoading).toHaveBeenCalledWith(true);
    expect(setUrlProgress).toHaveBeenCalledWith({
      percent: 92,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.spz',
      splatRenderer: 'webgpu',
    });
    expect(removeNotification).not.toHaveBeenCalled();
    expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ count: 1 }),
      expect.objectContaining({
        sceneId: expect.stringContaining('scene.spz'),
        labelPrefix: 'webgpu splat scene.spz',
      }),
      expect.objectContaining({
        onFirstFrame: expect.any(Function),
        onError: expect.any(Function),
      })
    );
    expect(onRuntimeReady).not.toHaveBeenCalled();

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.updateMatrixWorld(true);
    syncWebGpuSplatFrameSnapshot(createWebGpuSplatFrameSnapshot({
      camera,
      width: 100,
      height: 50,
      dpr: 2,
    }));

    await waitFor(() => {
      expect(renderer.setFrameSnapshot).toHaveBeenCalledTimes(1);
    });
    expect(onRuntimeReady).not.toHaveBeenCalled();

    onFirstFrame?.();

    await waitFor(() => {
      expect(onRuntimeReady).toHaveBeenCalledTimes(1);
    });
    expect(removeNotification).toHaveBeenCalledWith('loading-notice');
    expect(addNotification).toHaveBeenCalledWith('info', 'Loaded splat: scene.spz', 3000);
    expect(setUrlProgress).toHaveBeenCalledWith({
      percent: 100,
      message: 'Complete',
      currentFile: 'scene.spz',
      splatRenderer: 'webgpu',
    });
    expect(setUrlLoading).toHaveBeenLastCalledWith(false);
    onFirstFrame?.();
    expect(onRuntimeReady).toHaveBeenCalledTimes(1);
    expect(addNotification).toHaveBeenCalledTimes(2);
  });

  it('keeps hidden background warm-up silent when loading progress reporting is disabled', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      renderer.loadCloud(cloud, cloudOptions);
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });
    const onRuntimeReady = vi.fn();
    const addNotification = vi.fn(() => 'loading-notice');
    const removeNotification = vi.fn();
    const setUrlLoading = vi.fn();
    const setUrlProgress = vi.fn();

    render(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={file}
        addNotification={addNotification}
        removeNotification={removeNotification}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
        reportLoadingProgress={false}
        onRuntimeReady={onRuntimeReady}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
    expect(addNotification).not.toHaveBeenCalled();
    expect(removeNotification).not.toHaveBeenCalled();
    expect(setUrlLoading).not.toHaveBeenCalled();
    expect(setUrlProgress).not.toHaveBeenCalled();

    onFirstFrame?.();

    await waitFor(() => {
      expect(onRuntimeReady).toHaveBeenCalledTimes(1);
    });
    expect(addNotification).not.toHaveBeenCalled();
    expect(removeNotification).not.toHaveBeenCalled();
    expect(setUrlLoading).not.toHaveBeenCalled();
    expect(setUrlProgress).not.toHaveBeenCalled();
  });

  it('loads each new WebGPU splat file without resetting metric state', async () => {
    const firstFile = new File(['x'], 'first.spz');
    const secondFile = new File(['x'], 'second.spz');
    const firstRenderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const secondRenderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter)
      .mockImplementationOnce(async () => firstRenderer)
      .mockImplementationOnce(async () => secondRenderer);
    vi.mocked(loadGaussianCloudFromFile)
      .mockResolvedValueOnce({
        file: firstFile,
        format: 'spz',
        byteLength: 1,
        cloud: makeCloud(),
      })
      .mockResolvedValueOnce({
        file: secondFile,
        format: 'spz',
        byteLength: 1,
        cloud: makeCloud(),
      });

    const view = render(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={firstFile}
      />
    );

    await waitFor(() => {
      expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={secondFile}
      />
    );

    await waitFor(() => {
      expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(2);
    });
    expect(firstRenderer.dispose).toHaveBeenCalledTimes(1);
  });

  it('stops reporting loading progress without clearing shared loading state when ownership is revoked', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      renderer.loadCloud(cloud, cloudOptions);
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });
    const addNotification = vi.fn(() => 'loading-notice');
    const removeNotification = vi.fn();
    const getUrlProgress = vi.fn<() => UrlLoadProgress | null>(() => null);
    const setUrlLoading = vi.fn();
    const setUrlProgress = vi.fn();

    const view = render(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={file}
        addNotification={addNotification}
        removeNotification={removeNotification}
        getUrlProgress={getUrlProgress}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
        reportLoadingProgress
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
    expect(addNotification).toHaveBeenCalledWith('info', 'Loading splat: scene.spz', 0);
    expect(setUrlLoading).toHaveBeenCalledWith(true);
    getUrlProgress.mockReturnValue({
      percent: 92,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.spz',
      splatRenderer: 'spark',
    });

    view.rerender(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={file}
        addNotification={addNotification}
        removeNotification={removeNotification}
        getUrlProgress={getUrlProgress}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
        reportLoadingProgress={false}
      />
    );

    await waitFor(() => {
      expect(removeNotification).toHaveBeenCalledWith('loading-notice');
    });
    expect(setUrlLoading).not.toHaveBeenCalledWith(false);

    act(() => {
      onFirstFrame?.();
    });

    await Promise.resolve();
    expect(addNotification).toHaveBeenCalledTimes(1);
    expect(setUrlProgress).not.toHaveBeenCalledWith({
      percent: 100,
      message: 'Complete',
      currentFile: 'scene.spz',
      splatRenderer: 'webgpu',
    });
    expect(setUrlLoading).not.toHaveBeenCalledWith(false);
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it('clears explicit WebGPU loading when a disabled reporting load fails', async () => {
    const file = new File(['x'], 'scene.spz');
    const loadDeferred = createDeferred<LoadedGaussianCloud>();
    vi.mocked(loadGaussianCloudFromFile).mockReturnValue(loadDeferred.promise);
    const addNotification = vi.fn(() => 'loading-notice');
    const removeNotification = vi.fn();
    const getUrlProgress = vi.fn<() => UrlLoadProgress | null>(() => null);
    const setUrlLoading = vi.fn();
    const setUrlProgress = vi.fn();
    const onRuntimeFailed = vi.fn();
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      const view = render(
        <WebGpuSplatCanvasLayer
          mounted
          visible={false}
          splatFile={file}
          addNotification={addNotification}
          removeNotification={removeNotification}
          getUrlProgress={getUrlProgress}
          setUrlLoading={setUrlLoading}
          setUrlProgress={setUrlProgress}
          reportLoadingProgress
          onRuntimeFailed={onRuntimeFailed}
        />
      );

      await waitFor(() => {
        expect(addNotification).toHaveBeenCalledWith('info', 'Loading splat: scene.spz', 0);
      });
      getUrlProgress.mockReturnValue({
        percent: 93,
        message: 'Reading splat file...',
        currentFile: 'scene.spz',
        splatRenderer: 'webgpu',
      });
      view.rerender(
        <WebGpuSplatCanvasLayer
          mounted
          visible={false}
          splatFile={file}
          addNotification={addNotification}
          removeNotification={removeNotification}
          getUrlProgress={getUrlProgress}
          setUrlLoading={setUrlLoading}
          setUrlProgress={setUrlProgress}
          reportLoadingProgress={false}
          onRuntimeFailed={onRuntimeFailed}
        />
      );

      await waitFor(() => {
        expect(removeNotification).toHaveBeenCalledWith('loading-notice');
      });
      setUrlLoading.mockClear();

      await act(async () => {
        loadDeferred.reject(new Error('decode failed'));
      });

      await waitFor(() => {
        expect(onRuntimeFailed).toHaveBeenCalledWith('decode failed');
      });
      expect(setUrlLoading).toHaveBeenCalledWith(false);
      expect(addNotification).not.toHaveBeenCalledWith('warning', 'Failed to load splat: scene.spz');
    } finally {
      warn.mockRestore();
    }
  });

  it('reports app renderer async failures once', async () => {
    const file = new File(['x'], 'scene.ply');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onError: ((reason: string) => void) | undefined;
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      onError = deps?.onError;
      renderer.loadCloud(cloud, cloudOptions);
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeCloud(),
    });
    const onRuntimeFailed = vi.fn();
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(
        <WebGpuSplatCanvasLayer
          mounted
          visible={false}
          splatFile={file}
          onRuntimeFailed={onRuntimeFailed}
        />
      );

      await waitFor(() => {
        expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
      });

      onError?.('validation failed');
      onError?.('validation failed again');

      await waitFor(() => {
        expect(onRuntimeFailed).toHaveBeenCalledWith('validation failed');
      });
      expect(onRuntimeFailed).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('validation failed'));
    } finally {
      warn.mockRestore();
    }
  });

  it('reports adapter-unavailable initialization once without reporting a hard runtime failure', async () => {
    const file = new File(['x'], 'scene.ply');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter)
      .mockRejectedValueOnce(new Error('WebGPU adapter is unavailable'));
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeCloud(),
    });
    const onRuntimeFailed = vi.fn();
    const onAdapterUnavailable = vi.fn();
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    render(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={file}
        onRuntimeFailed={onRuntimeFailed}
        onAdapterUnavailable={onAdapterUnavailable}
      />
    );

    await waitFor(() => {
      expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(1);
    });
    expect(onRuntimeFailed).not.toHaveBeenCalled();
    expect(onAdapterUnavailable).toHaveBeenCalledWith(expect.stringContaining('WebGPU adapter is unavailable'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('adapter is unavailable'));
    expect(loadGaussianCloudFromFile).toHaveBeenCalledTimes(1);
    expect(renderer.loadCloud).not.toHaveBeenCalled();
    expect(onRuntimeFailed).not.toHaveBeenCalled();
  });

  it('retries adapter-unavailable initialization in the background and accepts a later renderer', async () => {
    const file = new File(['x'], 'scene.ply');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter)
      .mockRejectedValueOnce(new Error('WebGPU adapter is unavailable'))
      .mockImplementationOnce(resolveLoadedRenderer(renderer));
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeCloud(),
    });
    const onRuntimeFailed = vi.fn();
    const onAdapterUnavailable = vi.fn();
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(
        <WebGpuSplatCanvasLayer
          mounted
          visible={false}
          splatFile={file}
          onRuntimeFailed={onRuntimeFailed}
          onAdapterUnavailable={onAdapterUnavailable}
        />
      );

      await waitFor(() => {
        expect(onAdapterUnavailable).toHaveBeenCalledTimes(1);
      });
      expect(onRuntimeFailed).not.toHaveBeenCalled();
      expect(renderer.loadCloud).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
      }, { timeout: 5000 });
      expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(2);
      expect(loadGaussianCloudFromFile).toHaveBeenCalledTimes(1);
      expect(onRuntimeFailed).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('retrying in the background'));
    } finally {
      warn.mockRestore();
    }
  });

  it('preflights WebGPU adapter availability before decoding the splat file', async () => {
    const file = new File(['x'], 'scene.ply');
    const requestAdapter = installWebGpuPreflightProvider(vi.fn().mockResolvedValue(null));
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeCloud(),
    });
    const onAdapterUnavailable = vi.fn();
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(
        <WebGpuSplatCanvasLayer
          mounted
          visible={false}
          splatFile={file}
          onAdapterUnavailable={onAdapterUnavailable}
        />
      );

      await waitFor(() => {
        expect(onAdapterUnavailable).toHaveBeenCalledTimes(1);
      });
      expect(requestAdapter).toHaveBeenCalledTimes(3);
      expect(loadGaussianCloudFromFile).not.toHaveBeenCalled();
      expect(createLoadedVisibleWebGpuSplatRendererAdapter).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('decodes the splat file only after WebGPU adapter preflight succeeds', async () => {
    const file = new File(['x'], 'scene.ply');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const preflightAdapter = makePreflightAdapter();
    const requestAdapter = installWebGpuPreflightProvider(vi.fn().mockResolvedValue(preflightAdapter));
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter)
      .mockImplementationOnce(resolveLoadedRenderer(renderer));
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeCloud(),
    });

    render(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={file}
      />
    );

    await waitFor(() => {
      expect(loadGaussianCloudFromFile).toHaveBeenCalledTimes(1);
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
    expect(requestAdapter).toHaveBeenCalledTimes(1);
    expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ count: 1 }),
      expect.objectContaining({
        sceneId: expect.stringContaining('scene.ply'),
      }),
      expect.objectContaining({
        adapter: preflightAdapter,
      })
    );
  });

  it('falls back to an SH0 preview after a large-cloud full-SH adapter-limit failure', async () => {
    const file = new File(['x'], 'bicycle.ply');
    const reason = 'WebGPU splat renderer requires maxStorageBufferBindingSize 900000000 bytes, but this adapter supports 134217728 bytes';
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeLargeShCloud(),
    });
    vi.mocked(createVisibleWebGpuSplatRendererAdapter).mockRejectedValue(new Error(reason));
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      renderer.loadCloud(cloud, cloudOptions);
      deps?.onFirstFrame?.();
      return renderer;
    });
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    const onRuntimeFailed = vi.fn();
    const onMetricRuntimeReady = vi.fn();

    try {
      render(
        <WebGpuSplatCanvasLayer
          mounted
          visible={false}
          splatFile={file}
          onMetricRuntimeReady={onMetricRuntimeReady}
          onRuntimeFailed={onRuntimeFailed}
        />
      );

      await waitFor(() => {
        expect(createVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledWith(
          expect.any(HTMLCanvasElement),
          expect.objectContaining({
            requiredLimits: {
              maxBufferSize: 900_000_000,
              maxStorageBufferBindingSize: 900_000_000,
            },
            onFirstFrame: expect.any(Function),
            onError: expect.any(Function),
          })
        );
      });
      await waitFor(() => {
        expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledWith(
          expect.any(HTMLCanvasElement),
          expect.objectContaining({
            count: 5_000_000,
            shDegree: 0,
          }),
          expect.objectContaining({
            sceneId: expect.stringContaining('bicycle.ply'),
            labelPrefix: 'webgpu splat bicycle.ply',
          }),
          expect.objectContaining({
            onFirstFrame: expect.any(Function),
            onError: expect.any(Function),
          })
        );
      });
      await waitFor(() => {
        expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
      });

      expect(onRuntimeFailed).not.toHaveBeenCalled();
      expect(onMetricRuntimeReady).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('webgpu-splat-canvas')).toBeInTheDocument();
      expect(createVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(1);
      expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(reason));
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps a metric-ready SH0 preview when the adapter cannot fit the higher-order SH binding', async () => {
    const file = new File(['x'], 'splat_30000.ply');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      deps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      renderer.loadCloud.mockImplementation(async () => {
        onFirstFrame?.();
      });
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeLargeShCloud({ shByteLength: 900_000_000 }),
    });
    const onRuntimeReady = vi.fn();
    const onMetricRuntimeReady = vi.fn();
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(
        <WebGpuSplatCanvasLayer
          mounted
          visible={false}
          splatFile={file}
          onRuntimeReady={onRuntimeReady}
          onMetricRuntimeReady={onMetricRuntimeReady}
        />
      );

      await waitFor(() => {
        expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
      });

      expect(createVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        expect.objectContaining({
          requiredLimits: {
            maxBufferSize: 320_000_000,
            maxStorageBufferBindingSize: 320_000_000,
          },
          onFirstFrame: expect.any(Function),
          onError: expect.any(Function),
        })
      );
      expect(renderer.loadCloud).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 5_000_000,
          shDegree: 0,
        }),
        expect.objectContaining({
          sceneId: expect.stringContaining('splat_30000.ply'),
          labelPrefix: 'webgpu splat splat_30000.ply preview',
        })
      );
      expect(createLoadedVisibleWebGpuSplatRendererAdapter).not.toHaveBeenCalled();
      expect(onRuntimeReady).toHaveBeenCalledTimes(1);
      expect(onMetricRuntimeReady).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('higher-order SH'));
    } finally {
      warn.mockRestore();
    }
  });

  it('upgrades to full higher-order SH when the adapter supports the required binding', async () => {
    const file = new File(['x'], 'splat_30000.ply');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    installWebGpuPreflightProvider(
      vi.fn().mockResolvedValue(makePreflightAdapter({
        maxBufferSize: 2_000_000_000,
        maxStorageBufferBindingSize: 2_000_000_000,
      }))
    );
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      deps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      // Resolve the preview first frame so the progressive upgrade proceeds.
      renderer.loadCloud.mockImplementation(async (_cloud, cloudOptions: VisibleWebGpuSplatCloudOptions) => {
        if (renderer.loadCloud.mock.calls.length === 1) {
          onFirstFrame?.();
          return;
        }
        expect(cloudOptions).not.toHaveProperty('onSessionReady');
        setTimeout(() => {
          onFirstFrame?.();
        }, 0);
      });
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeLargeShCloud({ shByteLength: 900_000_000 }),
    });
    const onMetricRuntimeReady = vi.fn();

    render(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={file}
        onMetricRuntimeReady={onMetricRuntimeReady}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(2);
    });

    expect(createVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({
        requiredLimits: {
          maxBufferSize: 900_000_000,
          maxStorageBufferBindingSize: 900_000_000,
        },
      })
    );
    // First a fast SH0 preview, then the full higher-order SH upgrade.
    expect(renderer.loadCloud).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ count: 5_000_000, shDegree: 0 }),
      expect.objectContaining({ labelPrefix: 'webgpu splat splat_30000.ply preview' })
    );
    expect(renderer.loadCloud).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ count: 5_000_000, shDegree: 3 }),
      expect.objectContaining({
        sceneId: expect.stringContaining('splat_30000.ply'),
        labelPrefix: 'webgpu splat splat_30000.ply',
      })
    );
    await waitFor(() => {
      expect(onMetricRuntimeReady).toHaveBeenCalledTimes(1);
    });
    expect(createLoadedVisibleWebGpuSplatRendererAdapter).not.toHaveBeenCalled();
  });

  it('reports metric readiness after the full progressive first frame renders', async () => {
    const file = new File(['x'], 'splat_30000.ply');
    const fullUpload = createDeferred<void>();
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    installWebGpuPreflightProvider(
      vi.fn().mockResolvedValue(makePreflightAdapter({
        maxBufferSize: 2_000_000_000,
        maxStorageBufferBindingSize: 2_000_000_000,
      }))
    );
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      deps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      renderer.loadCloud.mockImplementation((_cloud, cloudOptions: VisibleWebGpuSplatCloudOptions) => {
        if (renderer.loadCloud.mock.calls.length === 1) {
          onFirstFrame?.();
          return Promise.resolve();
        }
        expect(cloudOptions).not.toHaveProperty('onSessionReady');
        return fullUpload.promise;
      });
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeLargeShCloud({ shByteLength: 900_000_000 }),
    });
    const onRuntimeReady = vi.fn();
    const onMetricRuntimeReady = vi.fn();

    render(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={file}
        onRuntimeReady={onRuntimeReady}
        onMetricRuntimeReady={onMetricRuntimeReady}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(2);
    });
    expect(onRuntimeReady).toHaveBeenCalledTimes(1);
    expect(onMetricRuntimeReady).not.toHaveBeenCalled();

    act(() => {
      onFirstFrame?.();
    });
    expect(onRuntimeReady).toHaveBeenCalledTimes(1);
    expect(onMetricRuntimeReady).toHaveBeenCalledTimes(1);

    act(() => {
      onFirstFrame?.();
    });
    expect(onRuntimeReady).toHaveBeenCalledTimes(1);
    expect(onMetricRuntimeReady).toHaveBeenCalledTimes(1);

    await act(async () => {
      fullUpload.resolve();
      await fullUpload.promise;
    });
    expect(onRuntimeReady).toHaveBeenCalledTimes(1);
    expect(onMetricRuntimeReady).toHaveBeenCalledTimes(1);
  });

  it('disposes a progressive renderer when preview upload fails', async () => {
    const file = new File(['x'], 'splat_30000.ply');
    const uploadError = new Error('preview upload failed');
    const renderer = {
      loadCloud: vi.fn(async () => {
        throw uploadError;
      }),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createVisibleWebGpuSplatRendererAdapter).mockResolvedValue(renderer);
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeLargeShCloud({ shByteLength: 900_000_000 }),
    });
    const onRuntimeFailed = vi.fn();
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(
        <WebGpuSplatCanvasLayer
          mounted
          visible={false}
          splatFile={file}
          onRuntimeFailed={onRuntimeFailed}
        />
      );

      await waitFor(() => {
        expect(onRuntimeFailed).toHaveBeenCalledWith('preview upload failed');
      });
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('marks WebGPU failed and unmounts the canvas after visible device loss', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onError: ((reason: string) => void) | undefined;
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      onError = deps?.onError;
      renderer.loadCloud(cloud, cloudOptions);
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    useSplatBackendStore.getState().setRequestedBackend('webgpu');
    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');

    try {
      render(<WebGpuFailureHarness splatFile={file} />);

      await waitFor(() => {
        expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByTestId('webgpu-mounted-state')).toHaveTextContent('true');
      expect(screen.getByTestId('webgpu-splat-canvas')).toBeInTheDocument();

      act(() => {
        onError?.('WebGPU device lost: adapter reset');
      });

      await waitFor(() => {
        expect(useSplatBackendStore.getState().availability).toMatchObject({
          webGpu: 'failed',
          webGpuFailureReason: 'WebGPU device lost: adapter reset',
        });
      });
      await waitFor(() => {
        expect(screen.getByTestId('webgpu-mounted-state')).toHaveTextContent('false');
      });
      expect(screen.queryByTestId('webgpu-splat-canvas')).toBeNull();
      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('WebGPU device lost: adapter reset'));
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps Spark visible until the hidden WebGPU renderer reports its first frame', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      renderer.loadCloud(cloud, cloudOptions);
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });
    useSplatBackendStore.getState().setRequestedBackend('auto');
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');
    const addNotification = vi.fn(() => 'loading-notice');
    const removeNotification = vi.fn();
    const setUrlLoading = vi.fn();
    const setUrlProgress = vi.fn();

    render(
      <WebGpuAutoTransitionHarness
        splatFile={file}
        addNotification={addNotification}
        removeNotification={removeNotification}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
    expect(addNotification).not.toHaveBeenCalled();
    expect(removeNotification).not.toHaveBeenCalled();
    expect(setUrlLoading).not.toHaveBeenCalled();
    expect(setUrlProgress).not.toHaveBeenCalled();
    expect(screen.getByTestId('auto-backend-state')).toHaveTextContent('spark');
    expect(screen.getByTestId('auto-webgpu-mounted-state')).toHaveTextContent('true');
    expect(screen.getByTestId('auto-webgpu-visible-state')).toHaveTextContent('false');
    expect(screen.getByTestId('webgpu-splat-canvas').className).toContain('opacity-0');

    act(() => {
      onFirstFrame?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-backend-state')).toHaveTextContent('webgpu');
    });
    expect(screen.getByTestId('auto-webgpu-mounted-state')).toHaveTextContent('true');
    expect(screen.getByTestId('auto-webgpu-visible-state')).toHaveTextContent('true');
    expect(screen.getByTestId('webgpu-splat-canvas').className).toContain('opacity-100');
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(1);
    expect(addNotification).not.toHaveBeenCalled();
    expect(removeNotification).not.toHaveBeenCalled();
    expect(setUrlLoading).not.toHaveBeenCalled();
    expect(setUrlProgress).not.toHaveBeenCalled();
  });

  it('clears untagged URL handoff progress when hidden auto WebGPU wins first', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      renderer.loadCloud(cloud, cloudOptions);
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });
    useSplatBackendStore.getState().setRequestedBackend('auto');
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');
    const addNotification = vi.fn(() => 'loading-notice');
    const removeNotification = vi.fn();
    const getUrlProgress = vi.fn<() => UrlLoadProgress | null>(() => ({
      percent: 92,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.spz',
    }));
    const setUrlLoading = vi.fn();
    const setUrlProgress = vi.fn();

    render(
      <WebGpuAutoTransitionHarness
        splatFile={file}
        addNotification={addNotification}
        removeNotification={removeNotification}
        getUrlProgress={getUrlProgress}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('auto-backend-state')).toHaveTextContent('spark');
    expect(addNotification).not.toHaveBeenCalled();
    expect(setUrlLoading).not.toHaveBeenCalled();
    expect(setUrlProgress).not.toHaveBeenCalled();

    act(() => {
      onFirstFrame?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-backend-state')).toHaveTextContent('webgpu');
    });
    expect(removeNotification).not.toHaveBeenCalled();
    expect(addNotification).not.toHaveBeenCalled();
    expect(setUrlProgress).toHaveBeenCalledWith({
      percent: 100,
      message: 'Complete',
      currentFile: 'scene.spz',
      splatRenderer: 'webgpu',
    });
    expect(setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it('takes over loading progress when a hidden auto WebGPU warm-up is forced before its first frame', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      renderer.loadCloud(cloud, cloudOptions);
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });
    useSplatBackendStore.getState().setRequestedBackend('auto');
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');
    const addNotification = vi.fn(() => 'loading-notice');
    const removeNotification = vi.fn();
    const setUrlLoading = vi.fn();
    const setUrlProgress = vi.fn();

    render(
      <WebGpuAutoTransitionHarness
        splatFile={file}
        addNotification={addNotification}
        removeNotification={removeNotification}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('auto-backend-state')).toHaveTextContent('spark');
    expect(addNotification).not.toHaveBeenCalled();
    expect(setUrlLoading).not.toHaveBeenCalled();
    expect(setUrlProgress).not.toHaveBeenCalled();

    act(() => {
      useSplatBackendStore.getState().setRequestedBackend('webgpu');
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-backend-state')).toHaveTextContent('unavailable');
    });
    expect(screen.getByTestId('auto-webgpu-mounted-state')).toHaveTextContent('true');
    expect(screen.getByTestId('auto-webgpu-visible-state')).toHaveTextContent('false');
    expect(addNotification).toHaveBeenCalledWith('info', 'Loading splat: scene.spz', 0);
    expect(setUrlLoading).toHaveBeenCalledWith(true);
    expect(setUrlProgress).toHaveBeenCalledWith({
      percent: 92,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.spz',
      splatRenderer: 'webgpu',
    });
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(renderer.loadCloud).toHaveBeenCalledTimes(1);

    act(() => {
      onFirstFrame?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-backend-state')).toHaveTextContent('webgpu');
    });
    expect(removeNotification).toHaveBeenCalledWith('loading-notice');
    expect(addNotification).toHaveBeenCalledWith('info', 'Loaded splat: scene.spz', 3000);
    expect(setUrlProgress).toHaveBeenCalledWith({
      percent: 100,
      message: 'Complete',
      currentFile: 'scene.spz',
      splatRenderer: 'webgpu',
    });
    expect(setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(1);
  });

  it('completes loading when hidden auto WebGPU wins before Spark becomes available', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    let onFirstFrame: (() => void) | undefined;
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (
      _canvas,
      cloud,
      cloudOptions,
      deps?: LoadedVisibleWebGpuSplatRendererAdapterDeps
    ) => {
      onFirstFrame = deps?.onFirstFrame;
      renderer.loadCloud(cloud, cloudOptions);
      return renderer;
    });
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });
    useSplatBackendStore.getState().setRequestedBackend('auto');
    useSplatBackendStore.getState().setSparkBackendAvailable(false);
    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');
    const addNotification = vi.fn(() => 'loading-notice');
    const removeNotification = vi.fn();
    const setUrlLoading = vi.fn();
    const setUrlProgress = vi.fn();

    render(
      <WebGpuAutoTransitionHarness
        splatFile={file}
        addNotification={addNotification}
        removeNotification={removeNotification}
        setUrlLoading={setUrlLoading}
        setUrlProgress={setUrlProgress}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('auto-backend-state')).toHaveTextContent('unavailable');
    expect(addNotification).toHaveBeenCalledWith('info', 'Loading splat: scene.spz', 0);
    expect(setUrlLoading).toHaveBeenCalledWith(true);

    act(() => {
      onFirstFrame?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auto-backend-state')).toHaveTextContent('webgpu');
    });
    expect(removeNotification).toHaveBeenCalledWith('loading-notice');
    expect(setUrlProgress).toHaveBeenCalledWith({
      percent: 100,
      message: 'Complete',
      currentFile: 'scene.spz',
      splatRenderer: 'webgpu',
    });
    expect(setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
  });

  it('disposes the active WebGPU renderer when the splat file changes', async () => {
    const firstFile = new File(['x'], 'first.spz');
    const secondFile = new File(['x'], 'second.spz');
    const firstRenderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const secondRenderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter)
      .mockImplementationOnce(resolveLoadedRenderer(firstRenderer))
      .mockImplementationOnce(resolveLoadedRenderer(secondRenderer));
    vi.mocked(loadGaussianCloudFromFile)
      .mockResolvedValueOnce({
        file: firstFile,
        format: 'spz',
        byteLength: 1,
        cloud: makeCloud(),
      })
      .mockResolvedValueOnce({
        file: secondFile,
        format: 'spz',
        byteLength: 1,
        cloud: makeCloud(),
      });

    const view = render(
      <WebGpuSplatCanvasLayer
        mounted
        visible
        splatFile={firstFile}
      />
    );

    await waitFor(() => {
      expect(firstRenderer.loadCloud).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <WebGpuSplatCanvasLayer
        mounted
        visible
        splatFile={secondFile}
      />
    );

    await waitFor(() => {
      expect(secondRenderer.loadCloud).toHaveBeenCalledTimes(1);
    });
    expect(firstRenderer.dispose).toHaveBeenCalledTimes(1);
    expect(secondRenderer.dispose).not.toHaveBeenCalled();
  });

  it('disposes the active WebGPU renderer when the active splat file is cleared', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(resolveLoadedRenderer(renderer));
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });

    const view = render(
      <WebGpuSplatCanvasLayer
        mounted
        visible
        splatFile={file}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={undefined}
      />
    );

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(1);
  });

  it('disposes the active WebGPU renderer when the canvas layer unmounts', async () => {
    const file = new File(['x'], 'scene.spz');
    const renderer = {
      loadCloud: vi.fn(),
      setFrameSnapshot: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(resolveLoadedRenderer(renderer));
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'spz',
      byteLength: 1,
      cloud: makeCloud(),
    });

    const view = render(
      <WebGpuSplatCanvasLayer
        mounted
        visible
        splatFile={file}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });

    view.unmount();

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('waitForWebGpuSplatViewIdle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('defers until the view pose has been still for the idle window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    let lastChangeMs = performance.now();
    let resolved = false;
    void waitForWebGpuSplatViewIdle(() => lastChangeMs, 500, () => false).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(resolved).toBe(false);

    // A fresh pose change restarts the idle window.
    lastChangeMs = performance.now();
    await vi.advanceTimersByTimeAsync(300);
    expect(resolved).toBe(false);

    // The view stays still for the full window -> resolves.
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(true);
  });

  it('resolves once cancelled even while the view keeps changing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    let cancelled = false;
    let resolved = false;
    // lastChange == now on every poll => never naturally idle.
    void waitForWebGpuSplatViewIdle(() => performance.now(), 500, () => cancelled).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(resolved).toBe(false);

    cancelled = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(true);
  });
});
