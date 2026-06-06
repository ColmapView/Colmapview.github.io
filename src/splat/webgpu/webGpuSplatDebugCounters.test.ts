import { beforeEach, describe, expect, it } from 'vitest';
import {
  getWebGpuSplatDebugCounters,
  releaseWebGpuSplatDebugCounters,
  resetWebGpuSplatDebugCountersForTests,
  trackWebGpuSplatDebugCounter,
} from './webGpuSplatDebugCounters';

describe('WebGPU splat debug counters', () => {
  beforeEach(() => {
    resetWebGpuSplatDebugCountersForTests();
  });

  it('tracks active resource counts and releases idempotently', () => {
    const releaseBuffers = trackWebGpuSplatDebugCounter('buffers', 2);
    const releaseTexture = trackWebGpuSplatDebugCounter('textures');

    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      buffers: 2,
      textures: 1,
    });

    releaseBuffers();
    releaseBuffers();
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      buffers: 0,
      textures: 1,
    });

    releaseWebGpuSplatDebugCounters([releaseTexture]);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      buffers: 0,
      textures: 0,
    });
  });

  it('rejects invalid counter increments', () => {
    expect(() => trackWebGpuSplatDebugCounter('buffers', -1))
      .toThrow('Invalid WebGPU splat debug counter buffers count');
  });
});
