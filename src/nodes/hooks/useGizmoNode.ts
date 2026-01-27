import { useMemo } from 'react';
import { useUIStore } from '../../store';
import type { GizmoNode } from '../types';

export function useGizmoNode(): GizmoNode {
  const showGizmo = useUIStore((s) => s.showGizmo);

  return useMemo<GizmoNode>(
    () => ({
      nodeType: 'gizmo',
      visible: showGizmo,
    }),
    [showGizmo]
  );
}
