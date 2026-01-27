import { useMemo } from 'react';
import { useUIStore } from '../../store';
import type { AxesCoordinateSystem, AxisLabelMode } from '../../store/types';

export interface AxesNodeActions {
  setVisible: (visible: boolean) => void;
  setCoordinateSystem: (system: AxesCoordinateSystem) => void;
  setScale: (scale: number) => void;
  setLabelMode: (mode: AxisLabelMode) => void;
  toggleVisible: () => void;
}

export function useAxesNodeActions(): AxesNodeActions {
  return useMemo(
    () => ({
      setVisible: (v) => useUIStore.getState().setShowAxes(v),
      setCoordinateSystem: (s) => useUIStore.getState().setAxesCoordinateSystem(s),
      setScale: (s) => useUIStore.getState().setAxesScale(s),
      setLabelMode: (m) => useUIStore.getState().setAxisLabelMode(m),
      toggleVisible: () => useUIStore.getState().toggleAxes(),
    }),
    []
  );
}
