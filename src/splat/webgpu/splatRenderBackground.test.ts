import { describe, expect, it } from 'vitest';
import {
  WEBGPU_SPLAT_OPAQUE_BLACK_BACKGROUND,
  WEBGPU_SPLAT_OPAQUE_WHITE_BACKGROUND,
  getWebGpuSplatDefaultBackgroundColor,
  getWebGpuSplatOpaqueWhiteBackgroundColor,
} from './splatRenderBackground';

describe('WebGPU splat render background policy', () => {
  it('uses opaque black as the shared visible and metric render default', () => {
    expect(WEBGPU_SPLAT_OPAQUE_BLACK_BACKGROUND).toEqual([0, 0, 0, 1]);
    expect(getWebGpuSplatDefaultBackgroundColor()).toEqual([0, 0, 0, 1]);
  });

  it('defines opaque white as the alternate PSNR background diagnostic', () => {
    expect(WEBGPU_SPLAT_OPAQUE_WHITE_BACKGROUND).toEqual([1, 1, 1, 1]);
    expect(getWebGpuSplatOpaqueWhiteBackgroundColor()).toEqual([1, 1, 1, 1]);
  });

  it('returns a fresh mutable tuple so callers cannot mutate the shared default', () => {
    const first = getWebGpuSplatDefaultBackgroundColor();
    const second = getWebGpuSplatDefaultBackgroundColor();
    const white = getWebGpuSplatOpaqueWhiteBackgroundColor();

    first[0] = 1;
    white[0] = 0.5;

    expect(first).toEqual([1, 0, 0, 1]);
    expect(second).toEqual([0, 0, 0, 1]);
    expect(getWebGpuSplatDefaultBackgroundColor()).toEqual([0, 0, 0, 1]);
    expect(getWebGpuSplatOpaqueWhiteBackgroundColor()).toEqual([1, 1, 1, 1]);
  });
});
