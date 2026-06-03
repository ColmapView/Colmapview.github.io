import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TOUCH } from '../../theme/sizing';
import { clearBodyCursor, setBodyCursor } from '../../utils/bodyCursor';
import {
  getBatchedFrustum,
  getBatchedFrustumTouchUpAction,
  getInteractiveBatchedFrustum,
  type BatchedFrustumInteractionItem,
  type BatchedFrustumTouchStart,
} from './batchedFrustumInteractionPolicy';
import { CAMERA_FRUSTUM_CURSOR_OWNER } from './cameraFrustumConstants';
import { markFrustumTap, markFrustumTouchDown } from './frustumTouchGuards';
import { markSceneContextMenuHandled } from './sceneContextMenuGuard';

export type { BatchedFrustumInteractionItem } from './batchedFrustumInteractionPolicy';

export type BatchedFrustumTooltipData = {
  instanceId: number;
  x: number;
  y: number;
};

interface BatchedFrustumPointerNativeEvent {
  button?: number;
  clientX: number;
  clientY: number;
}

interface BatchedFrustumMouseNativeEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

interface BatchedFrustumEvent<TNativeEvent> {
  instanceId?: number;
  nativeEvent: TNativeEvent;
  stopPropagation(): void;
}

interface BatchedFrustumInteractionsOptions<T extends BatchedFrustumInteractionItem> {
  frustums: T[];
  selectedImageId: number | null;
  touchMode: boolean;
  isDragging: () => boolean;
  onHover: (id: number | null) => void;
  onClick: (imageId: number) => void;
  onContextMenu: (imageId: number) => void;
  onLongPress: (imageId: number) => void;
}

