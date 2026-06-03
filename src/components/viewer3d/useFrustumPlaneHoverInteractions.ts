import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { ImageId } from '../../types/colmap';
import { clearBodyCursor, setBodyCursor } from '../../utils/bodyCursor';
import {
  hasSelectedPlaneIntersection,
  shouldClearExternalFrustumPlaneHover,
  shouldStartFrustumPlaneHover,
} from './frustumPlaneHoverPolicy';

interface FrustumPlaneMousePosition {
  x: number;
  y: number;
}

interface FrustumPlaneHoverInteractionsOptions {
  disabled: boolean;
  imageId: ImageId;
  isSelected: boolean;
  hovered: boolean;
  hoveredImageId: ImageId | null;
  isDragging: () => boolean;
  onHover: (id: ImageId | null) => void;
  setHovered: Dispatch<SetStateAction<boolean>>;
  setMousePos: Dispatch<SetStateAction<FrustumPlaneMousePosition | null>>;
  cursorOwner: string;
}

export function useFrustumPlaneHoverInteractions({
  disabled,
  imageId,
  isSelected,
  hovered,
  hoveredImageId,
  isDragging,
  onHover,
  setHovered,
  setMousePos,
  cursorOwner,
}: FrustumPlaneHoverInteractionsOptions) {
  const hoveredRef = useRef(false);

  const clearLocalHover = useCallback(() => {
    setHovered(false);
    setMousePos(null);
    clearBodyCursor(cursorOwner);
  }, [cursorOwner, setHovered, setMousePos]);

  const clearHover = useCallback(() => {
    clearLocalHover();
    onHover(null);
  }, [clearLocalHover, onHover]);

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  useEffect(() => {
    if (shouldClearExternalFrustumPlaneHover({ hovered, hoveredImageId, imageId })) {
      clearLocalHover();
    }
  }, [clearLocalHover, hovered, hoveredImageId, imageId]);

  useEffect(() => {
    return () => {
      if (hoveredRef.current) {
        onHover(null);
        clearBodyCursor(cursorOwner);
      }
    };
  }, [cursorOwner, onHover]);

  const onPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    const shouldStart = shouldStartFrustumPlaneHover({
      isDragging: isDragging(),
      isSelected,
      isTopIntersection: e.intersections[0]?.object === e.object,
      selectedPlaneIntersected: hasSelectedPlaneIntersection(e.intersections),
    });

    if (!shouldStart) return;

    e.stopPropagation();
    setHovered(true);
    setMousePos({ x: e.clientX, y: e.clientY });
    onHover(imageId);
    setBodyCursor(cursorOwner, 'pointer');
  }, [cursorOwner, imageId, isDragging, isSelected, onHover, setHovered, setMousePos]);

  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (isDragging()) {
      if (hovered) clearHover();
      return;
    }

    if (hovered) {
      setMousePos({ x: e.clientX, y: e.clientY });
    }
  }, [clearHover, hovered, isDragging, setMousePos]);

  const onPointerOut = useCallback(() => {
    clearHover();
  }, [clearHover]);

  return {
    onPointerOver: disabled ? undefined : onPointerOver,
    onPointerMove: disabled ? undefined : onPointerMove,
    onPointerOut: disabled ? undefined : onPointerOut,
  };
}
