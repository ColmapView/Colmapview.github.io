import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { ColorMode } from '../types';

export interface PointCloudState {
  showPointCloud: boolean;
  pointSize: number;
  pointOpacity: number;
  colorMode: ColorMode;
  minTrackLength: number;
  maxReprojectionError: number;
  selectedPointId: bigint | null;

  setShowPointCloud: (show: boolean) => void;
  togglePointCloud: () => void;
  setPointSize: (size: number) => void;
  setPointOpacity: (opacity: number) => void;
  setColorMode: (mode: ColorMode) => void;
  setMinTrackLength: (length: number) => void;
  setMaxReprojectionError: (error: number) => void;
  setSelectedPointId: (id: bigint | null) => void;
}

export const usePointCloudStore = create<PointCloudState>()(
  persist(
    (set) => ({
      showPointCloud: true,
      pointSize: 2,
      pointOpacity: 1,
      colorMode: 'rgb',
      minTrackLength: 0,
      maxReprojectionError: Infinity,
      selectedPointId: null,

      setShowPointCloud: (showPointCloud) => set({ showPointCloud }),
      togglePointCloud: () => set((state) => ({ showPointCloud: !state.showPointCloud })),
      setPointSize: (pointSize) => set({ pointSize }),
      setPointOpacity: (pointOpacity) => set({ pointOpacity }),
      setColorMode: (colorMode) => set({ colorMode }),
      setMinTrackLength: (minTrackLength) => set({ minTrackLength }),
      setMaxReprojectionError: (maxReprojectionError) => set({ maxReprojectionError }),
      setSelectedPointId: (selectedPointId) => set({ selectedPointId }),
    }),
    {
      name: STORAGE_KEYS.pointCloud,
      version: 0,
      partialize: (state) => ({
        showPointCloud: state.showPointCloud,
        pointSize: state.pointSize,
        pointOpacity: state.pointOpacity,
        colorMode: state.colorMode,
        minTrackLength: state.minTrackLength,
        maxReprojectionError: state.maxReprojectionError,
      }),
      // Handle Infinity serialization: JSON.stringify(Infinity) becomes null,
      // so we convert null back to Infinity on load
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<PointCloudState>),
        maxReprojectionError:
          (persistedState as Partial<PointCloudState>)?.maxReprojectionError ?? Infinity,
      }),
    }
  )
);
