import type { CSSProperties } from 'react';
import type { Point3D, Point3DId } from '../../types/colmap';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import type { HistogramBin } from './StatHistogramTooltip';

export type ReconstructionHistogramType = 'trackLength' | 'error';
export type HistogramType = ReconstructionHistogramType | 'psnr' | 'ssim';

export interface HistogramData {
  bins: HistogramBin[];
  mean: number;
  total: number;
}

export interface PsnrHistogramMetric {
  psnr: number;
  ssim?: number;
}

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

interface BinDefinition {
  label: string;
  min: number;
  max: number;
}

type HistogramWasmSource = Pick<
  WasmReconstructionWrapper,
  'getTrackLengths' | 'getErrors'
>;

export const TRACK_LENGTH_BINS: BinDefinition[] = [
  { label: '2', min: 2, max: 3 },
  { label: '3', min: 3, max: 4 },
  { label: '4', min: 4, max: 5 },
  { label: '5', min: 5, max: 6 },
  { label: '6', min: 6, max: 7 },
  { label: '7', min: 7, max: 8 },
  { label: '8', min: 8, max: 9 },
  { label: '9', min: 9, max: 10 },
  { label: '10', min: 10, max: 11 },
  { label: '11-15', min: 11, max: 16 },
  { label: '16-20', min: 16, max: 21 },
  { label: '21+', min: 21, max: Infinity },
];

export const ERROR_BINS: BinDefinition[] = [
  { label: '0-.25', min: 0, max: 0.25 },
  { label: '.25-.5', min: 0.25, max: 0.5 },
  { label: '.5-.75', min: 0.5, max: 0.75 },
  { label: '.75-1', min: 0.75, max: 1 },
  { label: '1-1.25', min: 1, max: 1.25 },
  { label: '1.25-1.5', min: 1.25, max: 1.5 },
  { label: '1.5-2', min: 1.5, max: 2 },
  { label: '2-2.5', min: 2, max: 2.5 },
  { label: '2.5-3', min: 2.5, max: 3 },
  { label: '3-4', min: 3, max: 4 },
  { label: '4-5', min: 4, max: 5 },
  { label: '5+', min: 5, max: Infinity },
];

export const PSNR_HISTOGRAM_BIN_COUNT = 10;

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

export function getHistogramBinIndex(value: number, binDefs: BinDefinition[]): number {
  for (let i = 0; i < binDefs.length; i++) {
    if (value >= binDefs[i].min && value < binDefs[i].max) {
      return i;
    }
  }
  return -1;
}

export function countsToHistogramBins(
  counts: number[],
  binDefs: BinDefinition[],
  total: number
): HistogramBin[] {
  return binDefs.map((def, i) => ({
    label: def.label,
    count: counts[i],
    percentage: total > 0 ? (counts[i] / total) * 100 : 0,
  }));
}

export function computeHistogramFromWasm(
  wasm: HistogramWasmSource,
  type: ReconstructionHistogramType
): HistogramData {
  const binDefs = type === 'trackLength' ? TRACK_LENGTH_BINS : ERROR_BINS;
  const values = type === 'trackLength' ? wasm.getTrackLengths() : wasm.getErrors();

  if (!values) {
    return {
      bins: countsToHistogramBins(new Array(binDefs.length).fill(0), binDefs, 0),
      mean: 0,
      total: 0,
    };
  }

  return computeHistogramFromValues(values, binDefs);
}

export function computeHistogramFromMap(
  points3D: Map<Point3DId, Point3D>,
  type: ReconstructionHistogramType
): HistogramData {
  const values = Array.from(
    points3D.values(),
    point => type === 'trackLength' ? point.track.length : point.error
  );
  const binDefs = type === 'trackLength' ? TRACK_LENGTH_BINS : ERROR_BINS;

  return computeHistogramFromValues(values, binDefs);
}

export function computeHistogramFromPsnrMetrics(
  metrics: ReadonlyMap<number, PsnrHistogramMetric>
): HistogramData {
  const values = getMetricValues(metrics, (metric) => normalizePsnrHistogramValue(metric.psnr));
  return computeHistogramFromValues(values, createMetricBins(values));
}

export function computeHistogramFromSsimMetrics(
  metrics: ReadonlyMap<number, PsnrHistogramMetric>
): HistogramData {
  const values = getMetricValues(metrics, (metric) => normalizeSsimHistogramValue(metric.ssim));
  return computeHistogramFromValues(values, createMetricBins(values));
}

export function computeMeanPsnrFromMetrics(
  metrics: ReadonlyMap<number, PsnrHistogramMetric>
): number | null {
  return computeMeanFromMetricValues(metrics, (metric) => normalizePsnrHistogramValue(metric.psnr));
}

export function computeMeanSsimFromMetrics(
  metrics: ReadonlyMap<number, PsnrHistogramMetric>
): number | null {
  return computeMeanFromMetricValues(metrics, (metric) => normalizeSsimHistogramValue(metric.ssim));
}

function computeMeanFromMetricValues(
  metrics: ReadonlyMap<number, PsnrHistogramMetric>,
  getValue: (metric: PsnrHistogramMetric) => number | null
): number | null {
  let sum = 0;
  let total = 0;

  for (const metric of metrics.values()) {
    const value = getValue(metric);
    if (value === null) continue;
    sum += value;
    total++;
  }

  return total > 0 ? sum / total : null;
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

function normalizePsnrHistogramValue(psnr: number): number | null {
  if (Number.isFinite(psnr)) return psnr;
  if (psnr === Infinity) return 100;
  return null;
}

function normalizeSsimHistogramValue(ssim: number | null | undefined): number | null {
  return ssim !== undefined && ssim !== null && Number.isFinite(ssim) ? ssim : null;
}

function getMetricValues(
  metrics: ReadonlyMap<number, PsnrHistogramMetric>,
  getValue: (metric: PsnrHistogramMetric) => number | null
): number[] {
  const values: number[] = [];
  for (const metric of metrics.values()) {
    const value = getValue(metric);
    if (value !== null) {
      values.push(value);
    }
  }
  return values;
}

function createMetricBins(values: readonly number[]): BinDefinition[] {
  if (values.length === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const hasRange = max > min;
  const start = hasRange ? min : min - 0.5;
  const end = hasRange ? max : max + 0.5;
  const range = end - start;
  const binWidth = range / PSNR_HISTOGRAM_BIN_COUNT;
  const binEpsilon = Math.max(Number.EPSILON, Math.abs(end) * Number.EPSILON);

  return Array.from({ length: PSNR_HISTOGRAM_BIN_COUNT }, (_, index) => {
    const binMin = start + index * binWidth;
    const binMax = index === PSNR_HISTOGRAM_BIN_COUNT - 1
      ? end + binEpsilon
      : start + (index + 1) * binWidth;
    return {
      label: formatMetricBinEdge(binMin, range),
      min: binMin,
      max: binMax,
    };
  });
}

function formatMetricBinEdge(value: number, range: number): string {
  if (range >= 20) return value.toFixed(0);
  if (range >= 5) return value.toFixed(1);
  return value.toFixed(2);
}

function computeHistogramFromValues(
  values: ArrayLike<number>,
  binDefs: BinDefinition[]
): HistogramData {
  const counts = new Array(binDefs.length).fill(0);
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    const binIdx = getHistogramBinIndex(values[i], binDefs);
    if (binIdx >= 0) counts[binIdx]++;
  }

  const total = values.length;
  return {
    bins: countsToHistogramBins(counts, binDefs, total),
    mean: total > 0 ? sum / total : 0,
    total,
  };
}
