import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { MatchesDisplayMode, AxesDisplayMode, AxesCoordinateSystem, AxisLabelMode, ImageLoadMode, GizmoMode } from '../types';

export type ViewDirection = 'reset' | 'x' | 'y' | 'z';

export interface UIState {
  // Modal
  imageDetailId: number | null;
  showPoints2D: boolean;
  showPoints3D: boolean;
  showMatchesInModal: boolean;
  matchedImageId: number | null;

  // Match visualization
  matchesDisplayMode: MatchesDisplayMode;
  matchesOpacity: number;
  matchesColor: string;

  // Mask overlay
  showMaskOverlay: boolean;
  maskOpacity: number;

  // Scene display
  axesDisplayMode: AxesDisplayMode;
  axesCoordinateSystem: AxesCoordinateSystem;
  axesScale: number;
  gridScale: number;
  axisLabelMode: AxisLabelMode;
  backgroundColor: string;
  autoRotate: boolean;
  gizmoMode: GizmoMode;

  // Transient
  viewResetTrigger: number;
  viewDirection: ViewDirection | null;
  viewTrigger: number;
  imageLoadMode: ImageLoadMode;

  // Actions
  openImageDetail: (id: number) => void;
  closeImageDetail: () => void;
  setShowPoints2D: (show: boolean) => void;
  setShowPoints3D: (show: boolean) => void;
  setShowMatchesInModal: (show: boolean) => void;
  setMatchedImageId: (id: number | null) => void;
  setMatchesDisplayMode: (mode: MatchesDisplayMode) => void;
  setMatchesOpacity: (opacity: number) => void;
  setMatchesColor: (color: string) => void;
  setShowMaskOverlay: (show: boolean) => void;
  setMaskOpacity: (opacity: number) => void;
  setAxesDisplayMode: (mode: AxesDisplayMode) => void;
  setAxesCoordinateSystem: (system: AxesCoordinateSystem) => void;
  setAxesScale: (scale: number) => void;
  setGridScale: (scale: number) => void;
  setAxisLabelMode: (mode: AxisLabelMode) => void;
  setBackgroundColor: (color: string) => void;
  setAutoRotate: (autoRotate: boolean) => void;
  setGizmoMode: (mode: GizmoMode) => void;
  resetView: () => void;
  setView: (direction: ViewDirection) => void;
  setImageLoadMode: (mode: ImageLoadMode) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      imageDetailId: null,
      showPoints2D: false,
      showPoints3D: false,
      showMatchesInModal: false,
      matchedImageId: null,
      matchesDisplayMode: 'off',
      matchesOpacity: 0.75,
      matchesColor: '#ff00ff',
      showMaskOverlay: false,
      maskOpacity: 0.7,
      axesDisplayMode: 'both',
      axesCoordinateSystem: 'colmap',
      axesScale: 1,
      gridScale: 1,
      axisLabelMode: 'extra',
      backgroundColor: '#ffffff',
      autoRotate: false,
      gizmoMode: 'off',
      viewResetTrigger: 0,
      viewDirection: null,
      viewTrigger: 0,
      imageLoadMode: 'lazy',

      openImageDetail: (imageDetailId) => set({ imageDetailId, matchedImageId: null }),
      closeImageDetail: () => set({ imageDetailId: null, matchedImageId: null }),
      setShowPoints2D: (showPoints2D) => set({ showPoints2D }),
      setShowPoints3D: (showPoints3D) => set({ showPoints3D }),
      setShowMatchesInModal: (showMatchesInModal) => set({ showMatchesInModal, matchedImageId: null }),
      setMatchedImageId: (matchedImageId) => set({ matchedImageId }),
      setMatchesDisplayMode: (matchesDisplayMode) => set({ matchesDisplayMode }),
      setMatchesOpacity: (matchesOpacity) => set({ matchesOpacity }),
      setMatchesColor: (matchesColor) => set({ matchesColor }),
      setShowMaskOverlay: (showMaskOverlay) => set({ showMaskOverlay }),
      setMaskOpacity: (maskOpacity) => set({ maskOpacity }),
      setAxesDisplayMode: (axesDisplayMode) => set({ axesDisplayMode }),
      setAxesCoordinateSystem: (axesCoordinateSystem) => set({ axesCoordinateSystem }),
      setAxesScale: (axesScale) => set({ axesScale }),
      setGridScale: (gridScale) => set({ gridScale }),
      setAxisLabelMode: (axisLabelMode) => set({ axisLabelMode }),
      setBackgroundColor: (backgroundColor) => set({ backgroundColor }),
      setAutoRotate: (autoRotate) => set({ autoRotate }),
      setGizmoMode: (gizmoMode) => set({ gizmoMode }),
      resetView: () => set((state) => ({ viewResetTrigger: state.viewResetTrigger + 1 })),
      setView: (direction) => set((state) => ({
        viewDirection: direction,
        viewTrigger: state.viewTrigger + 1,
      })),
      setImageLoadMode: (imageLoadMode) => set({ imageLoadMode }),
    }),
    {
      name: STORAGE_KEYS.ui,
      version: 0,
      partialize: (state) => ({
        showPoints2D: state.showPoints2D,
        showPoints3D: state.showPoints3D,
        matchesDisplayMode: state.matchesDisplayMode,
        matchesOpacity: state.matchesOpacity,
        matchesColor: state.matchesColor,
        showMaskOverlay: state.showMaskOverlay,
        maskOpacity: state.maskOpacity,
        axesDisplayMode: state.axesDisplayMode,
        axesCoordinateSystem: state.axesCoordinateSystem,
        axesScale: state.axesScale,
        gridScale: state.gridScale,
        axisLabelMode: state.axisLabelMode,
        backgroundColor: state.backgroundColor,
        autoRotate: state.autoRotate,
        gizmoMode: state.gizmoMode,
        imageLoadMode: state.imageLoadMode,
      }),
    }
  )
);
