import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type {
  CameraMode,
  CameraProjection,
  CameraDisplayMode,
  FrustumColorMode,
  CameraScaleFactor,
  SelectionColorMode,
  AutoRotateMode,
  HorizonLockMode,
  UndistortionMode,
  CameraViewState,
  NavigationHistoryEntry,
} from '../types';

export interface CameraState {
  // Display
  showCameras: boolean;
  cameraDisplayMode: CameraDisplayMode;
  cameraScaleFactor: CameraScaleFactor;
  cameraScale: number;
  frustumColorMode: FrustumColorMode;
  frustumSingleColor: string;
  frustumStandbyOpacity: number;
  unselectedCameraOpacity: number;

  // Navigation
  cameraMode: CameraMode;
  cameraProjection: CameraProjection;
  cameraFov: number;
  horizonLock: HorizonLockMode;
  autoRotateMode: AutoRotateMode;
  autoRotateSpeed: number;
  flySpeed: number;
  flyTransitionDuration: number;
  flyToImageId: number | null;
  pointerLock: boolean;

  // Selection
  selectedImageId: number | null;
  showSelectionHighlight: boolean;
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;

  // Selection planes (opacity of selected camera's image plane)
  selectionPlaneOpacity: number;

  // Undistortion
  undistortionEnabled: boolean;
  undistortionMode: UndistortionMode;

  // Auto FOV adjustment when flying to cameras
  autoFovEnabled: boolean;

  // Navigation history (not persisted)
  navigationHistory: NavigationHistoryEntry[];
  flyToViewState: CameraViewState | null;

  // Current view state (for sharing URL outside R3F context)
  currentViewState: CameraViewState | null;

