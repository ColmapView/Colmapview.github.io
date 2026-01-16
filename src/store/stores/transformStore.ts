import { create } from 'zustand';
import type { Sim3dEuler, TransformPreset } from '../../types/sim3d';
import {
  createIdentityEuler,
  createSim3dFromEuler,
  sim3dToEuler,
  computeCenterAtOrigin,
  computeNormalizeScale,
  transformReconstruction,
} from '../../utils/sim3dTransforms';
import { useReconstructionStore } from '../reconstructionStore';

export interface TransformState {
  transform: Sim3dEuler;

  setTransform: (transform: Partial<Sim3dEuler>) => void;
  resetTransform: () => void;
  applyPreset: (preset: TransformPreset) => void;
  applyToData: () => void;
}

export const useTransformStore = create<TransformState>()((set, get) => ({
  transform: createIdentityEuler(),

  setTransform: (partial) =>
    set((state) => ({
      transform: { ...state.transform, ...partial },
    })),

  resetTransform: () => set({ transform: createIdentityEuler() }),

  applyPreset: (preset) => {
    const reconstruction = useReconstructionStore.getState().reconstruction;
    if (!reconstruction) return;

    if (preset === 'identity') {
      set({ transform: createIdentityEuler() });
      return;
    }

    const sim3d = preset === 'centerAtOrigin'
      ? computeCenterAtOrigin(reconstruction)
      : computeNormalizeScale(reconstruction);
    set({ transform: sim3dToEuler(sim3d) });
  },

  applyToData: () => {
    const { transform } = get();
    const { reconstruction, setReconstruction } = useReconstructionStore.getState();
    if (!reconstruction) return;

    const sim3d = createSim3dFromEuler(transform);
    const transformed = transformReconstruction(sim3d, reconstruction);
    setReconstruction(transformed);
    set({ transform: createIdentityEuler() });
  },
}));
