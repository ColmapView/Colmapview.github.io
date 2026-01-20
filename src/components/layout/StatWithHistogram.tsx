import { useState, useMemo } from 'react';
import type { Point3D, Point3DId } from '../../types/colmap';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import { StatHistogramTooltip, type HistogramBin } from './StatHistogramTooltip';

export type HistogramType = 'trackLength' | 'error';

interface StatWithHistogramProps {
  label: string;
  value: string;
  type: HistogramType;
  /** Optional points3D Map (for JS parser fallback) */
  points3D?: Map<Point3DId, Point3D>;
  /** Optional WASM reconstruction (preferred, avoids iterating Map) */
  wasmReconstruction?: WasmReconstructionWrapper | null;
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

interface BinDefinition {
  label: string;
  min: number;
  max: number;
}

/**
 * Find the bin index for a value using [min, max) ranges.
 */
function findBinIndex(value: number, binDefs: BinDefinition[]): number {
  for (let i = 0; i < binDefs.length; i++) {
    if (value >= binDefs[i].min && value < binDefs[i].max) {
      return i;
    }
  }
  return -1;
}

/**
 * Convert bin counts to histogram bins with percentages.
 */
function countsToHistogramBins(counts: number[], binDefs: BinDefinition[], total: number): HistogramBin[] {
  return binDefs.map((def, i) => ({
    label: def.label,
    count: counts[i],
    percentage: total > 0 ? (counts[i] / total) * 100 : 0,
  }));
}

/**
 * Compute histogram from WASM typed arrays (preferred, avoids Map iteration)
 */
function computeHistogramFromWasm(
  wasm: WasmReconstructionWrapper,
  type: HistogramType
): HistogramData {
  const binDefs = type === 'trackLength' ? TRACK_LENGTH_BINS : ERROR_BINS;
  const values = type === 'trackLength' ? wasm.getTrackLengths() : wasm.getErrors();

  if (!values) {
    return { bins: countsToHistogramBins(new Array(binDefs.length).fill(0), binDefs, 0), mean: 0, total: 0 };
  }

  const counts = new Array(binDefs.length).fill(0);
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    const binIdx = findBinIndex(values[i], binDefs);
    if (binIdx >= 0) counts[binIdx]++;
  }

  const total = values.length;
  return {
    bins: countsToHistogramBins(counts, binDefs, total),
    mean: total > 0 ? sum / total : 0,
    total,
  };
}

/**
 * Compute histogram from points3D Map (fallback for JS parser)
 */
function computeHistogramFromMap(
  points3D: Map<Point3DId, Point3D>,
  type: HistogramType
): HistogramData {
  const binDefs = type === 'trackLength' ? TRACK_LENGTH_BINS : ERROR_BINS;
  const counts = new Array(binDefs.length).fill(0);
  let sum = 0;
  let total = 0;

  for (const point of points3D.values()) {
    const value = type === 'trackLength' ? point.track.length : point.error;
    sum += value;
    total++;
    const binIdx = findBinIndex(value, binDefs);
    if (binIdx >= 0) counts[binIdx]++;
  }

  return {
    bins: countsToHistogramBins(counts, binDefs, total),
    mean: total > 0 ? sum / total : 0,
    total,
  };
}

export function StatWithHistogram({
  label,
  value,
  type,
  points3D,
  wasmReconstruction,
}: StatWithHistogramProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Lazily compute histogram only when hovered (and cache it)
  // Prefer WASM arrays over points3D Map for better performance
  const histogramData = useMemo(() => {
    if (!isHovered) return null;

    // Prefer WASM arrays if available
    if (wasmReconstruction?.hasPoints()) {
      return computeHistogramFromWasm(wasmReconstruction, type);
    }

    // Fallback to points3D Map
    if (points3D && points3D.size > 0) {
      return computeHistogramFromMap(points3D, type);
    }

    return null;
  }, [isHovered, points3D, wasmReconstruction, type]);

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
