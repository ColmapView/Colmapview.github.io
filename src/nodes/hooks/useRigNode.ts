import { useMemo } from 'react';
import { useRigStore } from '../../store';
import type { RigNode } from '../types';

export function useRigNode(): RigNode {
  const showRig = useRigStore((s) => s.showRig);
  const rigDisplayMode = useRigStore((s) => s.rigDisplayMode);
  const rigColorMode = useRigStore((s) => s.rigColorMode);
  const rigLineColor = useRigStore((s) => s.rigLineColor);
  const rigLineOpacity = useRigStore((s) => s.rigLineOpacity);

  return useMemo<RigNode>(
    () => ({
      nodeType: 'rig',
      visible: showRig,
      displayMode: rigDisplayMode,
      colorMode: rigColorMode,
      color: rigLineColor,
      opacity: rigLineOpacity,
    }),
    [showRig, rigDisplayMode, rigColorMode, rigLineColor, rigLineOpacity]
  );
}
