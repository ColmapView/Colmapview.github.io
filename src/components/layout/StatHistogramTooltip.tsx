import { useRef, useLayoutEffect, useState } from 'react';
import { histogramStyles, CHART_COLORS } from '../../theme';
import {
  STAT_HISTOGRAM_CHART_HEIGHT,
  STAT_HISTOGRAM_CHART_WIDTH,
  STAT_HISTOGRAM_SVG_HEIGHT,
  STAT_HISTOGRAM_TOP_PADDING,
  getStatHistogramBarLayout,
  getStatHistogramBarWidth,
  getStatHistogramHorizontalAdjustment,
  getStatHistogramMaxPercentage,
  getStatHistogramTooltipStyle,
} from './statHistogramViewModel';

export interface HistogramBin {
  label: string;
  count: number;
  percentage: number;
}

export interface StatHistogramTooltipProps {
  title: string;
  bins: HistogramBin[];
}

export function StatHistogramTooltip({
  title,
  bins,
}: StatHistogramTooltipProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [adjustedLeft, setAdjustedLeft] = useState<number | null>(null);

  // Adjust position to keep tooltip within viewport
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    setAdjustedLeft(getStatHistogramHorizontalAdjustment(rect, viewportWidth));
  }, []);

  // Find max percentage for scaling bars
  const maxPercentage = getStatHistogramMaxPercentage(bins);
  const barWidth = getStatHistogramBarWidth(bins.length);

  return (
    <div
      ref={containerRef}
      className={histogramStyles.container}
      style={getStatHistogramTooltipStyle(adjustedLeft)}
    >
      <div className={histogramStyles.card}>
        <div className={histogramStyles.title}>{title}</div>

        {/* SVG Bar Chart */}
        <svg
          width={STAT_HISTOGRAM_CHART_WIDTH}
          height={STAT_HISTOGRAM_SVG_HEIGHT}
          className="mt-2"
        >
          {/* Bars */}
          {bins.map((bin, i) => {
            const layout = getStatHistogramBarLayout(bin, i, maxPercentage, barWidth);

            return (
              <g key={bin.label}>
                {/* Bar background for visibility */}
                <rect
                  x={layout.x}
                  y={STAT_HISTOGRAM_TOP_PADDING}
                  width={barWidth}
                  height={STAT_HISTOGRAM_CHART_HEIGHT}
                  fill={CHART_COLORS.barBackground}
                  rx={3}
                />
                {/* Bar */}
                <rect
                  x={layout.x}
                  y={layout.y}
                  width={barWidth}
                  height={layout.barHeight || 1}
                  fill={CHART_COLORS.bar}
                  rx={3}
                />
                {/* Label */}
                <text
                  x={layout.x + barWidth / 2}
                  y={STAT_HISTOGRAM_TOP_PADDING + STAT_HISTOGRAM_CHART_HEIGHT + 12}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={500}
                  fill={CHART_COLORS.label}
                >
                  {bin.label}
                </text>
                {/* Percentage above bar - only show if significant */}
                {layout.showPercentageLabel && (
                  <text
                    x={layout.x + barWidth / 2}
                    y={layout.y - 3}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={600}
                    fill={CHART_COLORS.percentage}
                  >
                    {layout.percentageLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
