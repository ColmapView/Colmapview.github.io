import type { MouseEvent, PointerEvent } from 'react';

export function stopContextMenuSurfacePointerEvent(e: PointerEvent<HTMLElement>): void {
  e.stopPropagation();
}

export function stopContextMenuSurfaceMouseEvent(e: MouseEvent<HTMLElement>): void {
  e.stopPropagation();
}

export function suppressContextMenuSurfaceContextMenu(e: MouseEvent<HTMLElement>): void {
  e.preventDefault();
  e.stopPropagation();
}
