import { describe, expect, it } from 'vitest';
import {
  createWebGpuRequiredLimitsDescriptor,
  getWebGpuSplatBufferRequirementsForCloudShape,
  getWebGpuSplatRendererRequiredLimitsForCount,
  webGpuDeviceMeetsSplatRequiredLimits,
} from './webGpuSplatLimits';

describe('WebGPU splat limit policy', () => {
  it('derives exact buffer and storage-binding requirements for large SH clouds', () => {
    const requirements = getWebGpuSplatBufferRequirementsForCloudShape({
      count: 5_000_000,
      shDegree: 3,
    });

    expect(requirements.gaussianBufferBytes).toBe(320_000_000);
    expect(requirements.shBufferBytes).toBe(900_000_000);
    expect(requirements.rendererSplatDataBytes).toBe(240_000_000);
    expect(requirements.rendererDepthBytes).toBe(20_000_000);
    expect(requirements.rendererIndexBytes).toBe(20_000_000);
    expect(requirements.maxBufferSize).toBe(900_000_000);
    expect(requirements.maxStorageBufferBindingSize).toBe(900_000_000);
  });

  it('keeps empty clouds at the minimum valid storage buffer size', () => {
    expect(getWebGpuSplatBufferRequirementsForCloudShape({
      count: 0,
      shDegree: 0,
    })).toMatchObject({
      gaussianBufferBytes: 16,
      shBufferBytes: 16,
      rendererSplatDataBytes: 16,
      rendererDepthBytes: 16,
      rendererIndexBytes: 16,
      maxBufferSize: 16,
      maxStorageBufferBindingSize: 16,
    });
  });

  it('derives renderer scratch limits independently from immutable cloud buffers', () => {
    expect(getWebGpuSplatRendererRequiredLimitsForCount(5_000_000)).toEqual({
      maxBufferSize: 240_000_000,
      maxStorageBufferBindingSize: 240_000_000,
    });
  });

  it('creates requestDevice descriptors only when the adapter supports the requested limits', () => {
    const adapter = {
      limits: {
        maxBufferSize: 2_147_483_648,
        maxStorageBufferBindingSize: 2_147_483_644,
      } as GPUSupportedLimits,
    };

    expect(createWebGpuRequiredLimitsDescriptor(adapter, {
      maxBufferSize: 900_000_000,
      maxStorageBufferBindingSize: 900_000_000,
    })).toEqual({
      requiredLimits: {
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      },
    });

    expect(() => createWebGpuRequiredLimitsDescriptor(adapter, {
      maxBufferSize: 2_200_000_000,
    })).toThrow(
      'WebGPU splat renderer requires maxBufferSize 2200000000 bytes, but this adapter supports 2147483648 bytes'
    );
  });

  it('omits requestDevice requiredLimits when the cloud fits portable WebGPU defaults', () => {
    const adapter = {
      limits: {
        maxBufferSize: 268_435_456,
        maxStorageBufferBindingSize: 134_217_728,
      } as GPUSupportedLimits,
    };

    expect(createWebGpuRequiredLimitsDescriptor(adapter, {
      maxBufferSize: 64,
      maxStorageBufferBindingSize: 64,
    })).toBeUndefined();
  });

  it('treats cached devices as satisfying portable WebGPU limits without elevated limit checks', () => {
    expect(webGpuDeviceMeetsSplatRequiredLimits({} as GPUDevice, {
      maxBufferSize: 64,
      maxStorageBufferBindingSize: 64,
    })).toBe(true);
  });

  it('checks whether a cached device can satisfy a later large-cloud request', () => {
    const lowLimitDevice = {
      limits: {
        maxBufferSize: 268_435_456,
        maxStorageBufferBindingSize: 134_217_728,
      } as GPUSupportedLimits,
    };
    const highLimitDevice = {
      limits: {
        maxBufferSize: 2_147_483_648,
        maxStorageBufferBindingSize: 2_147_483_644,
      } as GPUSupportedLimits,
    };
    const requiredLimits = {
      maxBufferSize: 900_000_000,
      maxStorageBufferBindingSize: 900_000_000,
    };

    expect(webGpuDeviceMeetsSplatRequiredLimits(lowLimitDevice as GPUDevice, requiredLimits))
      .toBe(false);
    expect(webGpuDeviceMeetsSplatRequiredLimits(highLimitDevice as GPUDevice, requiredLimits))
      .toBe(true);
  });
});
