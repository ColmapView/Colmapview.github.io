import { useMemo } from 'react';
import { useRigStore } from '../../store';
import type { RigDisplayMode, RigColorMode } from '../../store/types';

export interface RigNodeActions {
  setVisible: (visible: boolean) => void;
  setDisplayMode: (mode: RigDisplayMode) => void;
  setColorMode: (mode: RigColorMode) => void;
  setColor: (color: string) => void;
  setOpacity: (opacity: number) => void;
  toggleVisible: () => void;
}

export function useRigNodeActions(): RigNodeActions {
  return useMemo(
    () => ({
      setVisible: (v) => useRigStore.getState().setShowRig(v),
      setDisplayMode: (m) => useRigStore.getState().setRigDisplayMode(m),
      setColorMode: (m) => useRigStore.getState().setRigColorMode(m),
      setColor: (c) => useRigStore.getState().setRigLineColor(c),
      setOpacity: (o) => useRigStore.getState().setRigLineOpacity(o),
      toggleVisible: () => useRigStore.getState().toggleRig(),
    }),
    []
  );
}
