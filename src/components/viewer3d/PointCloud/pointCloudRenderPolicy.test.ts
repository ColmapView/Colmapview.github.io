import { describe, expect, it } from 'vitest';
import { buildFile } from '../../../test/builders';
import { shouldRenderPointGeometry } from './pointCloudRenderPolicy';

describe('shouldRenderPointGeometry', () => {
  it('hides point geometry when points are off', () => {
    expect(shouldRenderPointGeometry({
      showPointCloud: false,
      colorMode: 'rgb',
      readySplatFile: null,
    })).toBe(false);
  });

  it('renders point geometry for non-splat color modes', () => {
    expect(shouldRenderPointGeometry({
      showPointCloud: true,
      colorMode: 'trackLength',
      readySplatFile: null,
    })).toBe(true);
  });

  it('keeps point geometry visible while the selected splat file is still warming', () => {
    const splatFile = buildFile('scene.ply', 'splat');

    expect(shouldRenderPointGeometry({
      showPointCloud: true,
      colorMode: 'splats',
      splatFile,
      readySplatFile: null,
    })).toBe(true);
  });

  it('hides point geometry after the active splat file is ready', () => {
    const splatFile = buildFile('scene.ply', 'splat');

    expect(shouldRenderPointGeometry({
      showPointCloud: true,
      colorMode: 'splats',
      splatFile,
      readySplatFile: splatFile,
    })).toBe(false);
  });
});
