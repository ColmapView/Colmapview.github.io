import { useMemo } from 'react';
import { usePointCloudStore } from '../../store';
import type { ColorMode } from '../../store/types';

export interface PointsNodeActions {
  setVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
  setSize: (size: number) => void;
  setColorMode: (mode: ColorMode) => void;
  setMinTrackLength: (length: number) => void;
  setMaxReprojectionError: (error: number | null) => void;
  setThinning: (n: number) => void;
  setSelectedPointId: (id: bigint | null) => void;
  toggleVisible: () => void;
}

export function usePointsNodeActions(): PointsNodeActions {
  return useMemo(
    () => ({
      setVisible: (v) => usePointCloudStore.getState().setShowPointCloud(v),
      setOpacity: (o) => usePointCloudStore.getState().setPointOpacity(o),
      setSize: (s) => usePointCloudStore.getState().setPointSize(s),
      setColorMode: (m) => usePointCloudStore.getState().setColorMode(m),
      setMinTrackLength: (l) => usePointCloudStore.getState().setMinTrackLength(l),
      setMaxReprojectionError: (e) =>
        usePointCloudStore.getState().setMaxReprojectionError(e ?? Infinity),
      setThinning: (n) => usePointCloudStore.getState().setThinning(n),
      setSelectedPointId: (id) => usePointCloudStore.getState().setSelectedPointId(id),
      toggleVisible: () => usePointCloudStore.getState().togglePointCloud(),
    }),
    []
  );
}
