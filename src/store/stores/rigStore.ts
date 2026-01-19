import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { RigDisplayMode } from '../types';

export interface RigState {
  // Display settings
  rigDisplayMode: RigDisplayMode;
  rigLineColor: string;
  rigLineOpacity: number;

  // Actions
  setRigDisplayMode: (mode: RigDisplayMode) => void;
  setRigLineColor: (color: string) => void;
  setRigLineOpacity: (opacity: number) => void;
}

export const useRigStore = create<RigState>()(
  persist(
    (set) => ({
      rigDisplayMode: 'lines',
      rigLineColor: '#00ffff', // Cyan
      rigLineOpacity: 0.7,

      setRigDisplayMode: (rigDisplayMode) => set({ rigDisplayMode }),
      setRigLineColor: (rigLineColor) => set({ rigLineColor }),
      setRigLineOpacity: (rigLineOpacity) => set({ rigLineOpacity }),
    }),
    {
      name: STORAGE_KEYS.rig,
      version: 0,
      partialize: (state) => ({
        rigDisplayMode: state.rigDisplayMode,
        rigLineColor: state.rigLineColor,
        rigLineOpacity: state.rigLineOpacity,
      }),
    }
  )
);
