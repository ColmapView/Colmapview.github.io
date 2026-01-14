import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ColorMode } from '../types/colmap';

export type CameraMode = 'orbit' | 'fly';

interface ViewerState {
  pointSize: number;
  colorMode: ColorMode;
  showCameras: boolean;
  cameraScale: number;
  selectedPointId: bigint | null;
  selectedImageId: number | null;
  autoRotate: boolean;
  backgroundColor: string;
  viewResetTrigger: number;
  minTrackLength: number;
  showAxes: boolean;
  axesOpacity: number;
  showImagePlanes: boolean;
  imagePlaneOpacity: number;
  showMatches: boolean;
  matchesOpacity: number;
  rainbowMode: boolean;
  rainbowSpeed: number;
  imageDetailId: number | null;
  showPoints2D: boolean;
  showPoints3D: boolean;
  showMatchesInModal: boolean;
  matchedImageId: number | null;
  flyToImageId: number | null;
  showMaskOverlay: boolean;
  maskOpacity: number;
  cameraMode: CameraMode;
  flySpeed: number;

  setPointSize: (size: number) => void;
  setColorMode: (mode: ColorMode) => void;
  setShowCameras: (show: boolean) => void;
  setCameraScale: (scale: number) => void;
  setSelectedPointId: (id: bigint | null) => void;
  setSelectedImageId: (id: number | null) => void;
  toggleSelectedImageId: (id: number) => void;
  setAutoRotate: (autoRotate: boolean) => void;
  setBackgroundColor: (color: string) => void;
  setMinTrackLength: (length: number) => void;
  setShowAxes: (show: boolean) => void;
  setAxesOpacity: (opacity: number) => void;
  setShowImagePlanes: (show: boolean) => void;
  setImagePlaneOpacity: (opacity: number) => void;
  setShowMatches: (show: boolean) => void;
  setMatchesOpacity: (opacity: number) => void;
  setRainbowMode: (enabled: boolean) => void;
  setRainbowSpeed: (speed: number) => void;
  openImageDetail: (id: number) => void;
  closeImageDetail: () => void;
  setShowPoints2D: (show: boolean) => void;
  setShowPoints3D: (show: boolean) => void;
  setShowMatchesInModal: (show: boolean) => void;
  setMatchedImageId: (id: number | null) => void;
  resetView: () => void;
  flyToImage: (id: number) => void;
  clearFlyTo: () => void;
  setShowMaskOverlay: (show: boolean) => void;
  setMaskOpacity: (opacity: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  setFlySpeed: (speed: number) => void;
}

export const useViewerStore = create<ViewerState>()(
  persist(
    (set) => ({
      pointSize: 2,
      colorMode: 'rgb',
      showCameras: true,
      cameraScale: 0.2,
      selectedPointId: null,
      selectedImageId: null,
      autoRotate: false,
      backgroundColor: '#ffffff',
      viewResetTrigger: 0,
      minTrackLength: 2,
      showAxes: false,
      axesOpacity: 1,
      showImagePlanes: false,
      imagePlaneOpacity: 0.9,
      showMatches: false,
      matchesOpacity: 1,
      rainbowMode: true,
      rainbowSpeed: 2.5,
      imageDetailId: null,
      showPoints2D: false,
      showPoints3D: false,
      showMatchesInModal: false,
      matchedImageId: null,
      flyToImageId: null,
      showMaskOverlay: false,
      maskOpacity: 0.7,
      cameraMode: 'orbit',
      flySpeed: 1,

      setPointSize: (pointSize) => set({ pointSize }),
      setColorMode: (colorMode) => set({ colorMode }),
      setShowCameras: (showCameras) => set({ showCameras }),
      setCameraScale: (cameraScale) => set({ cameraScale }),
      setSelectedPointId: (selectedPointId) => set({ selectedPointId }),
      setSelectedImageId: (selectedImageId) => set({ selectedImageId }),
      toggleSelectedImageId: (id) => set((state) => ({
        selectedImageId: state.selectedImageId === id ? null : id
      })),
      setAutoRotate: (autoRotate) => set({ autoRotate }),
      setBackgroundColor: (backgroundColor) => set({ backgroundColor }),
      setMinTrackLength: (minTrackLength) => set({ minTrackLength }),
      setShowAxes: (showAxes) => set({ showAxes }),
      setAxesOpacity: (axesOpacity) => set({ axesOpacity }),
      setShowImagePlanes: (showImagePlanes) => set({ showImagePlanes }),
      setImagePlaneOpacity: (imagePlaneOpacity) => set({ imagePlaneOpacity }),
      setShowMatches: (showMatches) => set({ showMatches }),
      setMatchesOpacity: (matchesOpacity) => set({ matchesOpacity }),
      setRainbowMode: (rainbowMode) => set({ rainbowMode }),
      setRainbowSpeed: (rainbowSpeed) => set({ rainbowSpeed }),
      openImageDetail: (imageDetailId) => set({ imageDetailId, matchedImageId: null }),
      closeImageDetail: () => set({ imageDetailId: null, matchedImageId: null }),
      setShowPoints2D: (showPoints2D) => set({ showPoints2D }),
      setShowPoints3D: (showPoints3D) => set({ showPoints3D }),
      setShowMatchesInModal: (showMatchesInModal) => set({ showMatchesInModal, matchedImageId: null }),
      setMatchedImageId: (matchedImageId) => set({ matchedImageId }),
      resetView: () => set((state) => ({ viewResetTrigger: state.viewResetTrigger + 1 })),
      flyToImage: (flyToImageId) => set({ flyToImageId }),
      clearFlyTo: () => set({ flyToImageId: null }),
      setShowMaskOverlay: (showMaskOverlay) => set({ showMaskOverlay }),
      setMaskOpacity: (maskOpacity) => set({ maskOpacity }),
      setCameraMode: (cameraMode) => set({ cameraMode }),
      setFlySpeed: (flySpeed) => set({ flySpeed }),
    }),
    {
      name: 'colmap-viewer-settings',
      partialize: (state) => ({
        // Only persist user preferences, not transient UI state
        pointSize: state.pointSize,
        colorMode: state.colorMode,
        showCameras: state.showCameras,
        cameraScale: state.cameraScale,
        autoRotate: state.autoRotate,
        backgroundColor: state.backgroundColor,
        minTrackLength: state.minTrackLength,
        showAxes: state.showAxes,
        axesOpacity: state.axesOpacity,
        showImagePlanes: state.showImagePlanes,
        imagePlaneOpacity: state.imagePlaneOpacity,
        showMatches: state.showMatches,
        matchesOpacity: state.matchesOpacity,
        rainbowMode: state.rainbowMode,
        rainbowSpeed: state.rainbowSpeed,
        showPoints2D: state.showPoints2D,
        showPoints3D: state.showPoints3D,
        showMaskOverlay: state.showMaskOverlay,
        maskOpacity: state.maskOpacity,
        cameraMode: state.cameraMode,
        flySpeed: state.flySpeed,
      }),
    }
  )
);
