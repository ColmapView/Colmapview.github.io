import type { Point3D } from '../types/colmap';

export interface PointFilterWarning {
  filteredCount: number;
  percentage: string;
  message: string;
}

export interface PointFilterWarningInput {
  minTrackLength: number;
  pointCount: number;
  wasmTrackLengths?: ArrayLike<number> | null;
  points3D?: Iterable<Point3D>;
}

export function getPointFilterWarning({
  minTrackLength,
  pointCount,
  wasmTrackLengths,
  points3D,
}: PointFilterWarningInput): PointFilterWarning | null {
  if (minTrackLength < 2 || pointCount <= 0) {
    return null;
  }

  const filteredCount = wasmTrackLengths
    ? countFilteredTrackLengths(wasmTrackLengths, minTrackLength)
    : countFilteredPoints(points3D, minTrackLength);

  if (filteredCount === 0) {
    return null;
  }

  const percentage = ((filteredCount / pointCount) * 100).toFixed(1);
  return {
    filteredCount,
    percentage,
    message: `${filteredCount.toLocaleString()} points (${percentage}%) hidden due to min track length filter (${minTrackLength}). Adjust in Point Cloud settings.`,
  };
}

function countFilteredTrackLengths(trackLengths: ArrayLike<number>, minTrackLength: number): number {
  let filteredCount = 0;
  for (let i = 0; i < trackLengths.length; i++) {
    if (trackLengths[i] < minTrackLength) {
      filteredCount++;
    }
  }
  return filteredCount;
}

function countFilteredPoints(points3D: Iterable<Point3D> | undefined, minTrackLength: number): number {
  if (!points3D) {
    return 0;
  }

  let filteredCount = 0;
  for (const point of points3D) {
    if (point.track.length < minTrackLength) {
      filteredCount++;
    }
  }
  return filteredCount;
}
