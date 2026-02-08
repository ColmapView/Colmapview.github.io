import { useRef, useLayoutEffect, useState } from 'react';
import { histogramStyles, CHART_COLORS } from '../../theme';

export interface HistogramBin {
  label: string;
  count: number;
  percentage: number;
}

export interface StatHistogramTooltipProps {
  title: string;
  bins: HistogramBin[];
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 100;
const BAR_GAP = 2;
const LABEL_HEIGHT = 18;
const TOP_PADDING = 16; // Space for percentage labels above bars
const VIEWPORT_PADDING = 8; // Minimum distance from viewport edge

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

    // Check if tooltip overflows left edge
    if (rect.left < VIEWPORT_PADDING) {
      // Shift right to keep within bounds
      const shift = VIEWPORT_PADDING - rect.left;
      setAdjustedLeft(shift);
    }
    // Check if tooltip overflows right edge
    else if (rect.right > viewportWidth - VIEWPORT_PADDING) {
      // Shift left to keep within bounds
      const shift = rect.right - (viewportWidth - VIEWPORT_PADDING);
      setAdjustedLeft(-shift);
    }
    // No adjustment needed
    else {
      setAdjustedLeft(null);
    }
  }, []);

  // Find max percentage for scaling bars
  const maxPercentage = Math.max(...bins.map((b) => b.percentage), 1);
  const barWidth = (CHART_WIDTH - (bins.length - 1) * BAR_GAP) / bins.length;

  // Compute transform style: center by default, adjust if needed
  const transformStyle = adjustedLeft !== null
    ? `translateX(calc(-50% + ${adjustedLeft}px))`
    : 'translateX(-50%)';

  return (
    <div
      ref={containerRef}
      className={histogramStyles.container}
      style={{
        bottom: '100%',
        marginBottom: '8px',
        transform: transformStyle,
      }}
    >
      <div className={histogramStyles.card}>
        <div className={histogramStyles.title}>{title}</div>

        {/* SVG Bar Chart */}
        <svg
          width={CHART_WIDTH}
          height={CHART_HEIGHT + LABEL_HEIGHT + TOP_PADDING}
          className="mt-2"
        >
          {/* Bars */}
          {bins.map((bin, i) => {
            const barHeight = (bin.percentage / maxPercentage) * CHART_HEIGHT;
            const x = i * (barWidth + BAR_GAP);
            const y = TOP_PADDING + CHART_HEIGHT - barHeight;

            return (
              <g key={bin.label}>
                {/* Bar background for visibility */}
                <rect
                  x={x}
                  y={TOP_PADDING}
                  width={barWidth}
                  height={CHART_HEIGHT}
                  fill={CHART_COLORS.barBackground}
                  rx={3}
                />
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight || 1}
                  fill={CHART_COLORS.bar}
                  rx={3}
                />
                {/* Label */}
                <text
                  x={x + barWidth / 2}
                  y={TOP_PADDING + CHART_HEIGHT + 12}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={500}
                  fill={CHART_COLORS.label}
                >
                  {bin.label}
                </text>
                {/* Percentage above bar - only show if significant */}
                {bin.percentage >= 5 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={600}
                    fill={CHART_COLORS.percentage}
                  >
                    {bin.percentage.toFixed(0)}%
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
