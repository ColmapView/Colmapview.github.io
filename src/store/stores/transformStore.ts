import { create } from 'zustand';
import type { Sim3dEuler } from '../../types/sim3d.js';
import { createIdentityEuler } from '../../utils/sim3dTransforms.js';

/**
 * Transform Store
 *
 * Manages the current Sim3D transform state for scene manipulation.
 * This store only manages the transform data itself.
 *
 * For cross-store operations (applying presets, applying to data), use the
 * coordinated actions from `src/store/actions`:
 *
 * ```typescript
 * import { applyTransformPreset, applyTransformToData } from '../store/actions';
 *
 * // Apply a preset (coordinates with reconstruction store)
 * applyTransformPreset('centerAtOrigin');
 *
 * // Apply transform to data permanently
 * applyTransformToData();
 * ```
 */
export interface TransformState {
  /** Current transform in Euler angle representation */
  transform: Sim3dEuler;

  /** Set transform (partial update) */
  setTransform: (transform: Partial<Sim3dEuler>) => void;

  /** Reset transform to identity */
  resetTransform: () => void;
}

export const useTransformStore = create<TransformState>()((set) => ({
  transform: createIdentityEuler(),

  setTransform: (partial) =>
    set((state) => ({
      transform: { ...state.transform, ...partial },
    })),

  resetTransform: () => set({ transform: createIdentityEuler() }),
}));
