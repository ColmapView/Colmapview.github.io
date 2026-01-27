import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { MatchesDisplayMode, AxesCoordinateSystem, AxisLabelMode } from '../types';

export type ViewDirection = 'reset' | 'x' | 'y' | 'z' | '-x' | '-y' | '-z';

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
  showMatches: boolean;
  matchesDisplayMode: MatchesDisplayMode;
  matchesOpacity: number;
  matchesColor: string;

  // Mask overlay
  showMaskOverlay: boolean;
  maskOpacity: number;

  // Scene display
  showAxes: boolean;
  showGrid: boolean;
  axesCoordinateSystem: AxesCoordinateSystem;
  axesScale: number;
  gridScale: number;
  axisLabelMode: AxisLabelMode;
  backgroundColor: string;
  showGizmo: boolean;


  // Layout
  galleryCollapsed: boolean;

  // Embed mode (hides gallery panel and button, set from URL parameter)
  embedMode: boolean;

  // Context menu (persisted config + transient state)
  contextMenuActions: ContextMenuAction[];
  contextMenuPosition: { x: number; y: number } | null;
  showContextMenuEditor: boolean;

  // Transient
  viewResetTrigger: number;
  viewDirection: ViewDirection | null;
  viewTrigger: number;

  // Performance monitoring (not persisted)
  fps: number;

  // Actions
  openImageDetail: (id: number) => void;
  closeImageDetail: () => void;
  setShowPoints2D: (show: boolean) => void;
  setShowPoints3D: (show: boolean) => void;
  setShowMatchesInModal: (show: boolean) => void;
  setMatchedImageId: (id: number | null) => void;
  setShowMatches: (show: boolean) => void;
  toggleMatches: () => void;
  setMatchesDisplayMode: (mode: MatchesDisplayMode) => void;
  setMatchesOpacity: (opacity: number) => void;
  setMatchesColor: (color: string) => void;
  setShowMaskOverlay: (show: boolean) => void;
  setMaskOpacity: (opacity: number) => void;
  setShowAxes: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  toggleAxes: () => void;
  toggleGrid: () => void;
  setAxesCoordinateSystem: (system: AxesCoordinateSystem) => void;
  setAxesScale: (scale: number) => void;
  setGridScale: (scale: number) => void;
  setAxisLabelMode: (mode: AxisLabelMode) => void;
  setBackgroundColor: (color: string) => void;
  setShowGizmo: (show: boolean) => void;
  toggleGizmo: () => void;
  resetView: () => void;
  setView: (direction: ViewDirection) => void;
  setGalleryCollapsed: (collapsed: boolean) => void;
  toggleGalleryCollapsed: () => void;
  setEmbedMode: (embed: boolean) => void;

  // Context menu actions
  openContextMenu: (x: number, y: number) => void;
  closeContextMenu: () => void;
  setContextMenuActions: (actions: ContextMenuAction[]) => void;
  addContextMenuAction: (action: ContextMenuAction) => void;
  removeContextMenuAction: (action: ContextMenuAction) => void;
  openContextMenuEditor: () => void;
  closeContextMenuEditor: () => void;

  // Performance monitoring
  setFps: (fps: number) => void;

}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      imageDetailId: null,
      showPoints2D: false,
      showPoints3D: false,
      showMatchesInModal: false,
      matchedImageId: null,
      showMatches: false,
      matchesDisplayMode: 'static',
      matchesOpacity: 0.75,
      matchesColor: '#ff00ff',
      showMaskOverlay: false,
      maskOpacity: 0.7,
      showAxes: true,
      showGrid: true,
      axesCoordinateSystem: 'colmap',
      axesScale: 1,
      gridScale: 1,
      axisLabelMode: 'extra',
      backgroundColor: '#ffffff',
      showGizmo: false,
      galleryCollapsed: false,
      embedMode: false,
      contextMenuActions: DEFAULT_CONTEXT_MENU_ACTIONS,
      contextMenuPosition: null,
      showContextMenuEditor: false,
      viewResetTrigger: 0,
      viewDirection: null,
      viewTrigger: 0,
      fps: 0,

      openImageDetail: (imageDetailId) => set({ imageDetailId, matchedImageId: null }),
      closeImageDetail: () => set({ imageDetailId: null, matchedImageId: null }),
      setShowPoints2D: (showPoints2D) => set({ showPoints2D }),
      setShowPoints3D: (showPoints3D) => set({ showPoints3D }),
      setShowMatchesInModal: (showMatchesInModal) => set({ showMatchesInModal, matchedImageId: null }),
      setMatchedImageId: (matchedImageId) => set({ matchedImageId }),
      setShowMatches: (showMatches) => set({ showMatches }),
      toggleMatches: () => set((state) => ({ showMatches: !state.showMatches })),
      setMatchesDisplayMode: (matchesDisplayMode) => set({ matchesDisplayMode }),
      setMatchesOpacity: (matchesOpacity) => set({ matchesOpacity }),
      setMatchesColor: (matchesColor) => set({ matchesColor }),
      setShowMaskOverlay: (showMaskOverlay) => set({ showMaskOverlay }),
      setMaskOpacity: (maskOpacity) => set({ maskOpacity }),
      setShowAxes: (showAxes) => set({ showAxes }),
      setShowGrid: (showGrid) => set({ showGrid }),
      toggleAxes: () => set((state) => ({ showAxes: !state.showAxes })),
      toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
      setAxesCoordinateSystem: (axesCoordinateSystem) => set({ axesCoordinateSystem }),
      setAxesScale: (axesScale) => set({ axesScale }),
      setGridScale: (gridScale) => set({ gridScale }),
      setAxisLabelMode: (axisLabelMode) => set({ axisLabelMode }),
      setBackgroundColor: (backgroundColor) => set({ backgroundColor }),
      setShowGizmo: (showGizmo) => set({ showGizmo }),
      toggleGizmo: () => set((state) => ({ showGizmo: !state.showGizmo })),
      resetView: () => set((state) => ({ viewResetTrigger: state.viewResetTrigger + 1 })),
      setView: (direction) => set((state) => ({
        viewDirection: direction,
        viewTrigger: state.viewTrigger + 1,
      })),
      setGalleryCollapsed: (galleryCollapsed) => set({ galleryCollapsed }),
      toggleGalleryCollapsed: () => set((state) => ({ galleryCollapsed: !state.galleryCollapsed })),
      setEmbedMode: (embedMode) => set({ embedMode }),

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

      // Performance monitoring
      setFps: (fps) => set({ fps }),

    }),
    {
      name: STORAGE_KEYS.ui,
      version: 9,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 3) {
          // Reset context menu actions to new defaults (added cycleAutoRotate)
          state.contextMenuActions = DEFAULT_CONTEXT_MENU_ACTIONS;
        }
        if (version < 6) {
          // Clean up old parsing-related properties (now always WASM with lazy loading)
          delete state.useWasmParser;
          delete state.liteParserThresholdMB;
          delete state.memoryStrategy;
          delete state.imageLoadMode;
        }
        if (version < 7) {
          // Convert old axesDisplayMode to new booleans
          const mode = state.axesDisplayMode as string | undefined;
          state.showAxes = mode === 'axes' || mode === 'both' || mode === undefined;
          state.showGrid = mode === 'grid' || mode === 'both' || mode === undefined;
          delete state.axesDisplayMode;
        }
        if (version < 8) {
          // Convert old gizmoMode enum to boolean (remove local mode, keep only global)
          const gizmoMode = state.gizmoMode as string | undefined;
          state.showGizmo = gizmoMode === 'local' || gizmoMode === 'global';
          delete state.gizmoMode;
        }
        if (version < 9) {
          // Convert old matchesDisplayMode 'off' to separate showMatches boolean
          const matchesMode = state.matchesDisplayMode as string | undefined;
          if (matchesMode === 'off') {
            state.showMatches = false;
            state.matchesDisplayMode = 'static';
          } else {
            state.showMatches = matchesMode !== undefined;
            // Keep current mode if it's valid
          }
        }
        return state;
      },
      partialize: (state) => ({
        showPoints2D: state.showPoints2D,
        showPoints3D: state.showPoints3D,
        showMatches: state.showMatches,
        matchesDisplayMode: state.matchesDisplayMode,
        matchesOpacity: state.matchesOpacity,
        matchesColor: state.matchesColor,
        showMaskOverlay: state.showMaskOverlay,
        maskOpacity: state.maskOpacity,
        showAxes: state.showAxes,
        showGrid: state.showGrid,
        axesCoordinateSystem: state.axesCoordinateSystem,
        axesScale: state.axesScale,
        gridScale: state.gridScale,
        axisLabelMode: state.axisLabelMode,
        backgroundColor: state.backgroundColor,
        showGizmo: state.showGizmo,
        galleryCollapsed: state.galleryCollapsed,
        contextMenuActions: state.contextMenuActions,
      }),
    }
  )
);
