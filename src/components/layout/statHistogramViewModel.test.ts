import { describe, expect, it } from 'vitest';
import type { Point3D } from '../../types/colmap';
import {
  ERROR_BINS,
  PSNR_HISTOGRAM_BIN_COUNT,
  STAT_HISTOGRAM_CHART_HEIGHT,
  STAT_HISTOGRAM_CHART_WIDTH,
  STAT_HISTOGRAM_LABEL_HEIGHT,
  STAT_HISTOGRAM_SVG_HEIGHT,
  STAT_HISTOGRAM_TOP_PADDING,
  TRACK_LENGTH_BINS,
  computeHistogramFromMap,
  computeHistogramFromPsnrMetrics,
  computeHistogramFromSsimMetrics,
  computeHistogramFromWasm,
  computeMeanPsnrFromMetrics,
  computeMeanSsimFromMetrics,
  countsToHistogramBins,
  formatMeanPsnrValue,
  formatMeanSsimValue,
  formatPsnrHistogramCountLabel,
  getStatHistogramBarLayout,
  getStatHistogramBarWidth,
  getStatHistogramHorizontalAdjustment,
  getStatHistogramMaxPercentage,
  getHistogramBinIndex,
  getStatHistogramTooltipStyle,
  getStatHistogramTooltipTransform,
  getStatHistogramTitle,
} from './statHistogramViewModel';

