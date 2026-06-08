import { describe, expect, it } from 'vitest';
import {
  parseSplatBackendPreference,
  resolveSplatBackend,
  resolveSplatMetricCapability,
  shouldPreloadSparkSplatRuntime,
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

  it('does not use Spark while auto WebGPU is still preparing', () => {
    expect(resolveSplatBackend('auto', {
      webGpu: 'unavailable',
      spark: true,
    })).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'Preparing WebGPU splat renderer',
    });
  });

  it('preloads Spark only when it is requested or WebGPU can no longer be used in auto mode', () => {
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'unavailable' })).toBe(false);
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'ready' })).toBe(false);
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'unsupported' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'failed' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('spark', { webGpu: 'ready' })).toBe(true);
    expect(shouldPreloadSparkSplatRuntime('webgpu', { webGpu: 'unsupported' })).toBe(false);
  });

  it('reports concrete auto WebGPU unavailability without selecting Spark', () => {
    expect(resolveSplatBackend('auto', {
      webGpu: 'unavailable',
      webGpuFailureReason: 'WebGPU adapter is unavailable',
      spark: true,
    })).toMatchObject({
      status: 'unavailable',
      backend: null,
      gpuPsnr: false,
      reason: 'WebGPU adapter is unavailable',
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

  it('resolves metric PSNR capability independently from the visible backend', () => {
    const metricReady: SplatMetricAvailability = { webGpu: 'ready' };

    expect(resolveSplatMetricCapability(metricReady)).toMatchObject({
      status: 'available',
      gpuPsnr: true,
      reason: 'WebGPU PSNR metric capability is ready',
    });
  });

  it('reports unsupported and failed metric PSNR capability clearly', () => {
    expect(resolveSplatMetricCapability({ webGpu: 'unsupported' })).toMatchObject({
      status: 'unavailable',
      gpuPsnr: false,
      reason: 'WebGPU is unsupported in this browser',
    });

    expect(resolveSplatMetricCapability({
      webGpu: 'failed',
      webGpuFailureReason: 'adapter unavailable',
    })).toMatchObject({
      status: 'unavailable',
      gpuPsnr: false,
      reason: 'WebGPU PSNR failed to initialize: adapter unavailable',
    });
  });
});
