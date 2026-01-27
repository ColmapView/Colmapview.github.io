import { useMemo } from 'react';
import { useUIStore } from '../../store';

export interface GizmoNodeActions {
  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
}

export function useGizmoNodeActions(): GizmoNodeActions {
  return useMemo(
    () => ({
      setVisible: (v) => useUIStore.getState().setShowGizmo(v),
      toggleVisible: () => useUIStore.getState().toggleGizmo(),
    }),
    []
  );
}
