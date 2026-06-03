import { useState, useEffect } from 'react';
import {
  getPickingCursorContainerStyle,
  getPickingCursorMarkerStyle,
  getPickingCursorViewModel,
  PICKING_CURSOR_CONTAINER_CLASS,
  PICKING_CURSOR_LABEL_PREFIX,
  PICKING_CURSOR_MARKER_CLASS,
  PICKING_CURSOR_TOOLTIP_CLASS,
} from './pickingCursorViewModel';
import { usePickingCursorStoreFacade } from './usePickingCursorStoreFacade';

/**
 * Cursor-following tooltip that shows picking status during point selection.
 * Displays which point is being selected with matching color coding.
 */
export function PickingCursor() {
  const {
    pickingMode,
    selectedPointsLength,
  } = usePickingCursorStoreFacade();

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const cursorState = getPickingCursorViewModel(pickingMode, selectedPointsLength);
  const isActive = cursorState.isVisible;

  useEffect(() => {
    if (!isActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isActive]);

  // Don't show cursor when not active or when all points are selected
  if (!cursorState.isVisible) return null;

  return (
    <div
      className={PICKING_CURSOR_CONTAINER_CLASS}
      style={getPickingCursorContainerStyle(mousePos)}
    >
      <div className={PICKING_CURSOR_TOOLTIP_CLASS}>
        <span
          className={PICKING_CURSOR_MARKER_CLASS}
          style={getPickingCursorMarkerStyle(cursorState.nextColor)}
        />
        <span>{PICKING_CURSOR_LABEL_PREFIX} <strong>{cursorState.nextLabel}</strong></span>
      </div>
    </div>
  );
}
