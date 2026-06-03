import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
  type TouchList,
} from 'react';
import type { ImageId } from '../../types/colmap';
import type { ConnectedImageOption } from './imageDetailViewModel';
import {
  getCycledMatchedImageId,
  getImageTouchGesture,
  getImageTouchNavigationAction,
  getImageWheelNavigationPlan,
  shouldPreventTouchScroll,
  type ImageDetailNavigationAction,
  type ImageNavigationDirection,
  type TouchGestureStart,
} from './imageDetailNavigationViewModel';

const DEFAULT_WHEEL_THROTTLE_MS = 100;

interface UseImageDetailNavigationHandlersOptions {
  imageContainerRef: RefObject<HTMLDivElement | null>;
  showMatchesInModal: boolean;
  connectedImages: ConnectedImageOption[];
  matchedImageId: ImageId | null;
  hasMask: boolean;
  maskSrc: string | null;
  isMarkedForDeletion: boolean;
  onCycleMaskMode: () => void;
  onPreviousImage: () => void;
  onNextImage: () => void;
  onSetMatchedImageId: (imageId: ImageId) => void;
  wheelThrottleMs?: number;
  now?: () => number;
}

interface MatchedImageWheelEvent {
  deltaY: number;
  stopPropagation: () => void;
}

interface ImageTouchStartEvent {
  touches: TouchList;
}

interface ImageTouchMoveEvent {
  touches: TouchList;
  preventDefault: () => void;
}

interface ImageTouchEndEvent {
  changedTouches: TouchList;
}

export function useImageDetailNavigationHandlers({
  imageContainerRef,
  showMatchesInModal,
  connectedImages,
  matchedImageId,
  hasMask,
  maskSrc,
  isMarkedForDeletion,
  onCycleMaskMode,
  onPreviousImage,
  onNextImage,
  onSetMatchedImageId,
  wheelThrottleMs = DEFAULT_WHEEL_THROTTLE_MS,
  now = Date.now,
}: UseImageDetailNavigationHandlersOptions) {
  const touchStartRef = useRef<TouchGestureStart | null>(null);
  const lastWheelTime = useRef(0);

  const cycleMatchedImage = useCallback((direction: ImageNavigationDirection) => {
    const nextImageId = getCycledMatchedImageId(connectedImages, matchedImageId, direction);
    if (nextImageId !== null) {
      onSetMatchedImageId(nextImageId);
    }
  }, [connectedImages, matchedImageId, onSetMatchedImageId]);

  const runNavigationAction = useCallback((action: ImageDetailNavigationAction | null) => {
    if (!action) return;

    if (action.type === 'cycleMask') {
      onCycleMaskMode();
      return;
    }

    if (action.type === 'image') {
      if (action.direction > 0) {
        onNextImage();
      } else {
        onPreviousImage();
      }
      return;
    }

    cycleMatchedImage(action.direction);
  }, [cycleMatchedImage, onCycleMaskMode, onNextImage, onPreviousImage]);

  const handleMatchedImageWheel = useCallback((event: MatchedImageWheelEvent) => {
    event.stopPropagation();
    runNavigationAction({
      type: 'match',
      direction: event.deltaY > 0 ? 1 : -1,
    });
  }, [runNavigationAction]);

  const handleTouchStart = useCallback((event: ImageTouchStartEvent) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now() };
  }, [now]);

  const handleTouchMove = useCallback((event: ImageTouchMoveEvent) => {
    if (!touchStartRef.current || event.touches.length !== 1) return;

    if (shouldPreventTouchScroll(touchStartRef.current, {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    })) {
      event.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback((event: ImageTouchEndEvent) => {
    if (!touchStartRef.current || event.changedTouches.length !== 1) {
      touchStartRef.current = null;
      return;
    }

    const touch = event.changedTouches[0];
    const gesture = getImageTouchGesture(
      touchStartRef.current,
      { x: touch.clientX, y: touch.clientY },
      now(),
      showMatchesInModal
    );
    touchStartRef.current = null;

    runNavigationAction(getImageTouchNavigationAction({
      gesture,
      hasMask,
      hasMaskSrc: !!maskSrc,
      isMarkedForDeletion,
      showMatchesInModal,
    }));
  }, [hasMask, isMarkedForDeletion, maskSrc, now, runNavigationAction, showMatchesInModal]);

  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const plan = getImageWheelNavigationPlan({
        deltaY: event.deltaY,
        now: now(),
        lastWheelTime: lastWheelTime.current,
        throttleMs: wheelThrottleMs,
        showMatchesInModal,
        hasConnectedImages: connectedImages.length > 0,
      });
      lastWheelTime.current = plan.nextLastWheelTime;
      runNavigationAction(plan.action);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [
    connectedImages.length,
    imageContainerRef,
    now,
    runNavigationAction,
    showMatchesInModal,
    wheelThrottleMs,
  ]);

  return {
    cycleMatchedImage,
    handleMatchedImageWheel,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
  };
}
