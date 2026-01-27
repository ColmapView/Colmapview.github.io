import { useMemo } from 'react';
import { useUIStore } from '../../store';

export interface GridNodeActions {
  setVisible: (visible: boolean) => void;
  setScale: (scale: number) => void;
  toggleVisible: () => void;
}

export function useGridNodeActions(): GridNodeActions {
  return useMemo(
    () => ({
      setVisible: (v) => useUIStore.getState().setShowGrid(v),
      setScale: (s) => useUIStore.getState().setGridScale(s),
      toggleVisible: () => useUIStore.getState().toggleGrid(),
    }),
    []
  );
}
