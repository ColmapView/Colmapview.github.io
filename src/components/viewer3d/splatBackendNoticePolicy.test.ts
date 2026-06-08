import { describe, expect, it } from 'vitest';
import {
  getForcedWebGpuSplatFailureNotice,
  getWebGpuSplatBackendNotice,
} from './splatBackendNoticePolicy';
import type { SplatBackendResolution } from '../../utils/splatBackendPolicy';

const unavailableResolution: SplatBackendResolution = {
  status: 'unavailable',
  requested: 'webgpu',
  backend: null,
  gpuPsnr: false,
  reason: 'WebGPU is unsupported in this browser',
};

describe('splat backend notice policy', () => {
  it('creates a forced-WebGPU warning when no WebGPU canvas attempt is active', () => {
    const options = {
      requestedBackend: 'webgpu',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: false,
    } as const;

    expect(getForcedWebGpuSplatFailureNotice(options)).toEqual({
      key: 'scene.spz:WebGPU is unsupported in this browser',
      message: 'WebGPU splat renderer unavailable: WebGPU is unsupported in this browser',
    });
    expect(getWebGpuSplatBackendNotice(options)).toEqual({
      key: 'scene.spz:WebGPU is unsupported in this browser',
      message: 'WebGPU splat renderer unavailable: WebGPU is unsupported in this browser',
    });
  });

  it('does not warn while forced WebGPU is still warming up on a mounted canvas', () => {
    expect(getForcedWebGpuSplatFailureNotice({
      requestedBackend: 'webgpu',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: true,
    })).toBeNull();
  });

  it('does not warn without a forced unavailable WebGPU splat request', () => {
    expect(getForcedWebGpuSplatFailureNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: false,
    })).toBeNull();

    expect(getForcedWebGpuSplatFailureNotice({
      requestedBackend: 'webgpu',
      splatBackendResolution: unavailableResolution,
      webGpuSplatCanvasMounted: false,
    })).toBeNull();

    expect(getForcedWebGpuSplatFailureNotice({
      requestedBackend: 'webgpu',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: {
        status: 'resolved',
        requested: 'webgpu',
        backend: 'webgpu',
        gpuPsnr: true,
        reason: 'WebGPU renderer forced by splatBackend=webgpu',
      },
      webGpuSplatCanvasMounted: false,
    })).toBeNull();
  });

  it('creates an auto-mode Spark fallback warning after WebGPU initialization fails', () => {
    const fallbackResolution: SplatBackendResolution = {
      status: 'resolved',
      requested: 'auto',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU splat renderer failed to initialize: adapter lost',
    };

    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: fallbackResolution,
      webGpuSplatCanvasMounted: false,
    })).toEqual({
      key: 'scene.spz:Spark fallback selected because WebGPU splat renderer failed to initialize: adapter lost',
      message: 'Using Spark fallback: WebGPU splat renderer failed to initialize: adapter lost',
    });
  });

  it('does not warn while auto WebGPU is still warming up', () => {
    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'auto',
        backend: null,
        gpuPsnr: false,
        reason: 'Preparing WebGPU splat renderer',
      },
      webGpuSplatCanvasMounted: true,
    })).toBeNull();
  });

  it('creates an auto-mode warning when WebGPU has a concrete unavailable reason', () => {
    expect(getWebGpuSplatBackendNotice({
      requestedBackend: 'auto',
      splatFile: new File(['x'], 'scene.spz'),
      splatBackendResolution: {
        status: 'unavailable',
        requested: 'auto',
        backend: null,
        gpuPsnr: false,
        reason: 'WebGPU adapter is unavailable',
      },
      webGpuSplatCanvasMounted: true,
    })).toEqual({
      key: 'scene.spz:WebGPU adapter is unavailable',
      message: 'WebGPU splat renderer unavailable: WebGPU adapter is unavailable',
    });
  });
});
