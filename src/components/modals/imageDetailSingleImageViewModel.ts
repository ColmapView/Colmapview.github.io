import type { CSSProperties } from 'react';
import type { SingleImageLayout } from './imageDetailLayoutViewModel';
import type { MaskMode } from './imageDetailMaskViewModel';

interface SingleImageViewRenderStateOptions {
  layout: SingleImageLayout;
  isMarkedForDeletion: boolean;
  showPoints2D: boolean;
  showPoints3D: boolean;
  pointCount: number;
  maskMode: MaskMode;
  splitX: number;
  maskEnabled: boolean;
  hasMaskSrc: boolean;
}

interface SingleImageViewRenderState {
  canShowRenderedArea: boolean;
  canShowMask: boolean;
  showDeletedOverlay: boolean;
  showKeypoints: boolean;
  containerStyle: CSSProperties;
  imageStyle: CSSProperties;
  mediaOverlayStyle: CSSProperties;
  maskClassName: string;
  maskStyle: CSSProperties;
}

export function getSingleImageViewRenderState({
  layout,
  isMarkedForDeletion,
  showPoints2D,
  showPoints3D,
  pointCount,
  maskMode,
  splitX,
  maskEnabled,
  hasMaskSrc,
}: SingleImageViewRenderStateOptions): SingleImageViewRenderState {
  const { renderedImageWidth, renderedImageHeight, offsetX, offsetY } = layout;
  const canShowRenderedArea = renderedImageWidth > 0;
  const canShowMask = maskEnabled && hasMaskSrc && !isMarkedForDeletion;
  const mediaOverlayStyle = {
    position: 'absolute',
    left: offsetX,
    top: offsetY,
  } satisfies CSSProperties;

  return {
    canShowRenderedArea,
    canShowMask,
    showDeletedOverlay: canShowRenderedArea && isMarkedForDeletion,
    showKeypoints: !isMarkedForDeletion
      && (showPoints2D || showPoints3D)
      && canShowRenderedArea
      && pointCount > 0,
    containerStyle: { cursor: canShowMask ? 'pointer' : undefined },
    imageStyle: {
      width: renderedImageWidth,
      height: renderedImageHeight,
      left: offsetX,
      top: offsetY,
      opacity: maskMode === 'mask' ? 0 : 1,
      clipPath: maskMode === 'split' ? `inset(0 ${(1 - splitX) * 100}% 0 0)` : undefined,
      filter: isMarkedForDeletion ? 'grayscale(100%)' : undefined,
    },
    mediaOverlayStyle,
    maskClassName: `absolute object-contain pointer-events-none${
      maskMode === 'hover' ? ' opacity-0 group-hover:opacity-50' : ''
    }`,
    maskStyle: {
      width: renderedImageWidth,
      height: renderedImageHeight,
      left: offsetX,
      top: offsetY,
      ...(maskMode !== 'hover' && {
        opacity: maskMode === 'image' ? 0 : 1,
      }),
      clipPath: maskMode === 'split' ? `inset(0 0 0 ${splitX * 100}%)` : undefined,
    },
  };
}
