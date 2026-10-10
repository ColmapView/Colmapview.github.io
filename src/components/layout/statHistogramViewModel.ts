import type { CSSProperties } from 'react';
import type { HistogramBin, HistogramType } from '../../utils/histogram';

export interface StatHistogramTitleOptions {
  sampleCount?: number | null;
  totalCount?: number | null;
}

export interface StatHistogramHorizontalRect {
  left: number;
  right: number;
}

export interface StatHistogramBarLayout {
  label: string;
  percentage: number;
  percentageLabel: string;
  barHeight: number;
  x: number;
  y: number;
  showPercentageLabel: boolean;
}

export const STAT_HISTOGRAM_CHART_WIDTH = 320;
export const STAT_HISTOGRAM_CHART_HEIGHT = 100;
export const STAT_HISTOGRAM_BAR_GAP = 2;
export const STAT_HISTOGRAM_LABEL_HEIGHT = 18;
export const STAT_HISTOGRAM_TOP_PADDING = 16;
export const STAT_HISTOGRAM_VIEWPORT_PADDING = 8;
export const STAT_HISTOGRAM_PERCENTAGE_LABEL_THRESHOLD = 5;
export const STAT_HISTOGRAM_TOOLTIP_BOTTOM = '100%';
export const STAT_HISTOGRAM_TOOLTIP_MARGIN_BOTTOM = '8px';
export const STAT_HISTOGRAM_SVG_HEIGHT =
  STAT_HISTOGRAM_CHART_HEIGHT +
  STAT_HISTOGRAM_LABEL_HEIGHT +
  STAT_HISTOGRAM_TOP_PADDING;

export function getStatHistogramTitle(
  type: HistogramType,
  options: StatHistogramTitleOptions = {}
): string {
  if (type === 'trackLength') return 'Track Length Distribution';
  if (type === 'error') return 'Reprojection Error Distribution';

  const countLabel = formatPsnrHistogramCountLabel(options.sampleCount, options.totalCount);
  if (type === 'ssim') {
    return countLabel === null
      ? 'SSIM Distribution'
      : `SSIM Distribution ${countLabel}`;
  }
  return countLabel === null
    ? 'PSNR Distribution'
    : `PSNR Distribution ${countLabel}`;
}

export function getStatHistogramHorizontalAdjustment(
  rect: StatHistogramHorizontalRect,
  viewportWidth: number,
  padding = STAT_HISTOGRAM_VIEWPORT_PADDING
): number | null {
  if (rect.left < padding) {
    return padding - rect.left;
  }

  if (rect.right > viewportWidth - padding) {
    return -(rect.right - (viewportWidth - padding));
  }

  return null;
}

export function getStatHistogramTooltipTransform(adjustedLeft: number | null): string {
  return adjustedLeft !== null
    ? `translateX(calc(-50% + ${adjustedLeft}px))`
    : 'translateX(-50%)';
}

export function getStatHistogramTooltipStyle(
  adjustedLeft: number | null
): CSSProperties {
  return {
    bottom: STAT_HISTOGRAM_TOOLTIP_BOTTOM,
    marginBottom: STAT_HISTOGRAM_TOOLTIP_MARGIN_BOTTOM,
    transform: getStatHistogramTooltipTransform(adjustedLeft),
  };
}

export function getStatHistogramMaxPercentage(
  bins: readonly HistogramBin[]
): number {
  return Math.max(1, ...bins.map((bin) => bin.percentage));
}

export function getStatHistogramBarWidth(
  binCount: number,
  chartWidth = STAT_HISTOGRAM_CHART_WIDTH,
  barGap = STAT_HISTOGRAM_BAR_GAP
): number {
  if (binCount <= 0) {
    return 0;
  }

  return (chartWidth - (binCount - 1) * barGap) / binCount;
}

export function getStatHistogramBarLayout(
  bin: HistogramBin,
  index: number,
  maxPercentage: number,
  barWidth: number,
  chartHeight = STAT_HISTOGRAM_CHART_HEIGHT,
  barGap = STAT_HISTOGRAM_BAR_GAP,
  topPadding = STAT_HISTOGRAM_TOP_PADDING
): StatHistogramBarLayout {
  const barHeight = maxPercentage > 0
    ? (bin.percentage / maxPercentage) * chartHeight
    : 0;
  const x = index * (barWidth + barGap);
  const y = topPadding + chartHeight - barHeight;

  return {
    label: bin.label,
    percentage: bin.percentage,
    percentageLabel: `${bin.percentage.toFixed(0)}%`,
    barHeight,
    x,
    y,
    showPercentageLabel: bin.percentage >= STAT_HISTOGRAM_PERCENTAGE_LABEL_THRESHOLD,
  };
}

export function formatMeanPsnrValue(psnr: number | null): string {
  if (psnr === null || Number.isNaN(psnr)) return '--';
  if (psnr >= 99) return '99+ dB';
  return `${psnr.toFixed(1)} dB`;
}

export function formatMeanSsimValue(ssim: number | null): string {
  if (ssim === null || Number.isNaN(ssim)) return '--';
  return ssim.toFixed(3);
}

export function formatPsnrHistogramCountLabel(
  sampleCount: number | null | undefined,
  totalCount: number | null | undefined
): string | null {
  if (
    sampleCount === undefined ||
    sampleCount === null ||
    totalCount === undefined ||
    totalCount === null ||
    sampleCount < 0 ||
    totalCount < 0
  ) {
    return null;
  }

  return `(${Math.floor(sampleCount)}/${Math.floor(totalCount)})`;
}
