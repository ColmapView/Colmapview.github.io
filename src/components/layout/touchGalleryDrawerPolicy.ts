import type { CSSProperties } from 'react';

export const TOUCH_GALLERY_DRAWER_CLOSE_DISTANCE_PX = 100;
export const TOUCH_GALLERY_DRAWER_CLOSE_WIDTH_RATIO = 0.3;
export const TOUCH_GALLERY_DRAWER_MAX_VIEWPORT_WIDTH = '85vw';
export const TOUCH_GALLERY_DRAWER_BODY_OPEN_OVERFLOW = 'hidden';
export const TOUCH_GALLERY_DRAWER_BODY_RESET_OVERFLOW = '';
export const TOUCH_GALLERY_DRAWER_BACKDROP_CLASS =
  'fixed inset-0 z-[997] bg-ds-void/50 backdrop-blur-sm';
export const TOUCH_GALLERY_DRAWER_PANEL_CLASS =
  'fixed inset-y-0 right-0 z-[998] bg-ds-secondary border-l border-ds shadow-ds-lg flex flex-col';

export type TouchGalleryDrawerMoveState =
  | { type: 'none' }
  | { type: 'dragging'; deltaX: number; transform: string };

export type TouchGalleryDrawerEndAction = 'none' | 'close' | 'snapBack';

export function getTouchGalleryDrawerCloseThreshold(
  drawerWidth: number,
  maxDistancePx = TOUCH_GALLERY_DRAWER_CLOSE_DISTANCE_PX,
  widthRatio = TOUCH_GALLERY_DRAWER_CLOSE_WIDTH_RATIO
): number {
  return Math.min(maxDistancePx, drawerWidth * widthRatio);
}

export function getTouchGalleryDrawerMoveState({
  startX,
  clientX,
}: {
  startX: number | null;
  clientX: number;
}): TouchGalleryDrawerMoveState {
  if (startX === null) return { type: 'none' };

  const deltaX = clientX - startX;
  if (deltaX <= 0) return { type: 'none' };

  return {
    type: 'dragging',
    deltaX,
    transform: `translateX(${deltaX}px)`,
  };
}

export function getTouchGalleryDrawerEndAction({
  startX,
  deltaX,
  drawerWidth,
}: {
  startX: number | null;
  deltaX: number;
  drawerWidth: number;
}): TouchGalleryDrawerEndAction {
  if (startX === null) return 'none';

  return deltaX > getTouchGalleryDrawerCloseThreshold(drawerWidth)
    ? 'close'
    : 'snapBack';
}

export function getTouchGalleryDrawerPanelStyle(
  drawerWidth: number,
  maxViewportWidth = TOUCH_GALLERY_DRAWER_MAX_VIEWPORT_WIDTH
): CSSProperties {
  return {
    width: `min(${drawerWidth}px, ${maxViewportWidth})`,
  };
}
