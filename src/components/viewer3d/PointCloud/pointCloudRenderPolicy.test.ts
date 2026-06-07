import { describe, expect, it } from 'vitest';
import { buildFile } from '../../../test/builders';
import {
  getPointGeometryLayerProps,
  getPointGeometryDataColorMode,
  getSplatPointOverlayAnimationMode,
  POINT_GEOMETRY_RENDER_ORDER,
  shouldComputePointCloudData,
  shouldRenderPointGeometry,
  SPARK_SPLAT_RENDER_ORDER,
  SPLAT_POINT_OVERLAY_RENDER_ORDER,
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

  it('keeps points, splats, and splat point overlays in a stable layer order', () => {
    expect(POINT_GEOMETRY_RENDER_ORDER).toBeLessThan(SPARK_SPLAT_RENDER_ORDER);
    expect(SPARK_SPLAT_RENDER_ORDER).toBeLessThan(SPLAT_POINT_OVERLAY_RENDER_ORDER);

    expect(getPointGeometryLayerProps('rgb')).toEqual({
      renderOrder: POINT_GEOMETRY_RENDER_ORDER,
      vertexColors: true,
      depthTest: true,
      depthWrite: true,
    });
    expect(getPointGeometryLayerProps('splats')).toEqual({
      renderOrder: POINT_GEOMETRY_RENDER_ORDER,
      vertexColors: true,
      depthTest: true,
      depthWrite: true,
    });
    expect(getPointGeometryLayerProps('splatPoints')).toEqual({
      renderOrder: SPLAT_POINT_OVERLAY_RENDER_ORDER,
      vertexColors: false,
      depthTest: false,
      depthWrite: false,
    });
    expect(getPointGeometryLayerProps('splatRainbowPoints')).toEqual({
      renderOrder: SPLAT_POINT_OVERLAY_RENDER_ORDER,
      vertexColors: false,
      depthTest: false,
      depthWrite: false,
    });
  });

  it('skips point cloud data when neither geometry nor a selected overlay can render', () => {
    expect(shouldComputePointCloudData({
      showPointGeometry: false,
      showSelectionHighlight: false,
      selectedImageId: null,
    })).toBe(false);
    expect(shouldComputePointCloudData({
      showPointGeometry: false,
      showSelectionHighlight: true,
      selectedImageId: null,
    })).toBe(false);
  });

  it('computes point cloud data for visible geometry or selected overlays', () => {
    expect(shouldComputePointCloudData({
      showPointGeometry: true,
      showSelectionHighlight: false,
      selectedImageId: null,
    })).toBe(true);
    expect(shouldComputePointCloudData({
      showPointGeometry: false,
      showSelectionHighlight: true,
      selectedImageId: 7,
    })).toBe(true);
  });
});
