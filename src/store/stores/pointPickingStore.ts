import { create } from 'zustand';
import * as THREE from 'three';
import type { AxesCoordinateSystem } from '../types';

export type PointPickingMode = 'off' | 'origin-1pt' | 'distance-2pt' | 'normal-3pt';
export type TargetAxis = 'X' | 'Y' | 'Z';

// Axis cycle order based on coordinate system's "up" axis
// Y-up systems: Y → X → Z
// Z-up systems: Z → Y → X
export function getAxisCycleOrder(coordinateSystem: AxesCoordinateSystem): TargetAxis[] {
  if (coordinateSystem === 'blender' || coordinateSystem === 'unreal') {
    return ['Z', 'Y', 'X'];
  }
  return ['Y', 'X', 'Z'];
}

// Get the default "up" axis for a coordinate system (first in cycle order)
export function getDefaultUpAxis(coordinateSystem: AxesCoordinateSystem): TargetAxis {
  return getAxisCycleOrder(coordinateSystem)[0];
}

export interface SelectedPoint {
  position: THREE.Vector3;
  point3DId: bigint;
}

export interface ModalPosition {
  x: number;
  y: number;
}

export interface PointPickingState {
  // Mode
  pickingMode: PointPickingMode;

  // Selected points (max 3)
  selectedPoints: SelectedPoint[];

  // Hovered point (for highlighting before selection)
  hoveredPoint: THREE.Vector3 | null;

  // For distance tool - the target distance input
  targetDistance: number | null;

  // Show distance input modal
  showDistanceModal: boolean;

  // Modal position (screen coordinates)
  modalPosition: ModalPosition | null;

  // For 3-point mode - flip normal direction
  normalFlipped: boolean;

  // For 3-point mode - target axis (X, Y, or Z)
  targetAxis: TargetAxis;

  // Flag to prevent double-handling of right-click (Three.js + DOM events)
  markerRightClickHandled: boolean;

  // Actions
  setPickingMode: (mode: PointPickingMode) => void;
  addSelectedPoint: (point: SelectedPoint, screenPosition?: ModalPosition) => void;
  removePointAt: (index: number) => void;
  removeLastPoint: () => void;
  clearSelectedPoints: () => void;
  setHoveredPoint: (position: THREE.Vector3 | null) => void;
  setTargetDistance: (distance: number | null) => void;
  setShowDistanceModal: (show: boolean) => void;
  toggleNormalFlipped: () => void;
  cycleTargetAxis: (coordinateSystem: AxesCoordinateSystem) => void;
  setTargetAxis: (axis: TargetAxis) => void;
  reset: () => void;
}

export const usePointPickingStore = create<PointPickingState>()((set, get) => ({
  pickingMode: 'off',
  selectedPoints: [],
  hoveredPoint: null,
  targetDistance: null,
  showDistanceModal: false,
  modalPosition: null,
  normalFlipped: false,
  targetAxis: 'Y' as TargetAxis,
  markerRightClickHandled: false,

  setPickingMode: (pickingMode) => set({
    pickingMode,
    selectedPoints: [],
    hoveredPoint: null,
    targetDistance: null,
    showDistanceModal: false,
    modalPosition: null,
    normalFlipped: false,
    targetAxis: 'Y' as TargetAxis,
    markerRightClickHandled: false,
  }),

  addSelectedPoint: (point, screenPosition) => {
    const { pickingMode, selectedPoints } = get();
    const maxPoints = pickingMode === 'origin-1pt' ? 1 : pickingMode === 'distance-2pt' ? 2 : pickingMode === 'normal-3pt' ? 3 : 0;

    if (selectedPoints.length >= maxPoints) return;

    const newPoints = [...selectedPoints, point];
    const isComplete = newPoints.length >= maxPoints;

    // Batch all state updates into a single set call to avoid multiple re-renders
    set({
      selectedPoints: newPoints,
      ...(isComplete && {
        showDistanceModal: true,
        modalPosition: screenPosition || null,
      }),
    });
  },

  removePointAt: (index) => set((state) => ({
    selectedPoints: state.selectedPoints.filter((_, i) => i !== index),
    showDistanceModal: false,
    modalPosition: null,
    markerRightClickHandled: true, // Flag to prevent Scene3D from also removing a point
  })),

  removeLastPoint: () => set((state) => ({
    selectedPoints: state.selectedPoints.slice(0, -1),
    showDistanceModal: false,
    modalPosition: null,
  })),

  clearSelectedPoints: () => set({
    selectedPoints: [],
    hoveredPoint: null,
    targetDistance: null,
    showDistanceModal: false,
    modalPosition: null,
    normalFlipped: false,
    targetAxis: 'Y' as TargetAxis,
  }),

  setHoveredPoint: (hoveredPoint) => set({ hoveredPoint }),

  setTargetDistance: (targetDistance) => set({ targetDistance }),

  setShowDistanceModal: (showDistanceModal) => set({ showDistanceModal }),

  toggleNormalFlipped: () => set((state) => ({ normalFlipped: !state.normalFlipped })),

  cycleTargetAxis: (coordinateSystem: AxesCoordinateSystem) => set((state) => {
    const axes = getAxisCycleOrder(coordinateSystem);
    const currentIndex = axes.indexOf(state.targetAxis);
    // If current axis not in cycle order (shouldn't happen), start from beginning
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % 3;
    return { targetAxis: axes[nextIndex], markerRightClickHandled: true };
  }),

  setTargetAxis: (axis) => set({ targetAxis: axis }),

  reset: () => set({
    pickingMode: 'off',
    selectedPoints: [],
    hoveredPoint: null,
    targetDistance: null,
    showDistanceModal: false,
    modalPosition: null,
    normalFlipped: false,
    targetAxis: 'Y' as TargetAxis,
    markerRightClickHandled: false,
  }),
}));