  // Actions
  setShowCameras: (show: boolean) => void;
  toggleCameras: () => void;
  setCameraDisplayMode: (mode: CameraDisplayMode) => void;
  setCameraScaleFactor: (factor: CameraScaleFactor) => void;
  setCameraScale: (scale: number) => void;
  setFrustumColorMode: (mode: FrustumColorMode) => void;
  setFrustumSingleColor: (color: string) => void;
  setFrustumStandbyOpacity: (opacity: number) => void;
  setUnselectedCameraOpacity: (opacity: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setCameraProjection: (projection: CameraProjection) => void;
  setCameraFov: (fov: number) => void;
  setHorizonLock: (mode: HorizonLockMode) => void;
  setAutoRotateMode: (mode: AutoRotateMode) => void;
  setAutoRotateSpeed: (speed: number) => void;
  setFlySpeed: (speed: number) => void;
  setFlyTransitionDuration: (duration: number) => void;
  setPointerLock: (enabled: boolean) => void;
  flyToImage: (id: number) => void;
  clearFlyTo: () => void;
  setSelectedImageId: (id: number | null) => void;
  toggleSelectedImageId: (id: number) => void;
  setShowSelectionHighlight: (show: boolean) => void;
  toggleSelectionHighlight: () => void;
  setSelectionColorMode: (mode: SelectionColorMode) => void;
  setSelectionColor: (color: string) => void;
  setSelectionAnimationSpeed: (speed: number) => void;
  setSelectionPlaneOpacity: (opacity: number) => void;
  setUndistortionEnabled: (enabled: boolean) => void;
  setUndistortionMode: (mode: UndistortionMode) => void;
  setAutoFovEnabled: (enabled: boolean) => void;

  // Navigation history actions
  pushNavigationHistory: (entry: NavigationHistoryEntry) => void;
  popNavigationHistory: () => NavigationHistoryEntry | undefined;
  peekNavigationHistory: () => NavigationHistoryEntry | undefined;
  clearNavigationHistory: () => void;
  flyToState: (state: CameraViewState) => void;
  clearFlyToViewState: () => void;
  setCurrentViewState: (state: CameraViewState) => void;
}

export const useCameraStore = create<CameraState>()(
  persist(
    (set, get) => ({
      showCameras: true,
      cameraDisplayMode: 'frustum',
      cameraScaleFactor: '1',
      cameraScale: 0.25,
      frustumColorMode: 'byCamera',
      frustumSingleColor: '#ff0000',
      frustumStandbyOpacity: 0.9,
      unselectedCameraOpacity: 0.5,
      cameraMode: 'orbit',
      cameraProjection: 'perspective',
      cameraFov: 60,
      horizonLock: 'off',
      autoRotateMode: 'off',
      autoRotateSpeed: 0.5,
      flySpeed: 2.5,
      flyTransitionDuration: 600,
      flyToImageId: null,
      pointerLock: true,
      selectedImageId: null,
      showSelectionHighlight: true,
      selectionColorMode: 'rainbow',
      selectionColor: '#00ff00',
      selectionAnimationSpeed: 2,
      selectionPlaneOpacity: 1.0,
      undistortionEnabled: false,
      undistortionMode: 'fullFrame',
      autoFovEnabled: true,
      navigationHistory: [],
      flyToViewState: null,
      currentViewState: null,

      setShowCameras: (showCameras) => set({ showCameras }),
      toggleCameras: () => set((state) => ({ showCameras: !state.showCameras })),
      setCameraDisplayMode: (cameraDisplayMode) => set({ cameraDisplayMode }),
      setCameraScaleFactor: (cameraScaleFactor) => set({ cameraScaleFactor }),
      setCameraScale: (cameraScale) => set({ cameraScale }),
      setFrustumColorMode: (frustumColorMode) => set({ frustumColorMode }),
      setFrustumSingleColor: (frustumSingleColor) => set({ frustumSingleColor }),
      setFrustumStandbyOpacity: (frustumStandbyOpacity) => set({ frustumStandbyOpacity }),
      setUnselectedCameraOpacity: (unselectedCameraOpacity) => set({ unselectedCameraOpacity }),
      setCameraMode: (cameraMode) => set({ cameraMode }),
      setCameraProjection: (cameraProjection) => set({ cameraProjection }),
      setCameraFov: (cameraFov) => set({ cameraFov }),
      setHorizonLock: (horizonLock) => set({ horizonLock }),
      setAutoRotateMode: (autoRotateMode) => set({ autoRotateMode }),
      setAutoRotateSpeed: (autoRotateSpeed) => set({ autoRotateSpeed }),
      setFlySpeed: (flySpeed) => set({ flySpeed }),
      setFlyTransitionDuration: (flyTransitionDuration) => set({ flyTransitionDuration }),
      setPointerLock: (pointerLock) => set({ pointerLock }),
      flyToImage: (flyToImageId) => set({ flyToImageId }),
      clearFlyTo: () => set({ flyToImageId: null }),
      setSelectedImageId: (selectedImageId) => set({ selectedImageId }),
      toggleSelectedImageId: (id) =>
        set((state) => ({
          selectedImageId: state.selectedImageId === id ? null : id,
        })),
      setShowSelectionHighlight: (showSelectionHighlight) => set({ showSelectionHighlight }),
      toggleSelectionHighlight: () => set((state) => ({ showSelectionHighlight: !state.showSelectionHighlight })),
      setSelectionColorMode: (selectionColorMode) => set({ selectionColorMode }),
      setSelectionColor: (selectionColor) => set({ selectionColor }),
      setSelectionAnimationSpeed: (selectionAnimationSpeed) => set({ selectionAnimationSpeed }),
      setSelectionPlaneOpacity: (selectionPlaneOpacity) => set({ selectionPlaneOpacity }),
      setUndistortionEnabled: (undistortionEnabled) => set({ undistortionEnabled }),
      setUndistortionMode: (undistortionMode) => set({ undistortionMode }),
      setAutoFovEnabled: (autoFovEnabled) => set({ autoFovEnabled }),

      // Navigation history actions
      pushNavigationHistory: (entry) =>
        set((state) => ({
          navigationHistory: [...state.navigationHistory, entry].slice(-50), // Limit to 50 entries
        })),
      popNavigationHistory: () => {
        const state = get();
        if (state.navigationHistory.length === 0) {
          return undefined;
        }
        const popped = state.navigationHistory[state.navigationHistory.length - 1];
        set({ navigationHistory: state.navigationHistory.slice(0, -1) });
        return popped;
      },
      peekNavigationHistory: () => {
        const state = get();
        return state.navigationHistory.length > 0
          ? state.navigationHistory[state.navigationHistory.length - 1]
          : undefined;
      },
      clearNavigationHistory: () => set({ navigationHistory: [] }),
      flyToState: (flyToViewState: CameraViewState) => set({ flyToViewState }),
      clearFlyToViewState: () => set({ flyToViewState: null }),
      setCurrentViewState: (currentViewState: CameraViewState) => set({ currentViewState }),
    }),
    {
      name: STORAGE_KEYS.camera,
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 1) {
          // Convert old 'off' display mode to showCameras boolean
          if (state.cameraDisplayMode === 'off') {
            state.showCameras = false;
            state.cameraDisplayMode = 'frustum';
          } else {
            state.showCameras = true;
          }
        }
        if (version < 2) {
          // Convert old 'off' selection color mode to showSelectionHighlight boolean
          if (state.selectionColorMode === 'off') {
            state.showSelectionHighlight = false;
            state.selectionColorMode = 'rainbow';
          } else {
            state.showSelectionHighlight = true;
          }
        }
        return state;
      },
      partialize: (state) => ({
        showCameras: state.showCameras,
        cameraDisplayMode: state.cameraDisplayMode,
        cameraScaleFactor: state.cameraScaleFactor,
        cameraScale: state.cameraScale,
        frustumColorMode: state.frustumColorMode,
        frustumSingleColor: state.frustumSingleColor,
        frustumStandbyOpacity: state.frustumStandbyOpacity,
        unselectedCameraOpacity: state.unselectedCameraOpacity,
        cameraMode: state.cameraMode,
        cameraProjection: state.cameraProjection,
        cameraFov: state.cameraFov,
        horizonLock: state.horizonLock,
        autoRotateMode: state.autoRotateMode,
        autoRotateSpeed: state.autoRotateSpeed,
        flySpeed: state.flySpeed,
        flyTransitionDuration: state.flyTransitionDuration,
        pointerLock: state.pointerLock,
        showSelectionHighlight: state.showSelectionHighlight,
        selectionColorMode: state.selectionColorMode,
        selectionColor: state.selectionColor,
        selectionAnimationSpeed: state.selectionAnimationSpeed,
        selectionPlaneOpacity: state.selectionPlaneOpacity,
        undistortionEnabled: state.undistortionEnabled,
        undistortionMode: state.undistortionMode,
        autoFovEnabled: state.autoFovEnabled,
      }),
    }
  )
);
