export interface PointCloudFilterOptions {
  minTrackLength: number;
  maxReprojectionError: number;
  thinning: number;
}

export interface NumericRange {
  min: number;
  max: number;
}

export function shouldUsePointCloudFastPath({
  minTrackLength,
  maxReprojectionError,
  thinning,
}: PointCloudFilterOptions): boolean {
  return minTrackLength <= 1 && maxReprojectionError >= 1000 && thinning === 0;
}

export function shouldIncludePointByFilters(
  index: number,
  trackLength: number,
  reprojectionError: number,
  filters: PointCloudFilterOptions
): boolean {
  if (filters.thinning > 0 && index % (filters.thinning + 1) !== 0) {
    return false;
  }

  if (trackLength < filters.minTrackLength) {
    return false;
  }

  return reprojectionError <= filters.maxReprojectionError;
}

export function getPoint3DIdForIndex(
  point3DIds: ArrayLike<bigint> | null | undefined,
  index: number
): bigint {
  return point3DIds ? point3DIds[index] : BigInt(index + 1);
}

export function normalizeEqualRange(min: number, max: number): NumericRange {
  return min === max ? { min, max: min + 1 } : { min, max };
}
