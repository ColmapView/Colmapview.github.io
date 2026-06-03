import type { PointerEvent } from 'react';
import {
  getResizeHandleRenderStates,
  type ResizeDirection,
} from './imageDetailResizeHandlesViewModel';

export type { ResizeDirection } from './imageDetailResizeHandlesViewModel';

interface DesktopImageDetailResizeHandlesProps {
  onResizeStart: (event: PointerEvent<HTMLElement>, direction: ResizeDirection) => void;
}

export function DesktopImageDetailResizeHandles({ onResizeStart }: DesktopImageDetailResizeHandlesProps) {
  return (
    <>
      {getResizeHandleRenderStates().map(({ ariaLabel, className, direction }) => (
        <div
          key={direction}
          aria-label={ariaLabel}
          className={className}
          onPointerDown={(event) => onResizeStart(event, direction)}
        />
      ))}
    </>
  );
}
