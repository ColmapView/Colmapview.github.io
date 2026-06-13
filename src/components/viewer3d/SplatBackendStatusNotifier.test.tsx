import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SplatBackendStatusNotifier } from './SplatBackendStatusNotifier';
import type { SplatBackendResolution } from '../../utils/splatBackendPolicy';

function makeUnavailable(reason: string): SplatBackendResolution {
  return {
    status: 'unavailable',
    requested: 'webgpu',
    backend: null,
    gpuPsnr: false,
    reason,
  };
}

describe('SplatBackendStatusNotifier', () => {
  it('adds one warning for each forced-WebGPU failure key', () => {
    const addNotification = vi.fn(() => 'notification-1');
    const file = new File(['x'], 'scene.spz');
    const firstResolution = makeUnavailable('WebGPU is unsupported in this browser');
    const { rerender } = render(
      <SplatBackendStatusNotifier
        addNotification={addNotification}
        requestedBackend="webgpu"
        splatBackendResolution={firstResolution}
        splatFile={file}
        webGpuSplatCanvasMounted={false}
      />
    );

    expect(addNotification).toHaveBeenCalledTimes(1);
    expect(addNotification).toHaveBeenLastCalledWith(
      'warning',
      'WebGPU splat renderer unavailable: WebGPU is unsupported in this browser. Enable WebGPU in your browser, or use a WebGPU-capable browser, for full features.'
    );

    rerender(
      <SplatBackendStatusNotifier
        addNotification={addNotification}
        requestedBackend="webgpu"
        splatBackendResolution={firstResolution}
        splatFile={file}
        webGpuSplatCanvasMounted={false}
      />
    );
    expect(addNotification).toHaveBeenCalledTimes(1);

    rerender(
      <SplatBackendStatusNotifier
        addNotification={addNotification}
        requestedBackend="webgpu"
        splatBackendResolution={makeUnavailable('WebGPU splat renderer failed to initialize: adapter lost')}
        splatFile={file}
        webGpuSplatCanvasMounted={false}
      />
    );
    expect(addNotification).toHaveBeenCalledTimes(2);
  });

  it('suppresses warnings while a forced WebGPU canvas attempt is mounted', () => {
    const addNotification = vi.fn(() => 'notification-1');

    render(
      <SplatBackendStatusNotifier
        addNotification={addNotification}
        requestedBackend="webgpu"
        splatBackendResolution={makeUnavailable('WebGPU splat renderer is not available')}
        splatFile={new File(['x'], 'scene.spz')}
        webGpuSplatCanvasMounted
      />
    );

    expect(addNotification).not.toHaveBeenCalled();
  });

  it('adds a warning when auto mode keeps Spark after WebGPU initialization fails', () => {
    const addNotification = vi.fn(() => 'notification-1');
    const fallbackResolution: SplatBackendResolution = {
      status: 'resolved',
      requested: 'auto',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU splat renderer failed to initialize: adapter lost',
    };

    render(
      <SplatBackendStatusNotifier
        addNotification={addNotification}
        requestedBackend="auto"
        splatBackendResolution={fallbackResolution}
        splatFile={new File(['x'], 'scene.spz')}
        webGpuSplatCanvasMounted={false}
      />
    );

    expect(addNotification).toHaveBeenCalledWith(
      'warning',
      'Using Spark fallback: WebGPU splat renderer failed to initialize: adapter lost'
    );
  });

  it('adds a full-features warning when auto mode uses Spark because WebGPU is unsupported', () => {
    const addNotification = vi.fn(() => 'notification-1');
    const fallbackResolution: SplatBackendResolution = {
      status: 'resolved',
      requested: 'auto',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU is unsupported',
    };

    render(
      <SplatBackendStatusNotifier
        addNotification={addNotification}
        requestedBackend="auto"
        splatBackendResolution={fallbackResolution}
        splatFile={new File(['x'], 'scene.spz')}
        webGpuSplatCanvasMounted={false}
      />
    );

    expect(addNotification).toHaveBeenCalledWith(
      'warning',
      'Using Spark fallback: WebGPU is unsupported. Enable WebGPU in your browser, or use a WebGPU-capable browser, for full features.'
    );
  });
});
