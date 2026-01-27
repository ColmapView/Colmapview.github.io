import { useMemo } from 'react';
import { useUIStore } from '../../store';
import type { GridNode } from '../types';

export function useGridNode(): GridNode {
  const showGrid = useUIStore((s) => s.showGrid);
  const gridScale = useUIStore((s) => s.gridScale);

  return useMemo<GridNode>(
    () => ({
      nodeType: 'grid',
      visible: showGrid,
      scale: gridScale,
    }),
    [showGrid, gridScale]
  );
}
