import { useMemo } from 'react';
import { useUIStore } from '../../store';
import type { MatchesDisplayMode } from '../../store/types';

export interface MatchesNodeActions {
  setVisible: (visible: boolean) => void;
  setDisplayMode: (mode: MatchesDisplayMode) => void;
  setOpacity: (opacity: number) => void;
  setColor: (color: string) => void;
  toggleVisible: () => void;
}

export function useMatchesNodeActions(): MatchesNodeActions {
  return useMemo(
    () => ({
      setVisible: (v) => useUIStore.getState().setShowMatches(v),
      setDisplayMode: (m) => useUIStore.getState().setMatchesDisplayMode(m),
      setOpacity: (o) => useUIStore.getState().setMatchesOpacity(o),
      setColor: (c) => useUIStore.getState().setMatchesColor(c),
      toggleVisible: () => useUIStore.getState().toggleMatches(),
    }),
    []
  );
}
