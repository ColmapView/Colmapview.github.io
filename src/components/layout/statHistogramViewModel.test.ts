import { describe, expect, it } from 'vitest';
import {
  STAT_HISTOGRAM_CHART_HEIGHT,
  STAT_HISTOGRAM_CHART_WIDTH,
  STAT_HISTOGRAM_LABEL_HEIGHT,
  STAT_HISTOGRAM_SVG_HEIGHT,
  STAT_HISTOGRAM_TOP_PADDING,
  formatMeanPsnrValue,
  formatMeanSsimValue,
  formatPsnrHistogramCountLabel,
  getStatHistogramBarLayout,
  getStatHistogramBarWidth,
  getStatHistogramHorizontalAdjustment,
  getStatHistogramMaxPercentage,
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

  it('formats mean PSNR and sample counts', () => {
    expect(formatMeanPsnrValue(30)).toBe('30.0 dB');
    expect(formatMeanPsnrValue(100)).toBe('99+ dB');
    expect(formatMeanPsnrValue(null)).toBe('--');
    expect(formatPsnrHistogramCountLabel(12.8, 20.2)).toBe('(12/20)');
    expect(formatPsnrHistogramCountLabel(null, 20)).toBeNull();
  });

  it('formats mean SSIM', () => {
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
