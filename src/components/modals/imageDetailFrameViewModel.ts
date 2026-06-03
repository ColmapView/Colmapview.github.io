import type { CSSProperties } from 'react';
import type { Position2D, Size2D } from './imageDetailLayoutViewModel';

interface DesktopImageDetailPanelStyleOptions {
  position: Position2D;
  size: Size2D;
}

interface ImageDetailMaskInteractionOptions {
  hasMask: boolean;
  showMatchesInModal: boolean;
}

export const DESKTOP_IMAGE_DETAIL_FRAME_CLASS = 'fixed inset-0 z-[1000] pointer-events-none';
export const TOUCH_IMAGE_DETAIL_FRAME_CLASS = 'fixed inset-0 z-[1000] bg-ds-primary flex flex-col';

export function getDesktopImageDetailPanelStyle({
  position,
  size,
}: DesktopImageDetailPanelStyleOptions): CSSProperties {
  return {
    left: position.x,
    top: position.y,
    width: size.width,
    height: size.height,
  };
}

export function isImageDetailMaskInteractionEnabled({
  hasMask,
  showMatchesInModal,
}: ImageDetailMaskInteractionOptions): boolean {
  return hasMask && !showMatchesInModal;
}
