import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import { mergePointCloudPersistedState } from '../persistedStoreMigrations';
import { isSplatColorMode, type ColorMode } from '../types';

export interface PointCloudState {
  showPointCloud: boolean;
  showSplats: boolean;
  pointSize: number;
  pointOpacity: number;
  colorMode: ColorMode;
  minTrackLength: number;
  maxReprojectionError: number;
  thinning: number;
  selectedPointId: bigint | null;

  setShowPointCloud: (show: boolean) => void;
  setShowSplats: (show: boolean) => void;
  togglePointCloud: () => void;
  toggleSplats: () => void;
  setPointSize: (size: number) => void;
  setPointOpacity: (opacity: number) => void;
  setColorMode: (mode: ColorMode) => void;
  setMinTrackLength: (length: number) => void;
  setMaxReprojectionError: (error: number) => void;
  setThinning: (n: number) => void;
  setSelectedPointId: (id: bigint | null) => void;
}

export const usePointCloudStore = create<PointCloudState>()(
  persist(
    (set) => ({
      showPointCloud: true,
      showSplats: false,
      pointSize: 2,
      pointOpacity: 1,
      colorMode: 'rgb',
      minTrackLength: 2,
      maxReprojectionError: Infinity,
      thinning: 0,
      selectedPointId: null,

      setShowPointCloud: (showPointCloud) => set({ showPointCloud }),
      setShowSplats: (showSplats) => set((state) => {
        let colorMode = state.colorMode;
        if (showSplats) {
          colorMode = 'splats';
        } else if (isSplatColorMode(colorMode)) {
          colorMode = 'rgb';
        }

        return {
          showPointCloud: showSplats ? true : state.showPointCloud,
          showSplats,
          colorMode,
        };
      }),
      togglePointCloud: () => set((state) => ({ showPointCloud: !state.showPointCloud })),
      toggleSplats: () => set((state) => {
        const showSplats = !isSplatColorMode(state.colorMode);
        return {
          showPointCloud: showSplats ? true : state.showPointCloud,
          showSplats,
          colorMode: showSplats ? 'splats' : 'rgb',
        };
      }),
      setPointSize: (pointSize) => set({ pointSize }),
      setPointOpacity: (pointOpacity) => set({ pointOpacity }),
      setColorMode: (colorMode) => set({ colorMode, showSplats: isSplatColorMode(colorMode) }),
      setMinTrackLength: (minTrackLength) => set({ minTrackLength }),
      setMaxReprojectionError: (maxReprojectionError) => set({ maxReprojectionError }),
      setThinning: (thinning) => set({ thinning }),
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
        thinning: state.thinning,
      }),
      merge: mergePointCloudPersistedState,
    }
  )
);