export function useBatchedFrustumInteractions<T extends BatchedFrustumInteractionItem>({
  frustums,
  selectedImageId,
  touchMode,
  isDragging,
  onHover,
  onClick,
  onContextMenu: onContextMenuAction,
  onLongPress,
}: BatchedFrustumInteractionsOptions<T>) {
  const [tooltipData, setTooltipData] = useState<BatchedFrustumTooltipData | null>(null);
  const touchDownRef = useRef<(BatchedFrustumTouchStart & { timer: ReturnType<typeof setTimeout> | null }) | null>(null);

  useEffect(() => {
    return () => {
      clearBodyCursor(CAMERA_FRUSTUM_CURSOR_OWNER);
      if (touchDownRef.current?.timer) clearTimeout(touchDownRef.current.timer);
    };
  }, []);

  const getFrustum = useCallback((instanceId: number | undefined) => {
    return getBatchedFrustum(frustums, instanceId);
  }, [frustums]);

  const getInteractiveFrustum = useCallback((instanceId: number | undefined) => {
    return getInteractiveBatchedFrustum({
      frustums,
      instanceId,
      selectedImageId,
    });
  }, [frustums, selectedImageId]);

  const clearHover = useCallback(() => {
    setTooltipData(null);
    onHover(null);
    clearBodyCursor(CAMERA_FRUSTUM_CURSOR_OWNER);
  }, [onHover]);

  const updateHover = useCallback((frustum: T, instanceId: number, x: number, y: number) => {
    setTooltipData({ instanceId, x, y });
    onHover(frustum.image.imageId);
    setBodyCursor(CAMERA_FRUSTUM_CURSOR_OWNER, 'pointer');
  }, [onHover]);

  const onPointerOver = useCallback((e: BatchedFrustumEvent<BatchedFrustumPointerNativeEvent>) => {
    if (isDragging()) return;

    const frustum = getInteractiveFrustum(e.instanceId);
    if (!frustum || e.instanceId === undefined) return;

    e.stopPropagation();
    updateHover(frustum, e.instanceId, e.nativeEvent.clientX, e.nativeEvent.clientY);
  }, [getInteractiveFrustum, isDragging, updateHover]);

  const onPointerMove = useCallback((e: BatchedFrustumEvent<BatchedFrustumPointerNativeEvent>) => {
    if (isDragging()) {
      if (tooltipData !== null) clearHover();
      return;
    }

    if (tooltipData !== null) {
      setTooltipData({
        instanceId: tooltipData.instanceId,
        x: e.nativeEvent.clientX,
        y: e.nativeEvent.clientY,
      });
      return;
    }

    const frustum = getInteractiveFrustum(e.instanceId);
    if (!frustum || e.instanceId === undefined) return;

    updateHover(frustum, e.instanceId, e.nativeEvent.clientX, e.nativeEvent.clientY);
  }, [clearHover, getInteractiveFrustum, isDragging, tooltipData, updateHover]);

  const onPointerDownForTouch = useCallback((e: BatchedFrustumEvent<BatchedFrustumPointerNativeEvent>) => {
    if (e.instanceId === undefined) return;

    markFrustumTouchDown();
    const instanceId = e.instanceId;
    const x = e.nativeEvent.clientX;
    const y = e.nativeEvent.clientY;
    const timer = setTimeout(() => {
      if (!touchDownRef.current || touchDownRef.current.instanceId !== instanceId) return;
      touchDownRef.current.fired = true;
      const frustum = getFrustum(instanceId);
      if (frustum) onLongPress(frustum.image.imageId);
    }, TOUCH.longPressDelay);

    touchDownRef.current = { instanceId, x, y, timer, fired: false };
  }, [getFrustum, onLongPress]);

  const onPointerDownForMouse = useCallback((e: BatchedFrustumEvent<BatchedFrustumPointerNativeEvent>) => {
    if (e.nativeEvent.button !== 2) return;
    const frustum = getInteractiveFrustum(e.instanceId);
    if (!frustum) return;

    markSceneContextMenuHandled();
  }, [getInteractiveFrustum]);

  const onPointerUp = useCallback((e: BatchedFrustumEvent<BatchedFrustumPointerNativeEvent>) => {
    const down = touchDownRef.current;
    touchDownRef.current = null;
    if (!down) return;

    if (down.timer) clearTimeout(down.timer);
    if (down.fired) return;

    const action = getBatchedFrustumTouchUpAction({
      frustums,
      touchStart: down,
      touchEnd: {
        x: e.nativeEvent.clientX,
        y: e.nativeEvent.clientY,
      },
      selectedImageId,
    });
    if (action.type !== 'openContextMenu') return;

    e.stopPropagation();
    markFrustumTap();
    onContextMenuAction(action.frustum.image.imageId);
  }, [frustums, onContextMenuAction, selectedImageId]);

  const onClickForMouse = useCallback((e: BatchedFrustumEvent<BatchedFrustumMouseNativeEvent>) => {
    const frustum = getInteractiveFrustum(e.instanceId);
    if (!frustum) return;

    e.stopPropagation();
    onClick(frustum.image.imageId);
  }, [getInteractiveFrustum, onClick]);

  const onClickForTouch = useCallback((e: BatchedFrustumEvent<BatchedFrustumMouseNativeEvent>) => {
    e.stopPropagation();
  }, []);

  const onContextMenu = useCallback((e: BatchedFrustumEvent<BatchedFrustumMouseNativeEvent>) => {
    const frustum = getInteractiveFrustum(e.instanceId);
    if (!frustum) return;

    e.stopPropagation();
    e.nativeEvent.preventDefault();
    e.nativeEvent.stopPropagation();
    onContextMenuAction(frustum.image.imageId);
  }, [getInteractiveFrustum, onContextMenuAction]);

  const interactionHandlers = useMemo(() => ({
    onPointerOver,
    onPointerMove,
    onPointerOut: clearHover,
    onPointerDown: touchMode ? onPointerDownForTouch : onPointerDownForMouse,
    onPointerUp: touchMode ? onPointerUp : undefined,
    onClick: touchMode ? onClickForTouch : onClickForMouse,
    onContextMenu,
  }), [
    clearHover,
    onClickForMouse,
    onClickForTouch,
    onContextMenu,
    onPointerDownForMouse,
    onPointerDownForTouch,
    onPointerMove,
    onPointerOver,
    onPointerUp,
    touchMode,
  ]);

  const tooltipFrustum = tooltipData !== null ? frustums[tooltipData.instanceId] : null;

  return {
    tooltipData,
    tooltipFrustum,
    interactionHandlers,
  };
}
