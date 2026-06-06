import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createLoadedVisibleWebGpuSplatRendererAdapter } from '../../splat/webgpu/visibleSplatRendererAdapter';
import { loadGaussianCloudFromFile } from '../../splat/gaussianCloudLoader';
import {
  shouldMountWebGpuSplatCanvas,
  shouldRenderWebGpuSplatCanvas,
} from './WebGpuSplatCanvasLayerPolicy';
import {
  WebGpuSplatCanvasLayer,
} from './WebGpuSplatCanvasLayer';
import {
  createWebGpuSplatFrameSnapshot,
  syncWebGpuSplatFrameSnapshot,
} from './WebGpuSplatCanvasRuntime';
import type {
  SplatBackendAvailability,
  SplatBackendResolution,
} from '../../utils/splatBackendPolicy';
import type { GaussianCloud } from '../../splat';
import type {
  LoadedVisibleWebGpuSplatRendererAdapterDeps,
  VisibleWebGpuSplatCloudOptions,
  VisibleWebGpuSplatRendererAdapter,
} from '../../splat/webgpu/visibleSplatRendererAdapter';
import { appLogger } from '../../utils/logger';
import { useSplatBackendStore } from '../../store';

vi.mock('../../splat/webgpu/visibleSplatRendererAdapter', () => ({
  createLoadedVisibleWebGpuSplatRendererAdapter: vi.fn(),
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

function makeLargeShCloud(): GaussianCloud {
  return {
    ...makeCloud(),
    count: 5_000_000,
    shDegree: 3,
  };
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

function WebGpuAutoTransitionHarness({ splatFile }: { splatFile: File }) {
  const requestedBackend = useSplatBackendStore((s) => s.requestedBackend);
  const availability = useSplatBackendStore((s) => s.availability);
  const resolution = useSplatBackendStore((s) => s.resolution);
  const setWebGpuBackendState = useSplatBackendStore((s) => s.setWebGpuBackendState);
  const mounted = shouldMountWebGpuSplatCanvas(requestedBackend, availability, splatFile);
  const visible = shouldRenderWebGpuSplatCanvas(resolution, splatFile);

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
        onRuntimeReady={() => setWebGpuBackendState('ready')}
        onRuntimeFailed={(reason) => setWebGpuBackendState('failed', reason)}
      />
    </>
  );
}

describe('WebGpuSplatCanvasLayer', () => {
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
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
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

    render(
      <WebGpuSplatCanvasLayer
        mounted
        visible={false}
        splatFile={file}
        onRuntimeReady={onRuntimeReady}
      />
    );

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
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
    onFirstFrame?.();
    expect(onRuntimeReady).toHaveBeenCalledTimes(1);
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

  it('marks WebGPU failed and unmounts the canvas after a large-cloud adapter-limit failure', async () => {
    const file = new File(['x'], 'bicycle.ply');
    const reason = 'WebGPU splat renderer requires maxStorageBufferBindingSize 900000000 bytes, but this adapter supports 134217728 bytes';
    vi.mocked(loadGaussianCloudFromFile).mockResolvedValue({
      file,
      format: 'ply',
      byteLength: 1,
      cloud: makeLargeShCloud(),
    });
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockRejectedValue(new Error(reason));
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    useSplatBackendStore.getState().setRequestedBackend('webgpu');
    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');

    try {
      render(<WebGpuFailureHarness splatFile={file} />);

      await waitFor(() => {
        expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledWith(
          expect.any(HTMLCanvasElement),
          expect.objectContaining({
            count: 5_000_000,
            shDegree: 3,
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
        expect(useSplatBackendStore.getState().availability).toMatchObject({
          webGpu: 'failed',
          webGpuFailureReason: reason,
        });
      });
      await waitFor(() => {
        expect(screen.getByTestId('webgpu-mounted-state')).toHaveTextContent('false');
      });

      expect(screen.queryByTestId('webgpu-splat-canvas')).toBeNull();
      expect(createLoadedVisibleWebGpuSplatRendererAdapter).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(reason));
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

  it('keeps auto mode on Spark until the hidden WebGPU renderer reports its first frame', async () => {
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

    render(<WebGpuAutoTransitionHarness splatFile={file} />);

    await waitFor(() => {
      expect(renderer.loadCloud).toHaveBeenCalledTimes(1);
    });
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
