import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { RigDisplayMode, RigColorMode } from '../types';

export interface RigState {
  // Display settings
  rigDisplayMode: RigDisplayMode;
  rigColorMode: RigColorMode;
  rigLineColor: string;
  rigLineOpacity: number;

  // Actions
  setRigDisplayMode: (mode: RigDisplayMode) => void;
  setRigColorMode: (mode: RigColorMode) => void;
  setRigLineColor: (color: string) => void;
  setRigLineOpacity: (opacity: number) => void;
}

export const useRigStore = create<RigState>()(
  persist(
    (set) => ({
      rigDisplayMode: 'lines',
      rigColorMode: 'single',
      rigLineColor: '#00ffff', // Cyan
      rigLineOpacity: 0.7,

      setRigDisplayMode: (rigDisplayMode) => set({ rigDisplayMode }),
      setRigColorMode: (rigColorMode) => set({ rigColorMode }),
      setRigLineColor: (rigLineColor) => set({ rigLineColor }),
      setRigLineOpacity: (rigLineOpacity) => set({ rigLineOpacity }),
    }),
    {
      name: STORAGE_KEYS.rig,
      version: 0,
      partialize: (state) => ({
        rigDisplayMode: state.rigDisplayMode,
        rigColorMode: state.rigColorMode,
        rigLineColor: state.rigLineColor,
        rigLineOpacity: state.rigLineOpacity,
      }),
    }
  )
);
