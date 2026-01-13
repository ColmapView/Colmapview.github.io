import { create } from 'zustand';
import type { ColorMode } from '../types/colmap';

interface ViewerState {
  // Point cloud settings
  pointSize: number;
  colorMode: ColorMode;

  // Camera frustum settings
  showCameras: boolean;
  cameraScale: number;

  // Selection state
  selectedPointId: bigint | null;
  selectedImageId: number | null;

  // View state
  autoRotate: boolean;
  backgroundColor: string;
  viewResetTrigger: number;

  // Filtering
  minTrackLength: number;

  // Helpers
  showAxes: boolean;
  axesOpacity: number;
  showImagePlanes: boolean;
  imagePlaneOpacity: number;
  showMatches: boolean;
  matchesOpacity: number;

  // Image detail modal
  imageDetailId: number | null;
  showPoints2D: boolean;
  showPoints3D: boolean;
  showMatchesInModal: boolean;
  matchedImageId: number | null;

  // Fly to camera view
  flyToImageId: number | null;

  // Actions
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
  // Default values
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
  showAxes: true,
  axesOpacity: 1,
  showImagePlanes: false,
  imagePlaneOpacity: 0.9,
  showMatches: false,
  matchesOpacity: 1,
  imageDetailId: null,
  showPoints2D: false,
  showPoints3D: false,
  showMatchesInModal: false,
  matchedImageId: null,
  flyToImageId: null,

  // Actions
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
  openImageDetail: (imageDetailId) => set({ imageDetailId, matchedImageId: null }),
  closeImageDetail: () => set({ imageDetailId: null, matchedImageId: null }),
  setShowPoints2D: (showPoints2D) => set({ showPoints2D }),
  setShowPoints3D: (showPoints3D) => set({ showPoints3D }),
  setShowMatchesInModal: (showMatchesInModal) => set({ showMatchesInModal, matchedImageId: showMatchesInModal ? null : null }),
  setMatchedImageId: (matchedImageId) => set({ matchedImageId }),
  resetView: () => set((state) => ({ viewResetTrigger: state.viewResetTrigger + 1 })),
  flyToImage: (flyToImageId) => set({ flyToImageId }),
  clearFlyTo: () => set({ flyToImageId: null }),
}));
