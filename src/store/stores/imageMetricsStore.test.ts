import { beforeEach, describe, expect, it } from 'vitest';
import { useImageMetricsStore } from './imageMetricsStore';

describe('image metrics store', () => {
  beforeEach(() => {
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
  });

  function storeMetric(imageId: number, psnr = 25) {
    useImageMetricsStore.getState().setSplatPsnrMetric({
      imageId,
      psnr,
      mse: 100,
      validPixelCount: 1500,
      width: 4000,
      height: 3000,
      computedAt: 123,
    });
  }

  it('stores the selected image snapshot on selected PSNR requests', () => {
    useImageMetricsStore.getState().requestSplatPsnrCompute('selected', 42);

    expect(useImageMetricsStore.getState().splatPsnrComputeRequest).toEqual({
      id: 1,
      scope: 'selected',
      selectedImageId: 42,
    });
  });

  it('does not bind all-image PSNR requests to the current selection', () => {
    useImageMetricsStore.getState().requestSplatPsnrCompute('all', 42);

    expect(useImageMetricsStore.getState().splatPsnrComputeRequest).toEqual({
      id: 1,
      scope: 'all',
      selectedImageId: null,
    });
  });

  it('stores PSNR metrics with render background and clears stale errors', () => {
    useImageMetricsStore.getState().setSplatPsnrImageError(7, 'old error');

    useImageMetricsStore.getState().setSplatPsnrMetric({
      imageId: 7,
      psnr: 15,
      mse: 100,
      validPixelCount: 1500,
      width: 4000,
      height: 3000,
      computedAt: 123,
      renderBackground: {
        label: 'opaque-black',
        rgba: [0, 0, 0, 1],
      },
    });

    const state = useImageMetricsStore.getState();
    expect(state.splatPsnrStatus.get(7)).toBe('ready');
    expect(state.splatPsnrError.has(7)).toBe(false);
    expect(state.splatPsnrMetrics.get(7)).toEqual(expect.objectContaining({
      imageId: 7,
      psnr: 15,
      mse: 100,
      validPixelCount: 1500,
      width: 4000,
      height: 3000,
      computedAt: 123,
    }));
    expect(state.splatPsnrMetrics.get(7)?.renderBackground).toEqual({
      label: 'opaque-black',
      rgba: [0, 0, 0, 1],
    });
  });

  it('clears stale metric values when images are queued for recompute', () => {
    storeMetric(7, 15);
    storeMetric(8, 30);
    useImageMetricsStore.getState().setSplatPsnrImageError(7, 'old error');
    storeMetric(7, 15);

    useImageMetricsStore.getState().setSplatPsnrPending([7]);

    const state = useImageMetricsStore.getState();
    expect(state.splatPsnrStatus.get(7)).toBe('pending');
    expect(state.splatPsnrMetrics.has(7)).toBe(false);
    expect(state.splatPsnrError.has(7)).toBe(false);
    expect(state.splatPsnrMetrics.get(8)?.psnr).toBe(30);
  });

  it('clears stale metric values when an image starts computing or errors', () => {
    storeMetric(7, 15);
    useImageMetricsStore.getState().setSplatPsnrComputingImage(7);

    expect(useImageMetricsStore.getState().splatPsnrStatus.get(7)).toBe('computing');
    expect(useImageMetricsStore.getState().splatPsnrMetrics.has(7)).toBe(false);

    storeMetric(7, 15);
    useImageMetricsStore.getState().setSplatPsnrImageError(7, 'failed');

    const state = useImageMetricsStore.getState();
    expect(state.splatPsnrStatus.get(7)).toBe('error');
    expect(state.splatPsnrMetrics.has(7)).toBe(false);
    expect(state.splatPsnrError.get(7)).toBe('failed');
  });
});
