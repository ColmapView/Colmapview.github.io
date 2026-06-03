import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { TOUCH } from '../../theme/sizing';
import { wasSceneObjectTouchDownRecent } from './frustumTouchGuards';
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
  const longPressRef = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);

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

    if (wasSceneContextMenuHandledRecently()) {
      return;
    }

    if (wasRightClickDrag(event.clientX, event.clientY)) {
      return;
    }

    openSceneContextMenu(event.clientX, event.clientY);
  }, [wasRightClickDrag, openSceneContextMenu]);

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
    if (wasSceneObjectTouchDownRecent()) return;

    closeContextMenu();
    const x = event.clientX;
    const y = event.clientY;
    const timer = setTimeout(() => {
      longPressRef.current = null;
      const action = getSceneContextMenuAction({
        pickingMode,
        selectedPointsLength,
        markerRightClickHandled: false,
      });
      runSceneContextMenuAction(action, x, y);
    }, TOUCH.longPressDelay);
    longPressRef.current = { x, y, timer };
  }, [closeContextMenu, pickingMode, selectedPointsLength, runSceneContextMenuAction]);

  const handleTouchPointerMove = useCallback((event: ReactPointerEvent) => {
    if (longPressRef.current && event.pointerType === 'touch') {
      const dx = event.clientX - longPressRef.current.x;
      const dy = event.clientY - longPressRef.current.y;
      if (dx * dx + dy * dy > TOUCH.dragThreshold * TOUCH.dragThreshold) {
        clearTimeout(longPressRef.current.timer);
        longPressRef.current = null;
      }
    }
  }, []);

  const handleTouchPointerUp = useCallback((event: ReactPointerEvent) => {
    if (longPressRef.current && event.pointerType === 'touch') {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  }, []);

  return {
    touchMode,
    handleContextMenu,
    handleMouseDown,
    handleMouseUp,
    handleTouchPointerDown,
    handleTouchPointerMove,
    handleTouchPointerUp,
  };
}
