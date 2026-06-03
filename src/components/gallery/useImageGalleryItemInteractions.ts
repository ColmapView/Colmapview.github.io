import { useCallback, useEffect } from 'react';
import { useLongPress, type LongPressTouchEvent } from '../../hooks/useLongPress';
import { useResetKeyedState } from '../../hooks/useResetKeyedState';
import { clearBodyCursor, setBodyCursor } from '../../utils/bodyCursor';
import {
  getClearedGalleryItemHoverState,
  getGalleryItemHoverResetKey,
  getGalleryItemPointerHoverState,
  shouldTrackGalleryItemPointer,
} from './imageGalleryItemHoverPolicy';

const IMAGE_GALLERY_CURSOR_OWNER = 'image-gallery';

interface GalleryMouseEvent {
  preventDefault(): void;
}

interface GalleryPointerEvent {
  clientX: number;
  clientY: number;
}

interface GalleryItemHandlers {
  onClick?: (event: GalleryMouseEvent) => void;
  onContextMenu: (event: GalleryMouseEvent) => void;
  onPointerOver: (event: GalleryPointerEvent) => void;
  onPointerMove: (event: GalleryPointerEvent) => void;
  onPointerOut: (event: GalleryPointerEvent) => void;
  onTouchStart?: (event: LongPressTouchEvent) => void;
  onTouchEnd?: (event: LongPressTouchEvent) => void;
  onTouchMove?: (event: LongPressTouchEvent) => void;
  onTouchCancel?: () => void;
}

interface UseImageGalleryItemInteractionsOptions {
  imageId: number;
  isSelected: boolean;
  isScrolling: boolean;
  touchMode: boolean;
  onClick: (imageId: number) => void;
  onDoubleClick: (imageId: number) => void;
  onRightClick: (imageId: number) => void;
}

export function useImageGalleryItemInteractions({
  imageId,
  isSelected,
  isScrolling,
  touchMode,
  onClick,
  onDoubleClick,
  onRightClick,
}: UseImageGalleryItemInteractionsOptions) {
  const [hoverState, setHoverState] = useResetKeyedState(
    getGalleryItemHoverResetKey(isScrolling),
    getClearedGalleryItemHoverState()
  );
  const { hovered, mousePos } = hoverState;

  useEffect(() => {
    if (isScrolling) {
      clearBodyCursor(IMAGE_GALLERY_CURSOR_OWNER);
    }
  }, [isScrolling]);

  const handleClick = useCallback((_event?: unknown) => {
    if (isSelected) {
      onDoubleClick(imageId);
    } else {
      onClick(imageId);
    }
  }, [imageId, isSelected, onClick, onDoubleClick]);

  const longPressHandlers = useLongPress({
    onLongPress: () => onRightClick(imageId),
    onClick: handleClick,
  });

  const handleContextMenu = useCallback((e: GalleryMouseEvent) => {
    e.preventDefault();
    onRightClick(imageId);
  }, [imageId, onRightClick]);

  const handlePointerOver = useCallback((e: GalleryPointerEvent) => {
    if (!shouldTrackGalleryItemPointer({ isScrolling, touchMode })) return;
    setHoverState(getGalleryItemPointerHoverState({ x: e.clientX, y: e.clientY }));
    setBodyCursor(IMAGE_GALLERY_CURSOR_OWNER, 'pointer');
  }, [isScrolling, setHoverState, touchMode]);

  const handlePointerMove = useCallback((e: GalleryPointerEvent) => {
    if (!shouldTrackGalleryItemPointer({ isScrolling, touchMode }) || !hovered) return;
    setHoverState(getGalleryItemPointerHoverState({ x: e.clientX, y: e.clientY }));
  }, [hovered, isScrolling, setHoverState, touchMode]);

  const handlePointerOut = useCallback((_event: GalleryPointerEvent) => {
    if (!shouldTrackGalleryItemPointer({ isScrolling, touchMode })) return;
    setHoverState(getClearedGalleryItemHoverState());
    clearBodyCursor(IMAGE_GALLERY_CURSOR_OWNER);
  }, [isScrolling, setHoverState, touchMode]);

  const itemHandlers: GalleryItemHandlers = {
    onClick: touchMode ? undefined : handleClick,
    onContextMenu: handleContextMenu,
    onPointerOver: handlePointerOver,
    onPointerMove: handlePointerMove,
    onPointerOut: handlePointerOut,
    ...(touchMode ? longPressHandlers : {}),
  };

  return {
    hovered,
    mousePos,
    itemHandlers,
  };
}
