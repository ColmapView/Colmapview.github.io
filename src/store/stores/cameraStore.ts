import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type {
  CameraMode,
  CameraProjection,
  CameraDisplayMode,
  FrustumColorMode,
  SelectionColorMode,
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
  horizonLock: boolean;
  flySpeed: number;
  flyToImageId: number | null;
  pointerLock: boolean;

  // Selection
  selectedImageId: number | null;
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;

  // Image planes (used in 'imageplane' display mode)
  imagePlaneOpacity: number;

  // Actions
  setCameraDisplayMode: (mode: CameraDisplayMode) => void;
  setCameraScale: (scale: number) => void;
  setFrustumColorMode: (mode: FrustumColorMode) => void;
  setUnselectedCameraOpacity: (opacity: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setCameraProjection: (projection: CameraProjection) => void;
  setCameraFov: (fov: number) => void;
  setHorizonLock: (enabled: boolean) => void;
  setFlySpeed: (speed: number) => void;
  setPointerLock: (enabled: boolean) => void;
  flyToImage: (id: number) => void;
  clearFlyTo: () => void;
  setSelectedImageId: (id: number | null) => void;
  toggleSelectedImageId: (id: number) => void;
  setSelectionColorMode: (mode: SelectionColorMode) => void;
  setSelectionColor: (color: string) => void;
  setSelectionAnimationSpeed: (speed: number) => void;
  setImagePlaneOpacity: (opacity: number) => void;
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
      horizonLock: false,
      flySpeed: 2.5,
      flyToImageId: null,
      pointerLock: true,
      selectedImageId: null,
      selectionColorMode: 'rainbow',
      selectionColor: '#00ff00',
      selectionAnimationSpeed: 2,
      imagePlaneOpacity: 0.9,

      setCameraDisplayMode: (cameraDisplayMode) => set({ cameraDisplayMode }),
      setCameraScale: (cameraScale) => set({ cameraScale }),
      setFrustumColorMode: (frustumColorMode) => set({ frustumColorMode }),
      setUnselectedCameraOpacity: (unselectedCameraOpacity) => set({ unselectedCameraOpacity }),
      setCameraMode: (cameraMode) => set({ cameraMode }),
      setCameraProjection: (cameraProjection) => set({ cameraProjection }),
      setCameraFov: (cameraFov) => set({ cameraFov }),
      setHorizonLock: (horizonLock) => set({ horizonLock }),
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
      setImagePlaneOpacity: (imagePlaneOpacity) => set({ imagePlaneOpacity }),
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
        flySpeed: state.flySpeed,
        pointerLock: state.pointerLock,
        selectionColorMode: state.selectionColorMode,
        selectionColor: state.selectionColor,
        selectionAnimationSpeed: state.selectionAnimationSpeed,
        imagePlaneOpacity: state.imagePlaneOpacity,
      }),
    }
  )
);
