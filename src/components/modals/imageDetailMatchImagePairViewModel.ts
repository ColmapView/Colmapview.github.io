import type { CSSProperties } from 'react';
import type { ImagePlacement, MatchViewLayout } from './imageDetailLayoutViewModel';

interface MatchImagePairRenderStateOptions {
  layout: MatchViewLayout;
  hasImageSrc: boolean;
  hasMatchedImageSrc: boolean;
  hasMatchedCamera: boolean;
  matchLineCount: number;
}

interface MatchImageRenderState {
  canRender: boolean;
  showImage: boolean;
  showPlaceholder: boolean;
  imageStyle: CSSProperties;
  placeholderStyle: CSSProperties;
}

interface MatchImagePairRenderState {
  primaryImage: MatchImageRenderState;
  matchedImage: MatchImageRenderState;
  showMatchLines: boolean;
}

export function getMatchImagePairRenderState({
  layout,
  hasImageSrc,
  hasMatchedImageSrc,
  hasMatchedCamera,
  matchLineCount,
}: MatchImagePairRenderStateOptions): MatchImagePairRenderState {
  return {
    primaryImage: getMatchImageRenderState({
      placement: layout.image1,
      canRenderPlacement: layout.image1.width > 0,
      hasSource: hasImageSrc,
    }),
    matchedImage: getMatchImageRenderState({
      placement: layout.image2,
      canRenderPlacement: layout.image2.width > 0 && hasMatchedCamera,
      hasSource: hasMatchedImageSrc,
    }),
    showMatchLines: matchLineCount > 0 && layout.image1.width > 0 && layout.image2.width > 0,
  };
}

function getMatchImageRenderState({
  placement,
  canRenderPlacement,
  hasSource,
}: {
  placement: ImagePlacement;
  canRenderPlacement: boolean;
  hasSource: boolean;
}): MatchImageRenderState {
  return {
    canRender: canRenderPlacement,
    showImage: canRenderPlacement && hasSource,
    showPlaceholder: canRenderPlacement && !hasSource,
    imageStyle: {
      width: placement.width,
      height: placement.height,
      left: placement.offsetX,
      top: placement.offsetY,
    },
    placeholderStyle: {
      position: 'absolute',
      left: placement.offsetX,
      top: placement.offsetY,
    },
  };
}
