import { create } from 'zustand';
import type { Sim3dEuler, TransformPreset } from '../../types/sim3d';
import {
  createIdentityEuler,
  createSim3dFromEuler,
  sim3dToEuler,
  composeSim3d,
  computeCenterAtOrigin,
  computeNormalizeScale,
  transformReconstruction,
  isIdentityEuler,
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
    const { transform } = get();
    const { reconstruction, wasmReconstruction } = useReconstructionStore.getState();
    if (!reconstruction) return;

    if (preset === 'identity') {
      set({ transform: createIdentityEuler() });
      return;
    }

    // Check if there's already a transform applied
    const hasCurrentTransform = !isIdentityEuler(transform);

    if (hasCurrentTransform) {
      // Transform the reconstruction with the current transform first
      // so the preset is computed based on the current scene state
      const currentSim3d = createSim3dFromEuler(transform);
      const transformedReconstruction = transformReconstruction(currentSim3d, reconstruction, wasmReconstruction);

      // Compute the preset based on the transformed state
      const presetSim3d = preset === 'centerAtOrigin'
        ? computeCenterAtOrigin(transformedReconstruction)
        : computeNormalizeScale(transformedReconstruction);

      // Compose: presetSim3d ∘ currentSim3d (apply current first, then preset)
      const combinedSim3d = composeSim3d(presetSim3d, currentSim3d);
      set({ transform: sim3dToEuler(combinedSim3d) });
    } else {
      // No current transform, just apply the preset directly
      const sim3d = preset === 'centerAtOrigin'
        ? computeCenterAtOrigin(reconstruction)
        : computeNormalizeScale(reconstruction);
      set({ transform: sim3dToEuler(sim3d) });
    }
  },

  applyToData: () => {
    const { transform } = get();
    const { reconstruction, wasmReconstruction, setReconstruction, setWasmReconstruction } = useReconstructionStore.getState();
    if (!reconstruction) return;

    const sim3d = createSim3dFromEuler(transform);
    const transformed = transformReconstruction(sim3d, reconstruction, wasmReconstruction);

    // After applying transform, the WASM wrapper is stale (positions changed)
    // Clear it so we don't use outdated data
    if (wasmReconstruction) {
      setWasmReconstruction(null);
    }

    setReconstruction(transformed);
    set({ transform: createIdentityEuler() });
  },
}));
