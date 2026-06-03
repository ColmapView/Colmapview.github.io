import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { MODAL, SIZE, TIMING } from '../../theme';
import type { Camera, ImageId } from '../../types/colmap';
import {
  startCapturedPointerDrag,
  type CapturedPointerDragStartEvent,
} from '../../utils/capturedPointerDrag';
import type { ResizeDirection } from './imageDetailResizeHandlesViewModel';
import {
  clampPositionToViewport,
  getInitialImageModalBounds,
  type ModalBounds,
  resizeModalBounds,
  type Size2D,
} from './imageDetailLayoutViewModel';
import { useResetKeyedState } from '../../hooks/useResetKeyedState';

const MIN_WIDTH = SIZE.modalMinWidth;
const MIN_HEIGHT = SIZE.modalMinHeight;
const RESIZE_DEBOUNCE_MS = TIMING.resizeDebounce;
const CLOSED_LAYOUT_RESET_KEY = 'closed';
const OPEN_LAYOUT_RESET_KEY = 'open';

const DEFAULT_IMAGE_MODAL_BOUNDS: ModalBounds = {
  position: { x: 0, y: 0 },
  size: { width: 800, height: 600 },
};

interface UseImageDetailModalLayoutOptions {
  camera: Camera | null | undefined;
  imageDetailId: ImageId | null;
}

interface ImageDetailPointerStartEvent extends CapturedPointerDragStartEvent {
  clientX: number;
  clientY: number;
}

function getLayoutResetKey(imageDetailId: ImageId | null): string {
  return imageDetailId === null ? CLOSED_LAYOUT_RESET_KEY : OPEN_LAYOUT_RESET_KEY;
}

function getInitialModalBounds(camera: Camera | null | undefined, imageDetailId: ImageId | null): ModalBounds {
  if (!camera || imageDetailId === null) return DEFAULT_IMAGE_MODAL_BOUNDS;

  return getInitialImageModalBounds(
    camera,
    { width: window.innerWidth, height: window.innerHeight },
    {
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      maxWidthPercent: MODAL.maxWidthPercent,
      maxHeightPercent: MODAL.maxHeightPercent,
      headerHeight: MODAL.headerHeight,
      footerHeight: MODAL.footerHeight,
      padding: MODAL.padding,
    }
  );
}

export function useImageDetailModalLayout({
  camera,
  imageDetailId,
}: UseImageDetailModalLayoutOptions) {
  const [containerSize, setContainerSize] = useState<Size2D>({ width: 0, height: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const resetKey = getLayoutResetKey(imageDetailId);
  const initialBounds = getInitialModalBounds(camera, imageDetailId);
  const [position, setPosition] = useResetKeyedState(resetKey, initialBounds.position);
  const [size, setSize] = useResetKeyedState(resetKey, initialBounds.size);
  const positionRef = useRef(position);
  const sizeRef = useRef(size);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { sizeRef.current = size; }, [size]);

  const handleDragStart = useCallback((event: ImageDetailPointerStartEvent) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosX = positionRef.current.x;
    const startPosY = positionRef.current.y;

    const onMove = (moveEvent: PointerEvent) => {
      setPosition({
        x: startPosX + moveEvent.clientX - startX,
        y: startPosY + moveEvent.clientY - startY,
      });
    };
    startCapturedPointerDrag({ event, onMove });
  }, [setPosition]);

  const handleResizeStart = useCallback((
    event: ImageDetailPointerStartEvent,
    direction: ResizeDirection
  ) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = sizeRef.current.width;
    const startH = sizeRef.current.height;
    const startPosX = positionRef.current.x;
    const startPosY = positionRef.current.y;

    const onMove = (moveEvent: PointerEvent) => {
      const nextBounds = resizeModalBounds({
        startPointer: { x: startX, y: startY },
        currentPointer: { x: moveEvent.clientX, y: moveEvent.clientY },
        startSize: { width: startW, height: startH },
        startPosition: { x: startPosX, y: startPosY },
        direction,
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
      });

      setSize(nextBounds.size);
      setPosition(nextBounds.position);
    };
    startCapturedPointerDrag({ event, onMove, stopPropagation: true });
  }, [setPosition, setSize]);

  useEffect(() => {
    if (imageDetailId === null) return;

    const handleWindowResize = () => {
      setPosition((previous) => clampPositionToViewport(
        previous,
        { width: size.width, height: size.height },
        { width: window.innerWidth, height: window.innerHeight }
      ));
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [imageDetailId, setPosition, size.width, size.height]);

  const updateContainerSize = useCallback(() => {
    if (imageContainerRef.current) {
      setContainerSize({
        width: imageContainerRef.current.clientWidth,
        height: imageContainerRef.current.clientHeight,
      });
    }
  }, []);

  useEffect(() => {
    if (!imageContainerRef.current) return;

    updateContainerSize();

    const observer = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(updateContainerSize, RESIZE_DEBOUNCE_MS);
    });

    observer.observe(imageContainerRef.current);
    return () => {
      observer.disconnect();
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [updateContainerSize, imageDetailId]);

  return {
    containerSize,
    handleDragStart,
    handleResizeStart,
    imageContainerRef,
    position,
    size,
  };
}
