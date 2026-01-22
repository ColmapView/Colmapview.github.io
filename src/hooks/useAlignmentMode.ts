/**
 * Hook to detect if we're in any alignment mode (point picking or floor detection).
 *
 * When in alignment mode, components should:
 * - Hide camera frustums (to reduce visual clutter)
 * - Show axes (to help with alignment)
 *
 * This follows the DRY principle by centralizing the alignment mode logic.
 */

import { usePointPickingStore } from '../store/stores/pointPickingStore';
import { useFloorPlaneStore } from '../store/stores/floorPlaneStore';

export type AlignmentModeType = 'off' | 'point-picking' | 'floor-detection';

/**
 * Returns the current alignment mode and whether any alignment mode is active.
 */
export function useAlignmentMode(): {
  isAlignmentMode: boolean;
  alignmentType: AlignmentModeType;
} {
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);

  // Point picking mode takes priority (user explicitly activated it)
  if (pickingMode !== 'off') {
    return { isAlignmentMode: true, alignmentType: 'point-picking' };
  }

  // Floor detection mode (plane is detected and widget is visible)
  if (detectedPlane !== null) {
    return { isAlignmentMode: true, alignmentType: 'floor-detection' };
  }

  return { isAlignmentMode: false, alignmentType: 'off' };
}

/**
 * Simple boolean check if any alignment mode is active.
 */
export function useIsAlignmentMode(): boolean {
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);

  return pickingMode !== 'off' || detectedPlane !== null;
}
