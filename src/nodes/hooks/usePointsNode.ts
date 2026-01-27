import { useMemo } from 'react';
import { usePointCloudStore } from '../../store';
import type { PointsNode } from '../types';

export function usePointsNode(): PointsNode {
  const showPointCloud = usePointCloudStore((s) => s.showPointCloud);
  const pointOpacity = usePointCloudStore((s) => s.pointOpacity);
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const colorMode = usePointCloudStore((s) => s.colorMode);
  const minTrackLength = usePointCloudStore((s) => s.minTrackLength);
  const maxReprojectionError = usePointCloudStore((s) => s.maxReprojectionError);
  const thinning = usePointCloudStore((s) => s.thinning);
  const selectedPointId = usePointCloudStore((s) => s.selectedPointId);

  return useMemo<PointsNode>(
    () => ({
      nodeType: 'points',
      visible: showPointCloud,
      opacity: pointOpacity,
      size: pointSize,
      colorMode,
      minTrackLength,
      maxReprojectionError: maxReprojectionError === Infinity ? null : maxReprojectionError,
      thinning,
      selectedPointId,
    }),
    [
      showPointCloud,
      pointOpacity,
      pointSize,
      colorMode,
      minTrackLength,
      maxReprojectionError,
      thinning,
      selectedPointId,
    ]
  );
}
