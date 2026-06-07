import { describe, expect, it } from 'vitest';
import {
  WEBGPU_SPLAT_OPAQUE_BLACK_BACKGROUND,
  getWebGpuSplatDefaultBackgroundColor,
} from './splatRenderBackground';

describe('WebGPU splat render background policy', () => {
  it('uses opaque black as the shared visible and metric render default', () => {
    expect(WEBGPU_SPLAT_OPAQUE_BLACK_BACKGROUND).toEqual([0, 0, 0, 1]);
    expect(getWebGpuSplatDefaultBackgroundColor()).toEqual([0, 0, 0, 1]);
  });

  it('returns a fresh mutable tuple so callers cannot mutate the shared default', () => {
    const first = getWebGpuSplatDefaultBackgroundColor();
    const second = getWebGpuSplatDefaultBackgroundColor();

    first[0] = 1;

    expect(first).toEqual([1, 0, 0, 1]);
    expect(second).toEqual([0, 0, 0, 1]);
    expect(getWebGpuSplatDefaultBackgroundColor()).toEqual([0, 0, 0, 1]);
  });
});
