import type { Camera } from '../../types/colmap';
import type { ResizeDirection } from './imageDetailResizeHandlesViewModel';

export interface Size2D {
  width: number;
  height: number;
}

export interface Position2D {
  x: number;
  y: number;
}

export interface ModalBounds {
  position: Position2D;
  size: Size2D;
}

export interface ImageModalSizingOptions {
  minWidth: number;
  minHeight: number;
  maxWidthPercent: number;
  maxHeightPercent: number;
  headerHeight: number;
  footerHeight: number;
  padding: number;
}

export interface ResizeModalBoundsOptions {
  startPointer: Position2D;
  currentPointer: Position2D;
  startSize: Size2D;
  startPosition: Position2D;
  direction: ResizeDirection;
  minWidth: number;
  minHeight: number;
}

export function getInitialImageModalBounds(
  camera: Camera,
  viewportSize: Size2D,
  {
    minWidth,
    minHeight,
    maxWidthPercent,
    maxHeightPercent,
    headerHeight,
    footerHeight,
    padding,
  }: ImageModalSizingOptions
): ModalBounds {
  const maxWidth = Math.round(viewportSize.width * maxWidthPercent);
  const maxHeight = Math.round(viewportSize.height * maxHeightPercent);
  const chromeHeight = headerHeight + footerHeight + padding;
  const chromeWidth = padding;
  const availableWidth = maxWidth - chromeWidth;
  const availableHeight = maxHeight - chromeHeight;
  const imageAspect = camera.width / camera.height;
  const availableAspect = availableWidth / availableHeight;

  const imageSize = imageAspect > availableAspect
    ? {
        width: availableWidth,
        height: availableWidth / imageAspect,
      }
    : {
        width: availableHeight * imageAspect,
        height: availableHeight,
      };

  const width = Math.max(minWidth, Math.round(imageSize.width + chromeWidth));
  const height = Math.max(minHeight, Math.round(imageSize.height + chromeHeight));

  return {
    size: { width, height },
    position: {
      x: (viewportSize.width - width) / 2,
      y: (viewportSize.height - height) / 2,
    },
  };
}

export function resizeModalBounds({
  startPointer,
  currentPointer,
  startSize,
  startPosition,
  direction,
  minWidth,
  minHeight,
}: ResizeModalBoundsOptions): ModalBounds {
  const dx = currentPointer.x - startPointer.x;
  const dy = currentPointer.y - startPointer.y;

  let width = startSize.width;
  let height = startSize.height;
  let x = startPosition.x;
  let y = startPosition.y;

  if (direction.includes('e')) {
    width = Math.max(minWidth, startSize.width + dx);
  }
  if (direction.includes('w')) {
    const proposedWidth = startSize.width - dx;
    if (proposedWidth >= minWidth) {
      width = proposedWidth;
      x = startPosition.x + dx;
    }
  }
  if (direction.includes('s')) {
    height = Math.max(minHeight, startSize.height + dy);
  }
  if (direction.includes('n')) {
    const proposedHeight = startSize.height - dy;
    if (proposedHeight >= minHeight) {
      height = proposedHeight;
      y = startPosition.y + dy;
    }
  }

  return {
    size: { width, height },
    position: { x, y },
  };
}

export function clampPositionToViewport(position: Position2D, size: Size2D, viewportSize: Size2D): Position2D {
  return {
    x: Math.max(0, Math.min(position.x, viewportSize.width - size.width)),
    y: Math.max(0, Math.min(position.y, viewportSize.height - size.height)),
  };
}