describe('stat histogram view model', () => {
  it('selects histogram titles by stat type', () => {
    expect(getStatHistogramTitle('trackLength')).toBe('Track Length Distribution');
    expect(getStatHistogramTitle('error')).toBe('Reprojection Error Distribution');
    expect(getStatHistogramTitle('psnr')).toBe('PSNR Distribution');
    expect(getStatHistogramTitle('psnr', { sampleCount: 100, totalCount: 200 }))
      .toBe('PSNR Distribution (100/200)');
    expect(getStatHistogramTitle('ssim')).toBe('SSIM Distribution');
    expect(getStatHistogramTitle('ssim', { sampleCount: 80, totalCount: 200 }))
      .toBe('SSIM Distribution (80/200)');
  });

  it('uses exclusive upper bounds when assigning values to bins', () => {
    expect(getHistogramBinIndex(2, TRACK_LENGTH_BINS)).toBe(0);
    expect(getHistogramBinIndex(3, TRACK_LENGTH_BINS)).toBe(1);
    expect(getHistogramBinIndex(21, TRACK_LENGTH_BINS)).toBe(11);
    expect(getHistogramBinIndex(-1, TRACK_LENGTH_BINS)).toBe(-1);

    expect(getHistogramBinIndex(0.25, ERROR_BINS)).toBe(1);
    expect(getHistogramBinIndex(5, ERROR_BINS)).toBe(11);
  });

  it('converts bin counts to percentages', () => {
    expect(countsToHistogramBins([1, 3], [
      { label: 'a', min: 0, max: 1 },
      { label: 'b', min: 1, max: 2 },
    ], 4)).toEqual([
      { label: 'a', count: 1, percentage: 25 },
      { label: 'b', count: 3, percentage: 75 },
    ]);
  });

  it('computes track-length histograms from WASM arrays', () => {
    const wasmSource: Parameters<typeof computeHistogramFromWasm>[0] = {
      getTrackLengths: () => new Uint32Array([2, 3, 3, 21]),
      getErrors: () => new Float32Array([0.1]),
    };

    const histogram = computeHistogramFromWasm(wasmSource, 'trackLength');

    expect(histogram.total).toBe(4);
    expect(histogram.mean).toBe(7.25);
    expect(binCount(histogram.bins, '2')).toBe(1);
    expect(binCount(histogram.bins, '3')).toBe(2);
    expect(binCount(histogram.bins, '21+')).toBe(1);
    expect(binPercentage(histogram.bins, '3')).toBe(50);
  });

  it('computes reprojection error histograms from point maps', () => {
    const points = new Map([
      [BigInt(1), point(1, 0.2, 2)],
      [BigInt(2), point(2, 0.5, 3)],
      [BigInt(3), point(3, 5.5, 4)],
    ]);

    const histogram = computeHistogramFromMap(points, 'error');

    expect(histogram.total).toBe(3);
    expect(histogram.mean).toBeCloseTo(2.0667, 4);
    expect(binCount(histogram.bins, '0-.25')).toBe(1);
    expect(binCount(histogram.bins, '.5-.75')).toBe(1);
    expect(binCount(histogram.bins, '5+')).toBe(1);
  });

  it('returns an empty histogram when the selected WASM array is unavailable', () => {
    const wasmSource: Parameters<typeof computeHistogramFromWasm>[0] = {
      getTrackLengths: () => null,
      getErrors: () => null,
    };

    const histogram = computeHistogramFromWasm(wasmSource, 'error');

    expect(histogram.total).toBe(0);
    expect(histogram.mean).toBe(0);
    expect(histogram.bins.every((bin) => bin.count === 0 && bin.percentage === 0)).toBe(true);
  });

  it('computes PSNR histograms as 10 dynamic min-max bins', () => {
    const metrics = new Map([
      [1, { psnr: 8 }],
      [2, { psnr: 18 }],
      [3, { psnr: 31 }],
      [4, { psnr: 42 }],
      [5, { psnr: NaN }],
      [6, { psnr: Infinity }],
    ]);

    const histogram = computeHistogramFromPsnrMetrics(metrics);

    expect(histogram.total).toBe(5);
    expect(histogram.mean).toBeCloseTo(39.8, 4);
    expect(histogram.bins).toHaveLength(PSNR_HISTOGRAM_BIN_COUNT);
    expect(histogram.bins.map((bin) => bin.label)).toEqual([
      '8',
      '17',
      '26',
      '36',
      '45',
      '54',
      '63',
      '72',
      '82',
      '91',
    ]);
    expect(binCount(histogram.bins, '8')).toBe(1);
    expect(binCount(histogram.bins, '17')).toBe(1);
    expect(binCount(histogram.bins, '26')).toBe(1);
    expect(binCount(histogram.bins, '36')).toBe(1);
    expect(binCount(histogram.bins, '91')).toBe(1);
  });

  it('formats mean PSNR from metric maps', () => {
    expect(computeMeanPsnrFromMetrics(new Map([[1, { psnr: 28 }], [2, { psnr: 32 }]]))).toBe(30);
    expect(computeMeanPsnrFromMetrics(new Map([[1, { psnr: NaN }]]))).toBeNull();
    expect(formatMeanPsnrValue(30)).toBe('30.0 dB');
    expect(formatMeanPsnrValue(100)).toBe('99+ dB');
    expect(formatMeanPsnrValue(null)).toBe('--');
    expect(formatPsnrHistogramCountLabel(12.8, 20.2)).toBe('(12/20)');
    expect(formatPsnrHistogramCountLabel(null, 20)).toBeNull();
  });

  it('computes and formats SSIM histograms from finite metrics', () => {
    const metrics = new Map([
      [1, { psnr: 20, ssim: 0.8 }],
      [2, { psnr: 21, ssim: 0.9 }],
      [3, { psnr: 22, ssim: 1 }],
      [4, { psnr: 23 }],
      [5, { psnr: 24, ssim: NaN }],
    ]);

    const histogram = computeHistogramFromSsimMetrics(metrics);

    expect(histogram.total).toBe(3);
    expect(histogram.mean).toBeCloseTo(0.9);
    expect(histogram.bins).toHaveLength(PSNR_HISTOGRAM_BIN_COUNT);
    expect(binCount(histogram.bins, '0.80')).toBe(1);
    expect(binCount(histogram.bins, '0.90')).toBe(1);
    expect(binCount(histogram.bins, '0.98')).toBe(1);
    expect(computeMeanSsimFromMetrics(metrics)).toBeCloseTo(0.9);
    expect(formatMeanSsimValue(0.91234)).toBe('0.912');
    expect(formatMeanSsimValue(null)).toBe('--');
  });

  it('computes tooltip viewport adjustment and styles', () => {
    expect(getStatHistogramHorizontalAdjustment({ left: 4, right: 304 }, 800, 8)).toBe(4);
    expect(getStatHistogramHorizontalAdjustment({ left: 540, right: 810 }, 800, 8)).toBe(-18);
    expect(getStatHistogramHorizontalAdjustment({ left: 120, right: 420 }, 800, 8)).toBeNull();

    expect(getStatHistogramTooltipTransform(null)).toBe('translateX(-50%)');
    expect(getStatHistogramTooltipTransform(12)).toBe('translateX(calc(-50% + 12px))');
    expect(getStatHistogramTooltipStyle(12)).toEqual({
      bottom: '100%',
      marginBottom: '8px',
      transform: 'translateX(calc(-50% + 12px))',
    });
  });

  it('computes SVG sizing and bar layout', () => {
    expect(STAT_HISTOGRAM_CHART_WIDTH).toBe(320);
    expect(STAT_HISTOGRAM_SVG_HEIGHT).toBe(
      STAT_HISTOGRAM_CHART_HEIGHT +
      STAT_HISTOGRAM_LABEL_HEIGHT +
      STAT_HISTOGRAM_TOP_PADDING
    );

    const bins = [
      { label: 'A', count: 1, percentage: 25 },
      { label: 'B', count: 2, percentage: 50 },
    ];

    expect(getStatHistogramMaxPercentage(bins)).toBe(50);
    expect(getStatHistogramBarWidth(4)).toBe(78.5);

    expect(getStatHistogramBarLayout(bins[0], 1, 50, 78.5)).toEqual({
      label: 'A',
      percentage: 25,
      percentageLabel: '25%',
      barHeight: 50,
      x: 80.5,
      y: 66,
      showPercentageLabel: true,
    });

    expect(
      getStatHistogramBarLayout({ label: 'C', count: 1, percentage: 4.9 }, 0, 50, 78.5)
        .showPercentageLabel
    ).toBe(false);
    expect(getStatHistogramBarWidth(0)).toBe(0);
  });
});

function point(id: number, error: number, trackLength: number): Point3D {
  const xyz: [number, number, number] = [0, 0, 0];
  const rgb: [number, number, number] = [255, 255, 255];

  return {
    point3DId: BigInt(id),
    xyz,
    rgb,
    error,
    track: Array.from({ length: trackLength }, (_, index) => ({
      imageId: index + 1,
      point2DIdx: index,
    })),
  };
}

function binCount(bins: Array<{ label: string; count: number }>, label: string): number {
  return bins.find((bin) => bin.label === label)?.count ?? 0;
}

function binPercentage(bins: Array<{ label: string; percentage: number }>, label: string): number {
  return bins.find((bin) => bin.label === label)?.percentage ?? 0;
}
