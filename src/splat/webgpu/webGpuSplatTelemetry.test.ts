import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWebGpuSplatTelemetryEvents,
  recordWebGpuSplatTelemetryEvent,
  resetWebGpuSplatTelemetryEventsForTests,
  subscribeWebGpuSplatTelemetry,
} from './webGpuSplatTelemetry';

describe('WebGPU splat telemetry', () => {
  beforeEach(() => {
    resetWebGpuSplatTelemetryEventsForTests();
  });

  it('records immutable event snapshots and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWebGpuSplatTelemetry(listener);

    recordWebGpuSplatTelemetryEvent({
      name: 'render',
      durationMs: 12,
      details: {
        target: 'texture',
        width: 640,
      },
    });
    unsubscribe();
    recordWebGpuSplatTelemetryEvent({
      name: 'psnr-reduction',
      durationMs: 5,
      readbackBytes: 16,
      readbackDurationMs: 1,
    });

    const events = getWebGpuSplatTelemetryEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      name: 'render',
      durationMs: 12,
      details: {
        target: 'texture',
        width: 640,
      },
    });
    expect(events[1]).toMatchObject({
      name: 'psnr-reduction',
      readbackBytes: 16,
      readbackDurationMs: 1,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    events[0].details!.target = 'mutated';
    expect(getWebGpuSplatTelemetryEvents()[0].details!.target).toBe('texture');
  });

  it('rejects invalid byte counters', () => {
    expect(() => recordWebGpuSplatTelemetryEvent({
      name: 'scene-upload',
      bytes: -1,
    })).toThrow('Invalid WebGPU splat telemetry bytes');
  });
});
