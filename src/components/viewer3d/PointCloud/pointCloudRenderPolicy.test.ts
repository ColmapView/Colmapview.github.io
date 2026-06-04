import { describe, expect, it } from 'vitest';
import { buildFile } from '../../../test/builders';
import {
  getPointGeometryDataColorMode,
  getSplatPointOverlayAnimationMode,
  shouldRenderPointGeometry,
} from './pointCloudRenderPolicy';

describe('shouldRenderPointGeometry', () => {
  it('hides point geometry when points are off', () => {
    expect(shouldRenderPointGeometry({
      showPointCloud: false,
      colorMode: 'rgb',
    })).toBe(false);
  });

  it('renders point geometry for non-splat color modes', () => {
    expect(shouldRenderPointGeometry({
      showPointCloud: true,
      colorMode: 'trackLength',
    })).toBe(true);
  });

  it('keeps point geometry visible in splat mode when the dataset has no splat file', () => {
    expect(shouldRenderPointGeometry({
      showPointCloud: true,
      colorMode: 'splats',
    })).toBe(true);
  });

  it('hides point geometry immediately when splat mode has an active splat file', () => {
    const splatFile = buildFile('scene.ply', 'splat');

    expect(shouldRenderPointGeometry({
      showPointCloud: true,
      colorMode: 'splats',
      splatFile,
    })).toBe(false);
  });

  it('renders point geometry over splats for splat point overlay modes', () => {
    const splatFile = buildFile('scene.ply', 'splat');

    expect(shouldRenderPointGeometry({
      showPointCloud: true,
      colorMode: 'splatPoints',
      splatFile,
    })).toBe(true);
    expect(shouldRenderPointGeometry({
      showPointCloud: true,
      colorMode: 'splatRainbowPoints',
      splatFile,
    })).toBe(true);
  });

  it('uses RGB point data and derives overlay animation modes for splat point overlays', () => {
    expect(getPointGeometryDataColorMode('splats')).toBe('rgb');
    expect(getPointGeometryDataColorMode('splatPoints')).toBe('rgb');
    expect(getPointGeometryDataColorMode('splatRainbowPoints')).toBe('rgb');
    expect(getPointGeometryDataColorMode('error')).toBe('error');

    expect(getSplatPointOverlayAnimationMode('splats')).toBeNull();
    expect(getSplatPointOverlayAnimationMode('splatPoints')).toBe('blink');
    expect(getSplatPointOverlayAnimationMode('splatRainbowPoints')).toBe('rainbow');
  });
});
