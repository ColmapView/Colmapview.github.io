import { describe, expect, it } from 'vitest';
import type { Point3D } from '../../types/colmap';
import {
  ERROR_BINS,
  STAT_HISTOGRAM_CHART_HEIGHT,
  STAT_HISTOGRAM_CHART_WIDTH,
  STAT_HISTOGRAM_LABEL_HEIGHT,
  STAT_HISTOGRAM_SVG_HEIGHT,
  STAT_HISTOGRAM_TOP_PADDING,
  TRACK_LENGTH_BINS,
  computeHistogramFromMap,
  computeHistogramFromWasm,
  countsToHistogramBins,
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
