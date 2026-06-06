import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import { migrateRigPersistedState } from '../persistedStoreMigrations';
import type { RigDisplayMode, RigColorMode } from '../types';

export interface RigState {
  // Display settings
  showRig: boolean;
  rigDisplayMode: RigDisplayMode;
  rigColorMode: RigColorMode;
  rigLineColor: string;
  rigLineOpacity: number;
  rigLineWidth: number;

  // Actions
  setShowRig: (show: boolean) => void;
  toggleRig: () => void;
  setRigDisplayMode: (mode: RigDisplayMode) => void;
  setRigColorMode: (mode: RigColorMode) => void;
  setRigLineColor: (color: string) => void;
  setRigLineOpacity: (opacity: number) => void;
  setRigLineWidth: (lineWidth: number) => void;
}

export const useRigStore = create<RigState>()(
  persist(
    (set) => ({
      showRig: true,
      rigDisplayMode: 'static',
      rigColorMode: 'perFrame',
      rigLineColor: '#00ffff', // Cyan
      rigLineOpacity: 0.7,
      rigLineWidth: 1,

      setShowRig: (showRig) => set({ showRig }),
      toggleRig: () => set((state) => ({ showRig: !state.showRig })),
      setRigDisplayMode: (rigDisplayMode) => set({ rigDisplayMode }),
      setRigColorMode: (rigColorMode) => set({ rigColorMode }),
      setRigLineColor: (rigLineColor) => set({ rigLineColor }),
      setRigLineOpacity: (rigLineOpacity) => set({ rigLineOpacity }),
      setRigLineWidth: (rigLineWidth) => set({ rigLineWidth }),
    }),
    {
      name: STORAGE_KEYS.rig,
      version: 2,
      migrate: migrateRigPersistedState,
      partialize: (state) => ({
        showRig: state.showRig,
        rigDisplayMode: state.rigDisplayMode,
        rigColorMode: state.rigColorMode,
        rigLineColor: state.rigLineColor,
        rigLineOpacity: state.rigLineOpacity,
        rigLineWidth: state.rigLineWidth,
      }),
    }
  )
);
