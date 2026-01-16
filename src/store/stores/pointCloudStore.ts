import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { ColorMode } from '../types';

export interface PointCloudState {
  pointSize: number;
  colorMode: ColorMode;
  minTrackLength: number;
  maxReprojectionError: number;
  selectedPointId: bigint | null;

  setPointSize: (size: number) => void;
  setColorMode: (mode: ColorMode) => void;
  setMinTrackLength: (length: number) => void;
  setMaxReprojectionError: (error: number) => void;
  setSelectedPointId: (id: bigint | null) => void;
}

export const usePointCloudStore = create<PointCloudState>()(
  persist(
    (set) => ({
      pointSize: 2,
      colorMode: 'rgb',
      minTrackLength: 2,
      maxReprojectionError: Infinity,
      selectedPointId: null,

      setPointSize: (pointSize) => set({ pointSize }),
      setColorMode: (colorMode) => set({ colorMode }),
      setMinTrackLength: (minTrackLength) => set({ minTrackLength }),
      setMaxReprojectionError: (maxReprojectionError) => set({ maxReprojectionError }),
      setSelectedPointId: (selectedPointId) => set({ selectedPointId }),
    }),
    {
      name: STORAGE_KEYS.pointCloud,
      version: 0,
      partialize: (state) => ({
        pointSize: state.pointSize,
        colorMode: state.colorMode,
        minTrackLength: state.minTrackLength,
        maxReprojectionError: state.maxReprojectionError,
      }),
    }
  )
);
