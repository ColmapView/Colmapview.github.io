import { useMemo } from 'react';
import { useCameraStore } from '../../store';
import type { SelectionNode } from '../types';

export function useSelectionNode(): SelectionNode {
  const showSelectionHighlight = useCameraStore((s) => s.showSelectionHighlight);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const selectionColor = useCameraStore((s) => s.selectionColor);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);
  const selectionPlaneOpacity = useCameraStore((s) => s.selectionPlaneOpacity);
  const unselectedCameraOpacity = useCameraStore((s) => s.unselectedCameraOpacity);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);

  return useMemo<SelectionNode>(
    () => ({
      nodeType: 'selection',
      visible: showSelectionHighlight,
      colorMode: selectionColorMode,
      color: selectionColor,
      animationSpeed: selectionAnimationSpeed,
      planeOpacity: selectionPlaneOpacity,
      unselectedOpacity: unselectedCameraOpacity,
      selectedImageId,
    }),
    [
      showSelectionHighlight,
      selectionColorMode,
      selectionColor,
      selectionAnimationSpeed,
      selectionPlaneOpacity,
      unselectedCameraOpacity,
      selectedImageId,
    ]
  );
}
