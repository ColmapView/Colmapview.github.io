import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { TOUCH } from '../../theme/sizing';
import { setActiveSceneTouchPointerCount, wasSceneObjectTouchDownRecent } from './frustumTouchGuards';
import { wasSceneContextMenuHandledRecently } from './sceneContextMenuGuard';
import {
  getSceneContextMenuAction,
  hasSceneContextMenuDragMoved,
  type SceneContextMenuAction,
} from './scene3dViewModel';
import { useSceneContextMenuStoreFacade } from './useSceneContextMenuStoreFacade';

export interface SceneContextMenuController {
  touchMode: boolean;
  handleContextMenu: (event: ReactMouseEvent) => void;
  handleMouseDown: (event: ReactMouseEvent) => void;
  handleMouseUp: (event: ReactMouseEvent) => void;
  handleTouchPointerDown: (event: ReactPointerEvent) => void;
  handleTouchPointerMove: (event: ReactPointerEvent) => void;
  handleTouchPointerUp: (event: ReactPointerEvent) => void;
  handleTouchPointerCancel: (event: ReactPointerEvent) => void;
}

interface LongPressEntry {
  pointerId: number;
  x: number;
  y: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Native contextmenu events synthesized from a touch long-press (Android
 * Chrome) are ignored in touch mode: the controller's own long-press timer
 * owns that UX, and the OS event would double-fire the menu - or re-open it
 * at a stale position after the finger has moved on to a drag.
 */
function isTouchDerivedContextMenuEvent(event: ReactMouseEvent): boolean {
  const native = event.nativeEvent;
  return 'pointerType' in native && (native as PointerEvent).pointerType === 'touch';
}

export function useSceneContextMenuController(): SceneContextMenuController {
  const {
    data: {
      touchMode,
      pickingMode,
      selectedPointsLength,
      markerRightClickHandled,
    },
    actions: {
      openContextMenu,
      closeContextMenu,
      removeLastPoint,
      resetPointPicking,
      setMarkerRightClickHandled,
    },
  } = useSceneContextMenuStoreFacade();

  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const longPressRef = useRef<LongPressEntry | null>(null);
  // All currently-down touch pointers on the scene container. A long-press is
  // only a long-press while it is the lone touch point; any second finger
  // (pinch, two-finger pan) must cancel it.
  const activeTouchPointersRef = useRef<Set<number>>(new Set());

  const clearLongPress = useCallback(() => {
    if (!longPressRef.current) return;
    clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  }, []);

  useEffect(() => {
    const activeTouchPointers = activeTouchPointersRef.current;
    if (!touchMode) {
      clearLongPress();
      activeTouchPointers.clear();
      setActiveSceneTouchPointerCount(0);
    }
    return () => {
      clearLongPress();
      activeTouchPointers.clear();
      setActiveSceneTouchPointerCount(0);
    };
  }, [touchMode, clearLongPress]);

  const wasRightClickDrag = useCallback((clientX: number, clientY: number) => {
    return hasSceneContextMenuDragMoved(mouseDownPos.current, { x: clientX, y: clientY });
  }, []);

  const runSceneContextMenuAction = useCallback((action: SceneContextMenuAction, clientX: number, clientY: number) => {
    switch (action) {
      case 'clear-marker-right-click':
        setMarkerRightClickHandled(false);
        return;
      case 'remove-last-selected-point':
        removeLastPoint();
        return;
      case 'reset-point-picking':
        resetPointPicking();
        return;
      case 'open-context-menu':
        openContextMenu(clientX, clientY);
        return;
    }
  }, [openContextMenu, removeLastPoint, resetPointPicking, setMarkerRightClickHandled]);

  const openSceneContextMenu = useCallback((clientX: number, clientY: number) => {
    const action = getSceneContextMenuAction({
      pickingMode,
      selectedPointsLength,
      markerRightClickHandled,
    });
    runSceneContextMenuAction(action, clientX, clientY);
  }, [pickingMode, selectedPointsLength, markerRightClickHandled, runSceneContextMenuAction]);

  const handleContextMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();

    if (touchMode && isTouchDerivedContextMenuEvent(event)) {
      return;
    }

    if (wasSceneContextMenuHandledRecently()) {
      return;
    }

    if (wasRightClickDrag(event.clientX, event.clientY)) {
      return;
    }

    openSceneContextMenu(event.clientX, event.clientY);
  }, [touchMode, wasRightClickDrag, openSceneContextMenu]);

  const handleMouseDown = useCallback((event: ReactMouseEvent) => {
    if (event.button === 2) {
      if (wasSceneContextMenuHandledRecently()) {
        mouseDownPos.current = null;
        closeContextMenu();
        return;
      }

      mouseDownPos.current = { x: event.clientX, y: event.clientY };
      closeContextMenu();
    }
  }, [closeContextMenu]);

  const handleMouseUp = useCallback((event: ReactMouseEvent) => {
    if (event.button === 2 && wasSceneContextMenuHandledRecently()) {
      mouseDownPos.current = null;
      return;
    }

    if (event.button === 2 && mouseDownPos.current && !wasRightClickDrag(event.clientX, event.clientY)) {
      event.preventDefault();
      openSceneContextMenu(event.clientX, event.clientY);
    }
    setTimeout(() => { mouseDownPos.current = null; }, 0);
  }, [wasRightClickDrag, openSceneContextMenu]);

  const handleTouchPointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType !== 'touch') return;

    activeTouchPointersRef.current.add(event.pointerId);
    setActiveSceneTouchPointerCount(activeTouchPointersRef.current.size);
    // A second finger means a gesture (pinch / two-finger pan), never a
    // long-press: cancel any pending timer and don't arm a new one. The
    // cancelled press must not re-arm while the gesture is still in contact.
    if (activeTouchPointersRef.current.size > 1) {
      clearLongPress();
      return;
    }

    if (wasSceneObjectTouchDownRecent()) return;

    closeContextMenu();
    clearLongPress();
    const entry: LongPressEntry = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        // Stale-timer guard: only the currently-armed entry may fire.
        if (longPressRef.current !== entry) return;
        longPressRef.current = null;
        const action = getSceneContextMenuAction({
          pickingMode,
          selectedPointsLength,
          markerRightClickHandled: false,
        });
        runSceneContextMenuAction(action, entry.x, entry.y);
      }, TOUCH.longPressDelay),
    };
    longPressRef.current = entry;
  }, [clearLongPress, closeContextMenu, pickingMode, selectedPointsLength, runSceneContextMenuAction]);

  const handleTouchPointerMove = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType !== 'touch') return;
    const armed = longPressRef.current;
    if (!armed || event.pointerId !== armed.pointerId) return;

    const dx = event.clientX - armed.x;
    const dy = event.clientY - armed.y;
    if (dx * dx + dy * dy > TOUCH.dragThreshold * TOUCH.dragThreshold) {
      clearLongPress();
    }
  }, [clearLongPress]);

  const handleTouchPointerEnd = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType !== 'touch') return;

    activeTouchPointersRef.current.delete(event.pointerId);
    setActiveSceneTouchPointerCount(activeTouchPointersRef.current.size);
    if (longPressRef.current && event.pointerId === longPressRef.current.pointerId) {
      clearLongPress();
    }
  }, [clearLongPress]);

  return {
    touchMode,
    handleContextMenu,
    handleMouseDown,
    handleMouseUp,
    handleTouchPointerDown,
    handleTouchPointerMove,
    handleTouchPointerUp: handleTouchPointerEnd,
    handleTouchPointerCancel: handleTouchPointerEnd,
  };
}
