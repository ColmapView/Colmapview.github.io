import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useImageMetricsStore, useReconstructionStore } from '../../store';
import { buildCamera, buildReconstruction } from '../../test/builders';
import {
  useFrustumHoverCardMetricStoreFacade,
  useFrustumHoverCardStoreFacade,
} from './useFrustumHoverCardStoreFacade';

describe('useFrustumHoverCardStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
  });

  it('reports whether frustum hover metadata should include camera ids', () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [
          buildCamera({ cameraId: 1 }),
          buildCamera({ cameraId: 2 }),
        ],
      }),
    });

    const { result } = renderHook(() => useFrustumHoverCardStoreFacade());

    expect(result.current.multiCamera).toBe(true);
  });

  it('keeps single-camera reconstructions compact', () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [buildCamera({ cameraId: 1 })],
      }),
    });

    const { result } = renderHook(() => useFrustumHoverCardStoreFacade());

    expect(result.current.multiCamera).toBe(false);
  });

  it('exposes the splat metric for the hovered image through the metric facade', () => {
    useImageMetricsStore.getState().setSplatPsnrMetric({
      imageId: 8,
      psnr: 31.24,
      ssim: 0.9428,
      mse: 12,
      validPixelCount: 100,
      width: 10,
      height: 10,
      computedAt: 123,
    });

    const { result } = renderHook(() => useFrustumHoverCardMetricStoreFacade(8));

    expect(result.current.splatMetric?.psnr).toBe(31.24);
    expect(result.current.splatMetric?.ssim).toBe(0.9428);
  });
});
