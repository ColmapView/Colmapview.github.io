import { create } from 'zustand';
import type { Plane } from '../../utils/ransac';

/** Floor plane color display modes */
export type FloorColorMode = 'off' | 'binary' | 'distance';

/** Target axis for floor alignment */
export type FloorTargetAxis = 'X' | 'Y' | 'Z';

export interface FloorPlaneState {
  /** Detected floor plane from RANSAC */
  detectedPlane: Plane | null;
  /** Distance threshold for RANSAC inlier detection */
  distanceThreshold: number;
  /** Maximum RANSAC iterations */
  maxIterations: number;
  /** Maximum points to sample for RANSAC iterations */
  sampleCount: number;
  /** Cached point distances to plane (for coloring) */
  pointDistances: Float32Array | null;
  /** Whether the normal is flipped (like 3-point align) */
  normalFlipped: boolean;
  /** Target axis for alignment (X, Y, Z) */
  targetAxis: FloorTargetAxis;
  /** Color mode for floor visualization */
  floorColorMode: FloorColorMode;
  /** Whether the floor alignment modal is shown */
  showFloorModal: boolean;
  /** Modal position for placement near the widget */
  modalPosition: { x: number; y: number } | null;
  /** Whether detection is currently running */
  isDetecting: boolean;

  // Actions
  setDetectedPlane: (plane: Plane | null) => void;
  setDistanceThreshold: (threshold: number) => void;
  setMaxIterations: (iterations: number) => void;
  setSampleCount: (count: number) => void;
  setPointDistances: (distances: Float32Array | null) => void;
  toggleNormalFlipped: () => void;
  setNormalFlipped: (flipped: boolean) => void;
  cycleTargetAxis: () => void;
  setTargetAxis: (axis: FloorTargetAxis) => void;
  setFloorColorMode: (mode: FloorColorMode) => void;
  setShowFloorModal: (show: boolean) => void;
  setModalPosition: (pos: { x: number; y: number } | null) => void;
  setIsDetecting: (detecting: boolean) => void;
  reset: () => void;
}

const initialState = {
  detectedPlane: null,
  distanceThreshold: 0.05,
  maxIterations: 1000,
  sampleCount: 50000,
  pointDistances: null,
  normalFlipped: false,
  targetAxis: 'Y' as FloorTargetAxis,
  floorColorMode: 'off' as FloorColorMode,
  showFloorModal: false,
  modalPosition: null,
  isDetecting: false,
};

export const useFloorPlaneStore = create<FloorPlaneState>()((set) => ({
  ...initialState,

  setDetectedPlane: (plane) => set({ detectedPlane: plane }),

  setDistanceThreshold: (threshold) => set({ distanceThreshold: threshold }),

  setMaxIterations: (iterations) => set({ maxIterations: iterations }),

  setSampleCount: (count) => set({ sampleCount: count }),

  setPointDistances: (distances) => set({ pointDistances: distances }),

  toggleNormalFlipped: () => set((state) => ({ normalFlipped: !state.normalFlipped })),

  setNormalFlipped: (flipped) => set({ normalFlipped: flipped }),

  cycleTargetAxis: () => set((state) => {
    const axes: FloorTargetAxis[] = ['X', 'Y', 'Z'];
    const currentIndex = axes.indexOf(state.targetAxis);
    const nextIndex = (currentIndex + 1) % axes.length;
    return { targetAxis: axes[nextIndex] };
  }),

  setTargetAxis: (axis) => set({ targetAxis: axis }),

  setFloorColorMode: (mode) => set({ floorColorMode: mode }),

  setShowFloorModal: (show) => set({ showFloorModal: show }),

  setModalPosition: (pos) => set({ modalPosition: pos }),

  setIsDetecting: (detecting) => set({ isDetecting: detecting }),

  reset: () => set(initialState),
}));
