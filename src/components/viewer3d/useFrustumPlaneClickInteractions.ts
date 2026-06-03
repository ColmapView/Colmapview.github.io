import { useCallback } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { ImageId } from '../../types/colmap';
import {
  getFrustumPlaneClickAction,
  shouldEnableFrustumPlaneContextMenu,
} from './frustumPlaneClickPolicy';
import { markSceneContextMenuHandled } from './sceneContextMenuGuard';

interface FrustumPlaneClickInteractionsOptions {
  disabled: boolean;
  imageId: ImageId;
  touchMode: boolean;
  onClick: (imageId: ImageId) => void;
  onContextMenu: (imageId: ImageId) => void;
}

export function useFrustumPlaneClickInteractions({
  disabled,
  imageId,
  touchMode,
  onClick,
  onContextMenu,
}: FrustumPlaneClickInteractionsOptions) {
  const onPlaneClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    const action = getFrustumPlaneClickAction({ disabled, touchMode });
    if (action === 'disabled') return;

    e.stopPropagation();
    if (action === 'select') onClick(imageId);
  }, [disabled, imageId, onClick, touchMode]);

  const onPlaneContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    e.nativeEvent.preventDefault();
    e.nativeEvent.stopPropagation();
    onContextMenu(imageId);
  }, [imageId, onContextMenu]);

  const onPlanePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (disabled || touchMode || e.nativeEvent.button !== 2) return;

    markSceneContextMenuHandled();
  }, [disabled, touchMode]);

  return {
    onClick: disabled ? undefined : onPlaneClick,
    onPointerDown: disabled || touchMode ? undefined : onPlanePointerDown,
    onContextMenu: shouldEnableFrustumPlaneContextMenu({ disabled, touchMode })
      ? onPlaneContextMenu
      : undefined,
  };
}
