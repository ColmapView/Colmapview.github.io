import { useMemo } from 'react';
import { useCameraStore } from '../../store';
import type { SelectionColorMode } from '../../store/types';

export interface SelectionNodeActions {
  setVisible: (visible: boolean) => void;
  setColorMode: (mode: SelectionColorMode) => void;
  setColor: (color: string) => void;
  setAnimationSpeed: (speed: number) => void;
  setPlaneOpacity: (opacity: number) => void;
  setUnselectedOpacity: (opacity: number) => void;
  setSelectedImageId: (id: number | null) => void;
  toggleSelectedImageId: (id: number) => void;
  toggleVisible: () => void;
}

export function useSelectionNodeActions(): SelectionNodeActions {
  return useMemo(
    () => ({
      setVisible: (v) => useCameraStore.getState().setShowSelectionHighlight(v),
      setColorMode: (m) => useCameraStore.getState().setSelectionColorMode(m),
      setColor: (c) => useCameraStore.getState().setSelectionColor(c),
      setAnimationSpeed: (s) => useCameraStore.getState().setSelectionAnimationSpeed(s),
      setPlaneOpacity: (o) => useCameraStore.getState().setSelectionPlaneOpacity(o),
      setUnselectedOpacity: (o) => useCameraStore.getState().setUnselectedCameraOpacity(o),
      setSelectedImageId: (id) => useCameraStore.getState().setSelectedImageId(id),
      toggleSelectedImageId: (id) => useCameraStore.getState().toggleSelectedImageId(id),
      toggleVisible: () => useCameraStore.getState().toggleSelectionHighlight(),
    }),
    []
  );
}
