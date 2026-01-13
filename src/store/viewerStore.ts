import { create } from 'zustand';
import type { ColorMode } from '../types/colmap';

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

  setPointSize: (size: number) => void;
  setColorMode: (mode: ColorMode) => void;
  setShowCameras: (show: boolean) => void;
  setCameraScale: (scale: number) => void;
  setSelectedPointId: (id: bigint | null) => void;
  setSelectedImageId: (id: number | null) => void;
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
}

export const useViewerStore = create<ViewerState>((set) => ({
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

  setPointSize: (pointSize) => set({ pointSize }),
  setColorMode: (colorMode) => set({ colorMode }),
  setShowCameras: (showCameras) => set({ showCameras }),
  setCameraScale: (cameraScale) => set({ cameraScale }),
  setSelectedPointId: (selectedPointId) => set({ selectedPointId }),
  setSelectedImageId: (selectedImageId) => set({ selectedImageId }),
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
}));
