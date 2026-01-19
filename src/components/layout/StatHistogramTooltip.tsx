import { histogramStyles } from '../../theme';

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

export function StatHistogramTooltip({
  title,
  bins,
}: StatHistogramTooltipProps) {
  // Find max percentage for scaling bars
  const maxPercentage = Math.max(...bins.map((b) => b.percentage), 1);
  const barWidth = (CHART_WIDTH - (bins.length - 1) * BAR_GAP) / bins.length;

  return (
    <div
      className={histogramStyles.container}
      style={{ bottom: '100%', marginBottom: '8px' }}
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
                  fill="rgba(255,255,255,0.05)"
                  rx={3}
                />
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight || 1}
                  fill="#f59e0b"
                  rx={3}
                />
                {/* Label */}
                <text
                  x={x + barWidth / 2}
                  y={TOP_PADDING + CHART_HEIGHT + 12}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={500}
                  fill="#e5e7eb"
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
                    fill="#fbbf24"
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
