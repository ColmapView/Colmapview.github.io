import { useMemo } from 'react';
import { useUIStore } from '../../store';
import type { AxesNode } from '../types';

export function useAxesNode(): AxesNode {
  const showAxes = useUIStore((s) => s.showAxes);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);
  const axesScale = useUIStore((s) => s.axesScale);
  const axisLabelMode = useUIStore((s) => s.axisLabelMode);

  return useMemo<AxesNode>(
    () => ({
      nodeType: 'axes',
      visible: showAxes,
      coordinateSystem: axesCoordinateSystem,
      scale: axesScale,
      labelMode: axisLabelMode,
    }),
    [showAxes, axesCoordinateSystem, axesScale, axisLabelMode]
  );
}
