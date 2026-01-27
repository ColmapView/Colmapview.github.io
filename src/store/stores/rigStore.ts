import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { RigDisplayMode, RigColorMode } from '../types';

export interface RigState {
  // Display settings
  showRig: boolean;
  rigDisplayMode: RigDisplayMode;
  rigColorMode: RigColorMode;
  rigLineColor: string;
  rigLineOpacity: number;

  // Actions
  setShowRig: (show: boolean) => void;
  toggleRig: () => void;
  setRigDisplayMode: (mode: RigDisplayMode) => void;
  setRigColorMode: (mode: RigColorMode) => void;
  setRigLineColor: (color: string) => void;
  setRigLineOpacity: (opacity: number) => void;
}

export const useRigStore = create<RigState>()(
  persist(
    (set) => ({
      showRig: true,
      rigDisplayMode: 'static',
      rigColorMode: 'perFrame',
      rigLineColor: '#00ffff', // Cyan
      rigLineOpacity: 0.7,

      setShowRig: (showRig) => set({ showRig }),
      toggleRig: () => set((state) => ({ showRig: !state.showRig })),
      setRigDisplayMode: (rigDisplayMode) => set({ rigDisplayMode }),
      setRigColorMode: (rigColorMode) => set({ rigColorMode }),
      setRigLineColor: (rigLineColor) => set({ rigLineColor }),
      setRigLineOpacity: (rigLineOpacity) => set({ rigLineOpacity }),
    }),
    {
      name: STORAGE_KEYS.rig,
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 1) {
          // Convert old rigDisplayMode 'off' to separate showRig boolean
          const mode = state.rigDisplayMode as string | undefined;
          if (mode === 'off') {
            state.showRig = false;
            state.rigDisplayMode = 'static';
          } else {
            state.showRig = true;
          }
        }
        return state;
      },
      partialize: (state) => ({
        showRig: state.showRig,
        rigDisplayMode: state.rigDisplayMode,
        rigColorMode: state.rigColorMode,
        rigLineColor: state.rigLineColor,
        rigLineOpacity: state.rigLineOpacity,
      }),
    }
  )
);
