import { useState, useMemo } from 'react';
import type { Point3D, Point3DId } from '../../types/colmap';
import { StatHistogramTooltip, type HistogramBin } from './StatHistogramTooltip';

export type HistogramType = 'trackLength' | 'error';

interface StatWithHistogramProps {
  label: string;
  value: string;
  type: HistogramType;
  points3D: Map<Point3DId, Point3D>;
}

// Bin definitions for track length histogram (higher resolution)
// Using exclusive upper bound: [min, max)
const TRACK_LENGTH_BINS = [
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

// Bin definitions for reprojection error histogram (higher resolution, in pixels)
const ERROR_BINS = [
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

interface HistogramData {
  bins: HistogramBin[];
  mean: number;
  total: number;
}

function computeHistogram(
  points3D: Map<Point3DId, Point3D>,
  type: HistogramType
): HistogramData {
  const binDefs = type === 'trackLength' ? TRACK_LENGTH_BINS : ERROR_BINS;
  const counts = new Array(binDefs.length).fill(0);
  let sum = 0;
  let total = 0;

  // Single O(n) pass through all points
  for (const point of points3D.values()) {
    const value = type === 'trackLength' ? point.track.length : point.error;
    sum += value;
    total++;

    // Find the appropriate bin using [min, max) ranges
    // Last bin uses Infinity so it catches everything >= min
    for (let i = 0; i < binDefs.length; i++) {
      const bin = binDefs[i];
      if (value >= bin.min && value < bin.max) {
        counts[i]++;
        break;
      }
    }
  }

  const mean = total > 0 ? sum / total : 0;

  // Convert counts to bins with percentages
  const bins: HistogramBin[] = binDefs.map((def, i) => ({
    label: def.label,
    count: counts[i],
    percentage: total > 0 ? (counts[i] / total) * 100 : 0,
  }));

  return { bins, mean, total };
}

export function StatWithHistogram({
  label,
  value,
  type,
  points3D,
}: StatWithHistogramProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Lazily compute histogram only when hovered (and cache it)
  const histogramData = useMemo(() => {
    if (!isHovered || points3D.size === 0) return null;
    return computeHistogram(points3D, type);
  }, [isHovered, points3D, type]);

  const title =
    type === 'trackLength'
      ? 'Track Length Distribution'
      : 'Reprojection Error Distribution';

  return (
    <span
      className="relative cursor-help overflow-visible"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {label}: <span className="text-ds-primary">{value}</span>
      {isHovered && histogramData && (
        <StatHistogramTooltip
          title={title}
          bins={histogramData.bins}
        />
      )}
    </span>
  );
}
