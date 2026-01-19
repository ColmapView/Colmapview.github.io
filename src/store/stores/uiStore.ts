import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { MatchesDisplayMode, AxesDisplayMode, AxesCoordinateSystem, AxisLabelMode, ImageLoadMode, GizmoMode } from '../types';

export type ViewDirection = 'reset' | 'x' | 'y' | 'z';

// Context menu action types
export type ContextMenuAction =
  // View
  | 'resetView'
  | 'viewPosX'
  | 'viewPosY'
  | 'viewPosZ'
  | 'toggleFullscreen'
  | 'toggleProjection'
  | 'toggleCameraMode'
  | 'toggleHorizonLock'
  | 'cycleAutoRotate'
  // Display
  | 'toggleBackground'
  | 'toggleAxes'
  | 'toggleGallery'
  | 'cycleAxisLabels'
  | 'cycleCoordinateSystem'
  | 'cycleFrustumColor'
  // Points
  | 'cyclePointColor'
  | 'pointSizeUp'
  | 'pointSizeDown'
  | 'togglePointFiltering'
  // Cameras
  | 'cycleCameraDisplay'
  | 'cycleMatchesDisplay'
  | 'cycleSelectionColor'
  | 'deselectAll'
  | 'flyToSelected'
  | 'toggleImagePlanes'
  | 'toggleUndistort'
  // Transform
  | 'toggleGizmo'
  | 'centerAtOrigin'
  | 'onePointOrigin'
  | 'twoPointScale'
  | 'threePointAlign'
  | 'resetTransform'
  | 'applyTransform'
  | 'reloadData'
  // Export
  | 'takeScreenshot'
  | 'exportPLY'
  | 'exportConfig'
  // Navigation
  | 'togglePointerLock'
  | 'flySpeedUp'
  | 'flySpeedDown'
  // Menu
  | 'editMenu';

// Default context menu actions
export const DEFAULT_CONTEXT_MENU_ACTIONS: ContextMenuAction[] = [
  'resetView',
  'cycleAutoRotate',
  'toggleBackground',
  'toggleAxes',
  'toggleGizmo',
  'onePointOrigin',
  'twoPointScale',
  'threePointAlign',
  'takeScreenshot',
];

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
  gizmoMode: GizmoMode;

  // Layout
  galleryCollapsed: boolean;

  // Context menu (persisted config + transient state)
  contextMenuActions: ContextMenuAction[];
  contextMenuPosition: { x: number; y: number } | null;
  showContextMenuEditor: boolean;

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
  setGizmoMode: (mode: GizmoMode) => void;
  resetView: () => void;
  setView: (direction: ViewDirection) => void;
  setImageLoadMode: (mode: ImageLoadMode) => void;
  setGalleryCollapsed: (collapsed: boolean) => void;
  toggleGalleryCollapsed: () => void;

  // Context menu actions
  openContextMenu: (x: number, y: number) => void;
  closeContextMenu: () => void;
  setContextMenuActions: (actions: ContextMenuAction[]) => void;
  addContextMenuAction: (action: ContextMenuAction) => void;
  removeContextMenuAction: (action: ContextMenuAction) => void;
  openContextMenuEditor: () => void;
  closeContextMenuEditor: () => void;
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
      gizmoMode: 'off',
      galleryCollapsed: false,
      contextMenuActions: DEFAULT_CONTEXT_MENU_ACTIONS,
      contextMenuPosition: null,
      showContextMenuEditor: false,
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
      setGizmoMode: (gizmoMode) => set({ gizmoMode }),
      resetView: () => set((state) => ({ viewResetTrigger: state.viewResetTrigger + 1 })),
      setView: (direction) => set((state) => ({
        viewDirection: direction,
        viewTrigger: state.viewTrigger + 1,
      })),
      setImageLoadMode: (imageLoadMode) => set({ imageLoadMode }),
      setGalleryCollapsed: (galleryCollapsed) => set({ galleryCollapsed }),
      toggleGalleryCollapsed: () => set((state) => ({ galleryCollapsed: !state.galleryCollapsed })),

      // Context menu actions
      openContextMenu: (x, y) => set({ contextMenuPosition: { x, y } }),
      closeContextMenu: () => set({ contextMenuPosition: null }),
      setContextMenuActions: (contextMenuActions) => set({ contextMenuActions }),
      addContextMenuAction: (action) => set((state) => ({
        contextMenuActions: state.contextMenuActions.includes(action)
          ? state.contextMenuActions
          : [...state.contextMenuActions, action],
      })),
      removeContextMenuAction: (action) => set((state) => ({
        contextMenuActions: state.contextMenuActions.filter((a) => a !== action),
      })),
      openContextMenuEditor: () => set({ showContextMenuEditor: true }),
      closeContextMenuEditor: () => set({ showContextMenuEditor: false }),
    }),
    {
      name: STORAGE_KEYS.ui,
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 3) {
          // Reset context menu actions to new defaults (added cycleAutoRotate)
          state.contextMenuActions = DEFAULT_CONTEXT_MENU_ACTIONS;
        }
        return state;
      },
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
        gizmoMode: state.gizmoMode,
        imageLoadMode: state.imageLoadMode,
        galleryCollapsed: state.galleryCollapsed,
        contextMenuActions: state.contextMenuActions,
      }),
    }
  )
);
