import type { CSSProperties } from 'react';
import { MODAL_POSITION } from '../../theme';

export interface ScreenPosition {
  x: number;
  y: number;
}

export function calculateFixedHtmlPosition(): [number, number] {
  return [0, 0];
}

export function getFixedCursorHtmlStyle(
  position: ScreenPosition,
  cursorOffset = MODAL_POSITION.cursorOffset
): CSSProperties {
  return {
    position: 'fixed',
    left: position.x + cursorOffset,
    top: position.y + cursorOffset,
    pointerEvents: 'none',
    transform: 'none',
  };
}

export function getFixedContextMenuHtmlStyle(position: ScreenPosition): CSSProperties {
  return {
    position: 'fixed',
    left: position.x,
    top: position.y,
    pointerEvents: 'auto',
  };
}

export function getPointerEnabledHtmlStyle(): CSSProperties {
  return {
    pointerEvents: 'auto',
  };
}
