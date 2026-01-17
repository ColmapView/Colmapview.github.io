import { create } from 'zustand';
import * as THREE from 'three';

export type PointPickingMode = 'off' | 'distance-2pt' | 'normal-3pt';

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

  // For distance tool - the target distance input
  targetDistance: number | null;

  // Show distance input modal
  showDistanceModal: boolean;

  // Modal position (screen coordinates)
  modalPosition: ModalPosition | null;

  // Actions
  setPickingMode: (mode: PointPickingMode) => void;
  addSelectedPoint: (point: SelectedPoint, screenPosition?: ModalPosition) => void;
  removeLastPoint: () => void;
  clearSelectedPoints: () => void;
  setTargetDistance: (distance: number | null) => void;
  setShowDistanceModal: (show: boolean) => void;
  reset: () => void;
}

export const usePointPickingStore = create<PointPickingState>()((set, get) => ({
  pickingMode: 'off',
  selectedPoints: [],
  targetDistance: null,
  showDistanceModal: false,
  modalPosition: null,

  setPickingMode: (pickingMode) => set({
    pickingMode,
    selectedPoints: [],
    targetDistance: null,
    showDistanceModal: false,
    modalPosition: null,
  }),

  addSelectedPoint: (point, screenPosition) => {
    const { pickingMode, selectedPoints } = get();
    const maxPoints = pickingMode === 'distance-2pt' ? 2 : pickingMode === 'normal-3pt' ? 3 : 0;

    if (selectedPoints.length >= maxPoints) return;

    const newPoints = [...selectedPoints, point];
    set({ selectedPoints: newPoints });

    // Auto-show distance modal when 2 points are selected for distance tool
    if (pickingMode === 'distance-2pt' && newPoints.length === 2) {
      set({ showDistanceModal: true, modalPosition: screenPosition || null });
    }
  },

  removeLastPoint: () => set((state) => ({
    selectedPoints: state.selectedPoints.slice(0, -1),
    showDistanceModal: false,
    modalPosition: null,
  })),

  clearSelectedPoints: () => set({
    selectedPoints: [],
    targetDistance: null,
    showDistanceModal: false,
    modalPosition: null,
  }),

  setTargetDistance: (targetDistance) => set({ targetDistance }),

  setShowDistanceModal: (showDistanceModal) => set({ showDistanceModal }),

  reset: () => set({
    pickingMode: 'off',
    selectedPoints: [],
    targetDistance: null,
    showDistanceModal: false,
    modalPosition: null,
  }),
}));
