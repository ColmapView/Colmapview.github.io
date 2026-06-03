import type { Camera } from '../../types/colmap';
import type { Size2D } from './imageDetailModalBoundsPolicy';

export {
  clampPositionToViewport,
  getInitialImageModalBounds,
  resizeModalBounds,
  type ImageModalSizingOptions,
  type ModalBounds,
  type Position2D,
  type ResizeModalBoundsOptions,
  type Size2D,
} from './imageDetailModalBoundsPolicy';

export interface SingleImageDimensions {
  renderedImageWidth: number;
  renderedImageHeight: number;
}

export interface MatchViewDimensions {
  image1Width: number;
  image1Height: number;
  image2Width: number;
  image2Height: number;
}

export interface ImagePlacement {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

export interface SingleImageLayout extends ImagePlacement {
  renderedImageWidth: number;
  renderedImageHeight: number;
}

export interface MatchViewLayout {
  image1: ImagePlacement;
  image2: ImagePlacement;
}

const EMPTY_MATCH_VIEW_DIMENSIONS: MatchViewDimensions = {
  image1Width: 0,
  image1Height: 0,
  image2Width: 0,
  image2Height: 0,
};

const EMPTY_IMAGE_PLACEMENT: ImagePlacement = {
  width: 0,
  height: 0,
  offsetX: 0,
  offsetY: 0,
  scaleX: 0,
  scaleY: 0,
};

const EMPTY_MATCH_VIEW_LAYOUT: MatchViewLayout = {
  image1: EMPTY_IMAGE_PLACEMENT,
  image2: EMPTY_IMAGE_PLACEMENT,
};

export function fitSingleImageDimensions(
  camera: Camera | null | undefined,
  containerSize: Size2D
): SingleImageDimensions {
  if (!camera || camera.width <= 0 || camera.height <= 0 || containerSize.width <= 0 || containerSize.height <= 0) {
    return { renderedImageWidth: 0, renderedImageHeight: 0 };
  }

  const originalAspect = camera.width / camera.height;
  const containerAspect = containerSize.width / containerSize.height;

  if (originalAspect > containerAspect) {
    return {
      renderedImageWidth: containerSize.width,
      renderedImageHeight: containerSize.width / originalAspect,
    };
  }

  return {
    renderedImageHeight: containerSize.height,
    renderedImageWidth: containerSize.height * originalAspect,
  };
}

export function getSingleImageLayout(
  camera: Camera | null | undefined,
  containerSize: Size2D
): SingleImageLayout {
  const { renderedImageWidth, renderedImageHeight } = fitSingleImageDimensions(camera, containerSize);
  const offsetX = (containerSize.width - renderedImageWidth) / 2;
  const offsetY = (containerSize.height - renderedImageHeight) / 2;
  const scaleX = camera && camera.width > 0 ? renderedImageWidth / camera.width : 0;
  const scaleY = camera && camera.height > 0 ? renderedImageHeight / camera.height : 0;

  return {
    width: renderedImageWidth,
    height: renderedImageHeight,
    renderedImageWidth,
    renderedImageHeight,
    offsetX,
    offsetY,
    scaleX,
    scaleY,
  };
}

export function fitSideBySideDimensions(
  camera: Camera | null | undefined,
  matchedCamera: Camera | null | undefined,
  containerSize: Size2D,
  gap: number
): MatchViewDimensions {
  if (
    !camera ||
    !matchedCamera ||
    camera.width <= 0 ||
    camera.height <= 0 ||
    matchedCamera.width <= 0 ||
    matchedCamera.height <= 0 ||
    containerSize.width <= gap ||
    containerSize.height <= 0
  ) {
    return EMPTY_MATCH_VIEW_DIMENSIONS;
  }

  const halfWidth = (containerSize.width - gap) / 2;
  const height = containerSize.height;
  const containerAspect = halfWidth / height;

  const image1 = fitIntoBox(camera, halfWidth, height, containerAspect);
  const image2 = fitIntoBox(matchedCamera, halfWidth, height, containerAspect);

  return {
    image1Width: image1.width,
    image1Height: image1.height,
    image2Width: image2.width,
    image2Height: image2.height,
  };
}

export function getSideBySideMatchLayout(
  camera: Camera | null | undefined,
  matchedCamera: Camera | null | undefined,
  containerSize: Size2D,
  gap: number
): MatchViewLayout {
  const dimensions = fitSideBySideDimensions(camera, matchedCamera, containerSize, gap);
  if (!camera || !matchedCamera || dimensions.image1Width <= 0 || dimensions.image2Width <= 0) {
    return EMPTY_MATCH_VIEW_LAYOUT;
  }

  const halfWidth = (containerSize.width - gap) / 2;
  return {
    image1: buildPlacement(camera, dimensions.image1Width, dimensions.image1Height, {
      offsetX: (halfWidth - dimensions.image1Width) / 2,
      offsetY: (containerSize.height - dimensions.image1Height) / 2,
    }),
    image2: buildPlacement(matchedCamera, dimensions.image2Width, dimensions.image2Height, {
      offsetX: halfWidth + gap + (halfWidth - dimensions.image2Width) / 2,
      offsetY: (containerSize.height - dimensions.image2Height) / 2,
    }),
  };
}

export function fitVerticalStackedDimensions(
  camera: Camera | null | undefined,
  matchedCamera: Camera | null | undefined,
  containerSize: Size2D,
  gap: number
): MatchViewDimensions {
  if (
    !camera ||
    !matchedCamera ||
    camera.width <= 0 ||
    camera.height <= 0 ||
    matchedCamera.width <= 0 ||
    matchedCamera.height <= 0 ||
    containerSize.width <= 0 ||
    containerSize.height <= gap
  ) {
    return EMPTY_MATCH_VIEW_DIMENSIONS;
  }

  const halfHeight = (containerSize.height - gap) / 2;
  const width = containerSize.width;
  const containerAspect = width / halfHeight;

  const image1 = fitIntoBox(camera, width, halfHeight, containerAspect);
  const image2 = fitIntoBox(matchedCamera, width, halfHeight, containerAspect);

  return {
    image1Width: image1.width,
    image1Height: image1.height,
    image2Width: image2.width,
    image2Height: image2.height,
  };
}

export function getVerticalStackedMatchLayout(
  camera: Camera | null | undefined,
  matchedCamera: Camera | null | undefined,
  containerSize: Size2D,
  gap: number
): MatchViewLayout {
  const dimensions = fitVerticalStackedDimensions(camera, matchedCamera, containerSize, gap);
  if (!camera || !matchedCamera || dimensions.image1Width <= 0 || dimensions.image2Width <= 0) {
    return EMPTY_MATCH_VIEW_LAYOUT;
  }

  const halfHeight = (containerSize.height - gap) / 2;
  return {
    image1: buildPlacement(camera, dimensions.image1Width, dimensions.image1Height, {
      offsetX: (containerSize.width - dimensions.image1Width) / 2,
      offsetY: (halfHeight - dimensions.image1Height) / 2,
    }),
    image2: buildPlacement(matchedCamera, dimensions.image2Width, dimensions.image2Height, {
      offsetX: (containerSize.width - dimensions.image2Width) / 2,
      offsetY: halfHeight + gap + (halfHeight - dimensions.image2Height) / 2,
    }),
  };
}

function fitIntoBox(
  camera: Camera,
  boxWidth: number,
  boxHeight: number,
  boxAspect: number
): Size2D {
  const aspect = camera.width / camera.height;
  const width = aspect > boxAspect ? boxWidth : boxHeight * aspect;
  const height = aspect > boxAspect ? boxWidth / aspect : boxHeight;

  return { width, height };
}

function buildPlacement(
  camera: Camera,
  width: number,
  height: number,
  { offsetX, offsetY }: Pick<ImagePlacement, 'offsetX' | 'offsetY'>
): ImagePlacement {
  return {
    width,
    height,
    offsetX,
    offsetY,
    scaleX: width / camera.width,
    scaleY: height / camera.height,
  };
}
