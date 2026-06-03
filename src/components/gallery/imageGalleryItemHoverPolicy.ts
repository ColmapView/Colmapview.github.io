export interface GalleryItemPointerPosition {
  x: number;
  y: number;
}

export interface GalleryItemHoverState {
  hovered: boolean;
  mousePos: GalleryItemPointerPosition | null;
}

export interface GalleryItemPointerTrackingOptions {
  isScrolling: boolean;
  touchMode: boolean;
}

export function getClearedGalleryItemHoverState(): GalleryItemHoverState {
  return {
    hovered: false,
    mousePos: null,
  };
}

export function getGalleryItemHoverResetKey(isScrolling: boolean): string {
  return isScrolling ? 'scrolling' : 'idle';
}

export function shouldTrackGalleryItemPointer({
  isScrolling,
  touchMode,
}: GalleryItemPointerTrackingOptions): boolean {
  return !touchMode && !isScrolling;
}

export function getGalleryItemPointerHoverState(
  position: GalleryItemPointerPosition
): GalleryItemHoverState {
  return {
    hovered: true,
    mousePos: position,
  };
}
