import type { CSSProperties } from 'react';

interface CenteredCanvasOverlayStateOptions {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
}

interface SizedCanvasOverlayStateOptions {
  width: number;
  height: number;
  style?: CSSProperties;
}

interface CanvasOverlayState {
  canRender: boolean;
  width: number;
  height: number;
  style: CSSProperties;
}

export function getCenteredCanvasOverlayState({
  imageWidth,
  imageHeight,
  containerWidth,
  containerHeight,
}: CenteredCanvasOverlayStateOptions): CanvasOverlayState {
  return {
    canRender: imageWidth > 0 && imageHeight > 0,
    width: imageWidth,
    height: imageHeight,
    style: {
      left: (containerWidth - imageWidth) / 2,
      top: (containerHeight - imageHeight) / 2,
    },
  };
}

export function getSizedCanvasOverlayState({
  width,
  height,
  style,
}: SizedCanvasOverlayStateOptions): CanvasOverlayState {
  return {
    canRender: width > 0 && height > 0,
    width,
    height,
    style: { ...style, width, height },
  };
}
