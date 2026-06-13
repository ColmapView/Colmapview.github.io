import { describe, expect, it } from 'vitest';
import {
  FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON,
  getBrowserWebGpuCompatibilityBlockReason,
  parseSplatBackendPreference,
  resolveSplatBackend,
  resolveSplatMetricCapability,
  shouldPreloadSparkSplatRuntime,
  shouldExposeSplatMetricVisualizations,
  type SplatBackendAvailability,
  type SplatMetricAvailability,
} from './splatBackendPolicy';

describe('splat backend policy', () => {
  const sparkReady: SplatBackendAvailability = { webGpu: 'unsupported', spark: true };
  const webGpuReady: SplatBackendAvailability = { webGpu: 'ready', spark: true };

  it('parses valid backend preferences and defaults invalid values to auto', () => {
    expect(parseSplatBackendPreference('?splatBackend=webgpu')).toBe('webgpu');
    expect(parseSplatBackendPreference(new URLSearchParams('splatBackend=spark'))).toBe('spark');
    expect(parseSplatBackendPreference('?splatBackend=invalid')).toBe('auto');
    expect(parseSplatBackendPreference('')).toBe('auto');
  });

  it('selects WebGPU in auto mode when the WebGPU backend is ready', () => {
    expect(resolveSplatBackend('auto', webGpuReady)).toMatchObject({
      status: 'resolved',
      backend: 'webgpu',
      gpuPsnr: true,
    });
  });

  it('uses Spark as the auto fallback when WebGPU is unsupported', () => {
    expect(resolveSplatBackend('auto', sparkReady)).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU is unsupported',
    });
  });

  it('routes Firefox on Linux to Spark instead of probing WebGPU first', () => {
    const reason = getBrowserWebGpuCompatibilityBlockReason({
      gpu: {},
      platform: 'Linux x86_64',
      userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
    });

    expect(reason).toBe(FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON);
    expect(resolveSplatBackend('auto', {
      webGpu: 'unsupported',
      webGpuFailureReason: reason,
      spark: true,
    })).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
      reason: `Spark fallback selected because ${FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON}`,
    });
    expect(resolveSplatBackend('webgpu', {
      webGpu: 'unsupported',
      webGpuFailureReason: reason,
      spark: true,
    })).toMatchObject({
      status: 'unavailable',
      backend: null,
      reason: FIREFOX_LINUX_WEBGPU_UNSUPPORTED_REASON,
    });
  });

  it('does not block non-Linux Firefox or non-Firefox Linux browsers by user agent policy', () => {
    expect(getBrowserWebGpuCompatibilityBlockReason({
      gpu: {},
      platform: 'Win32',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    })).toBeNull();

    expect(getBrowserWebGpuCompatibilityBlockReason({
      gpu: {},
      platform: 'Linux x86_64',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    })).toBeNull();
  });

  it('uses Spark while auto WebGPU is still preparing', () => {
    expect(resolveSplatBackend('auto', {
      webGpu: 'unavailable',
      spark: true,
    })).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark compatibility renderer active while WebGPU initializes',
    });
  });

  it('preloads Spark when requested or when auto WebGPU is not ready', () => {
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'unavailable' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'ready' })).toBe(false);
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'unsupported' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'failed' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('spark', { webGpu: 'ready' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('webgpu', { webGpu: 'unsupported' })).toBe(false);
  });

  it('uses Spark for concrete auto WebGPU unavailability when Spark is available', () => {
    expect(resolveSplatBackend('auto', {
      webGpu: 'unavailable',
      webGpuFailureReason: 'WebGPU adapter is unavailable',
      spark: true,
    })).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark compatibility renderer active because WebGPU adapter is unavailable',
    });
  });

  it('does not silently fall back when forced WebGPU is unavailable', () => {
    expect(resolveSplatBackend('webgpu', sparkReady)).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU is unsupported in this browser',
    });
  });

  it('resolves forced WebGPU only when the WebGPU backend is ready', () => {
    expect(resolveSplatBackend('webgpu', webGpuReady)).toMatchObject({
      status: 'resolved',
      requested: 'webgpu',
      backend: 'webgpu',
      gpuPsnr: true,
      reason: 'WebGPU renderer forced by splatBackend=webgpu',
    });

    expect(resolveSplatBackend('webgpu', {
      webGpu: 'unavailable',
      spark: true,
    })).toMatchObject({
      status: 'unavailable',
      requested: 'webgpu',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU splat renderer is not available',
    });
  });

  it('uses Spark in auto mode after a WebGPU initialization failure while preserving the failure reason', () => {
    expect(resolveSplatBackend('auto', {
      webGpu: 'failed',
      webGpuFailureReason: 'adapter lost',
      spark: true,
    })).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU splat renderer failed to initialize: adapter lost',
    });
  });

  it('does not silently fall back after a forced WebGPU initialization failure', () => {
    expect(resolveSplatBackend('webgpu', { webGpu: 'failed', spark: true })).toMatchObject({
      status: 'unavailable',
      backend: null,
      reason: 'WebGPU splat renderer failed to initialize',
    });
  });

  it('honors forced Spark and reports GPU PSNR as unavailable', () => {
    expect(resolveSplatBackend('spark', webGpuReady)).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
    });
  });

  it('preloads Spark for forced Spark or auto fallback paths', () => {
    expect(shouldPreloadSparkSplatRuntime('auto', {
      webGpu: 'unavailable',
      spark: false,
    })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('spark', {
      webGpu: 'ready',
      spark: false,
    })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('auto', {
      webGpu: 'unavailable',
      spark: true,
    })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('spark', {
      webGpu: 'ready',
      spark: true,
    })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('auto', {
      webGpu: 'ready',
      spark: true,
    })).toBe(false);
  });

  it('resolves WebGPU metric PSNR capability when the visible backend is WebGPU or unknown', () => {
    const metricReady: SplatMetricAvailability = { webGpu: 'ready' };

    expect(resolveSplatMetricCapability(metricReady)).toMatchObject({
      status: 'available',
      backend: 'webgpu',
      gpuPsnr: true,
      reason: 'WebGPU PSNR metric capability is ready',
    });
  });

  it('resolves Spark CPU PSNR and SSIM capability when Spark is the visible backend', () => {
    expect(resolveSplatMetricCapability(
      { webGpu: 'unsupported' },
      {
        status: 'resolved',
        requested: 'auto',
        backend: 'spark',
        gpuPsnr: false,
        reason: 'Spark fallback selected because WebGPU is unsupported',
      }
    )).toMatchObject({
      status: 'available',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark PSNR/SSIM metric capability is ready',
    });
  });

  it('reports unsupported and failed metric PSNR capability clearly', () => {
    expect(resolveSplatMetricCapability({ webGpu: 'unsupported' })).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU is unsupported in this browser',
    });

    expect(resolveSplatMetricCapability({
      webGpu: 'failed',
      webGpuFailureReason: 'adapter unavailable',
    })).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU PSNR failed to initialize: adapter unavailable',
    });
  });

  it('exposes PSNR/SSIM visualizations only for WebGPU metric paths', () => {
    const activeSplatFile = { name: 'scene.spz' };
    const sparkResolution = resolveSplatBackend('spark', webGpuReady);
    const webGpuResolution = resolveSplatBackend('webgpu', webGpuReady);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      resolution: sparkResolution,
      metricCapability: resolveSplatMetricCapability({ webGpu: 'ready' }, sparkResolution),
    })).toBe(false);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      resolution: webGpuResolution,
      metricCapability: resolveSplatMetricCapability({ webGpu: 'ready' }, webGpuResolution),
    })).toBe(true);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      resolution: webGpuResolution,
      metricCapability: resolveSplatMetricCapability({ webGpu: 'unavailable' }, webGpuResolution),
    })).toBe(true);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile: null,
      resolution: webGpuResolution,
      metricCapability: resolveSplatMetricCapability({ webGpu: 'ready' }, webGpuResolution),
    })).toBe(false);

    expect(shouldExposeSplatMetricVisualizations({
      activeSplatFile,
      resolution: resolveSplatBackend('auto', sparkReady),
      metricCapability: resolveSplatMetricCapability({ webGpu: 'unsupported' }, resolveSplatBackend('auto', sparkReady)),
    })).toBe(false);
  });
});
