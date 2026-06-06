import { beforeEach, describe, expect, it } from 'vitest';
import { useImageMetricsStore } from './imageMetricsStore';

describe('image metrics store', () => {
  beforeEach(() => {
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
  });

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

  it('stores optional PSNR diagnostics with the metric and clears stale errors', () => {
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
      diagnostics: {
        lowPsnrThresholdDb: 20,
        validPixelRatio: 0.5,
        renderedMeanRgb: [10, 20, 30],
        groundTruthMeanRgb: [50, 60, 70],
        meanRgbDelta: [-40, -40, -40],
        bestOffset: {
          maxOffsetPixels: 2,
          evaluatedOffsetCount: 25,
          dx: -1,
          dy: 0,
          psnr: 24,
          mse: 24,
          validPixelCount: 1500,
          improvementDb: 9,
        },
        backgroundDiagnostics: {
          baseline: {
            label: 'opaque-black',
            rgba: [0, 0, 0, 1],
            psnr: 15,
            mse: 100,
            validPixelCount: 1500,
            sumSquaredError: 450000,
            improvementDb: 0,
          },
          alternatives: [{
            label: 'opaque-white',
            rgba: [1, 1, 1, 1],
            psnr: 18,
            mse: 50,
            validPixelCount: 1500,
            sumSquaredError: 225000,
            improvementDb: 3,
          }],
          best: {
            label: 'opaque-white',
            rgba: [1, 1, 1, 1],
            psnr: 18,
            mse: 50,
            validPixelCount: 1500,
            sumSquaredError: 225000,
            improvementDb: 3,
          },
        },
        backgroundMismatch: {
          classification: 'possible',
          reason: 'Mean RGB shifts in the same direction across channels.',
        },
        renderSize: { width: 4000, height: 3000 },
        sourceImageSize: { width: 4000, height: 3000 },
        cameraId: 2,
        cameraModelId: 1,
        imageName: 'diagnostic.jpg',
      },
    });

    const state = useImageMetricsStore.getState();
    expect(state.splatPsnrStatus.get(7)).toBe('ready');
    expect(state.splatPsnrError.has(7)).toBe(false);
    expect(state.splatPsnrMetrics.get(7)?.diagnostics).toEqual(expect.objectContaining({
      validPixelRatio: 0.5,
      renderedMeanRgb: [10, 20, 30],
      groundTruthMeanRgb: [50, 60, 70],
      bestOffset: expect.objectContaining({
        dx: -1,
        dy: 0,
      }),
      backgroundMismatch: expect.objectContaining({
        classification: 'possible',
      }),
      backgroundDiagnostics: expect.objectContaining({
        baseline: expect.objectContaining({
          label: 'opaque-black',
        }),
        best: expect.objectContaining({
          label: 'opaque-white',
        }),
      }),
      imageName: 'diagnostic.jpg',
    }));
    expect(state.splatPsnrMetrics.get(7)?.renderBackground).toEqual({
      label: 'opaque-black',
      rgba: [0, 0, 0, 1],
    });
  });
});
