import { beforeEach, describe, expect, it } from 'vitest';
import { useSplatBackendStore } from './splatBackendStore';

describe('splat backend store', () => {
  beforeEach(() => {
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useSplatBackendStore.getState().setRequestedBackend('auto');
    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');
    useSplatBackendStore.getState().setSparkBackendAvailable(false);
  });

  it('resolves Spark fallback when auto mode has no ready WebGPU backend', () => {
    useSplatBackendStore.getState().setSparkBackendAvailable(true);

    expect(useSplatBackendStore.getState().resolution).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
    });
  });

  it('switches auto mode to WebGPU when the WebGPU backend becomes ready', () => {
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setWebGpuBackendState('ready');

    expect(useSplatBackendStore.getState().resolution).toMatchObject({
      status: 'resolved',
      backend: 'webgpu',
      gpuPsnr: true,
    });
  });

  it('keeps forced Spark even when WebGPU is ready', () => {
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setWebGpuBackendState('ready');
    useSplatBackendStore.getState().setWebGpuMetricState('ready');
    useSplatBackendStore.getState().setRequestedBackend('spark');

    expect(useSplatBackendStore.getState().resolution).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
    });
    expect(useSplatBackendStore.getState().metricCapability).toMatchObject({
      status: 'available',
      gpuPsnr: true,
    });
  });

  it('surfaces forced WebGPU unavailability instead of using Spark', () => {
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setWebGpuBackendState('unsupported');
    useSplatBackendStore.getState().setRequestedBackend('webgpu');

    expect(useSplatBackendStore.getState().resolution).toMatchObject({
      status: 'unavailable',
      backend: null,
      reason: 'WebGPU is unsupported in this browser',
    });
  });

  it('preserves runtime failure details in backend resolution', () => {
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setRequestedBackend('webgpu');
    useSplatBackendStore.getState().setWebGpuBackendState('failed', 'adapter lost');

    expect(useSplatBackendStore.getState().resolution).toMatchObject({
      status: 'unavailable',
      backend: null,
      reason: 'WebGPU splat renderer failed to initialize: adapter lost',
    });

    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');

    expect(useSplatBackendStore.getState().availability.webGpuFailureReason).toBeNull();
  });

  it('keeps Spark visible in auto mode after a WebGPU runtime failure', () => {
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setWebGpuBackendState('failed', 'adapter lost');

    expect(useSplatBackendStore.getState().resolution).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
      reason: 'Spark fallback selected because WebGPU splat renderer failed to initialize: adapter lost',
    });
  });

  it('tracks metric PSNR capability independently from visible WebGPU readiness', () => {
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setWebGpuBackendState('unsupported');
    useSplatBackendStore.getState().setWebGpuMetricState('ready');

    expect(useSplatBackendStore.getState().resolution).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      gpuPsnr: false,
    });
    expect(useSplatBackendStore.getState().metricCapability).toMatchObject({
      status: 'available',
      gpuPsnr: true,
      reason: 'WebGPU PSNR metric capability is ready',
    });
  });

  it('preserves metric WebGPU failure details separately from visible backend failure', () => {
    useSplatBackendStore.getState().setWebGpuMetricState('failed', 'device lost');

    expect(useSplatBackendStore.getState().metricCapability).toMatchObject({
      status: 'unavailable',
      gpuPsnr: false,
      reason: 'WebGPU PSNR failed to initialize: device lost',
    });

    useSplatBackendStore.getState().setWebGpuMetricState('unavailable');

    expect(useSplatBackendStore.getState().metricAvailability.webGpuFailureReason).toBeNull();
  });
});
