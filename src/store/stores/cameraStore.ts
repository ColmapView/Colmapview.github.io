import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type {
  CameraMode,
  CameraProjection,
  CameraDisplayMode,
  FrustumColorMode,
  SelectionColorMode,
  AutoRotateMode,
  HorizonLockMode,
  UndistortionMode,
} from '../types';

export interface CameraState {
  // Display
  cameraDisplayMode: CameraDisplayMode;
  cameraScale: number;
  frustumColorMode: FrustumColorMode;
  unselectedCameraOpacity: number;

  // Navigation
  cameraMode: CameraMode;
  cameraProjection: CameraProjection;
  cameraFov: number;
  horizonLock: HorizonLockMode;
  autoRotateMode: AutoRotateMode;
  autoRotateSpeed: number;
  flySpeed: number;
  flyToImageId: number | null;
  pointerLock: boolean;

  // Selection
  selectedImageId: number | null;
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;

  // Selection planes (opacity of selected camera's image plane)
  selectionPlaneOpacity: number;

  // Undistortion
  undistortionEnabled: boolean;
  undistortionMode: UndistortionMode;

  // Actions
  setCameraDisplayMode: (mode: CameraDisplayMode) => void;
  setCameraScale: (scale: number) => void;
  setFrustumColorMode: (mode: FrustumColorMode) => void;
  setUnselectedCameraOpacity: (opacity: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setCameraProjection: (projection: CameraProjection) => void;
  setCameraFov: (fov: number) => void;
  setHorizonLock: (mode: HorizonLockMode) => void;
  setAutoRotateMode: (mode: AutoRotateMode) => void;
  setAutoRotateSpeed: (speed: number) => void;
  setFlySpeed: (speed: number) => void;
  setPointerLock: (enabled: boolean) => void;
  flyToImage: (id: number) => void;
  clearFlyTo: () => void;
  setSelectedImageId: (id: number | null) => void;
  toggleSelectedImageId: (id: number) => void;
  setSelectionColorMode: (mode: SelectionColorMode) => void;
  setSelectionColor: (color: string) => void;
  setSelectionAnimationSpeed: (speed: number) => void;
  setSelectionPlaneOpacity: (opacity: number) => void;
  setUndistortionEnabled: (enabled: boolean) => void;
  setUndistortionMode: (mode: UndistortionMode) => void;
}

export const useCameraStore = create<CameraState>()(
  persist(
    (set) => ({
      cameraDisplayMode: 'frustum',
      cameraScale: 0.25,
      frustumColorMode: 'byCamera',
      unselectedCameraOpacity: 0.5,
      cameraMode: 'orbit',
      cameraProjection: 'perspective',
      cameraFov: 60,
      horizonLock: 'off',
      autoRotateMode: 'off',
      autoRotateSpeed: 0.5,
      flySpeed: 2.5,
      flyToImageId: null,
      pointerLock: true,
      selectedImageId: null,
      selectionColorMode: 'rainbow',
      selectionColor: '#00ff00',
      selectionAnimationSpeed: 2,
      selectionPlaneOpacity: 1.0,
      undistortionEnabled: false,
      undistortionMode: 'fullFrame',

      setCameraDisplayMode: (cameraDisplayMode) => set({ cameraDisplayMode }),
      setCameraScale: (cameraScale) => set({ cameraScale }),
      setFrustumColorMode: (frustumColorMode) => set({ frustumColorMode }),
      setUnselectedCameraOpacity: (unselectedCameraOpacity) => set({ unselectedCameraOpacity }),
      setCameraMode: (cameraMode) => set({ cameraMode }),
      setCameraProjection: (cameraProjection) => set({ cameraProjection }),
      setCameraFov: (cameraFov) => set({ cameraFov }),
      setHorizonLock: (horizonLock) => set({ horizonLock }),
      setAutoRotateMode: (autoRotateMode) => set({ autoRotateMode }),
      setAutoRotateSpeed: (autoRotateSpeed) => set({ autoRotateSpeed }),
      setFlySpeed: (flySpeed) => set({ flySpeed }),
      setPointerLock: (pointerLock) => set({ pointerLock }),
      flyToImage: (flyToImageId) => set({ flyToImageId }),
      clearFlyTo: () => set({ flyToImageId: null }),
      setSelectedImageId: (selectedImageId) => set({ selectedImageId }),
      toggleSelectedImageId: (id) =>
        set((state) => ({
          selectedImageId: state.selectedImageId === id ? null : id,
        })),
      setSelectionColorMode: (selectionColorMode) => set({ selectionColorMode }),
      setSelectionColor: (selectionColor) => set({ selectionColor }),
      setSelectionAnimationSpeed: (selectionAnimationSpeed) => set({ selectionAnimationSpeed }),
      setSelectionPlaneOpacity: (selectionPlaneOpacity) => set({ selectionPlaneOpacity }),
      setUndistortionEnabled: (undistortionEnabled) => set({ undistortionEnabled }),
      setUndistortionMode: (undistortionMode) => set({ undistortionMode }),
    }),
    {
      name: STORAGE_KEYS.camera,
      version: 0,
      partialize: (state) => ({
        cameraDisplayMode: state.cameraDisplayMode,
        cameraScale: state.cameraScale,
        frustumColorMode: state.frustumColorMode,
        unselectedCameraOpacity: state.unselectedCameraOpacity,
        cameraMode: state.cameraMode,
        cameraProjection: state.cameraProjection,
        cameraFov: state.cameraFov,
        horizonLock: state.horizonLock,
        autoRotateMode: state.autoRotateMode,
        autoRotateSpeed: state.autoRotateSpeed,
        flySpeed: state.flySpeed,
        pointerLock: state.pointerLock,
        selectionColorMode: state.selectionColorMode,
        selectionColor: state.selectionColor,
        selectionAnimationSpeed: state.selectionAnimationSpeed,
        selectionPlaneOpacity: state.selectionPlaneOpacity,
        undistortionEnabled: state.undistortionEnabled,
        undistortionMode: state.undistortionMode,
      }),
    }
  )
);
