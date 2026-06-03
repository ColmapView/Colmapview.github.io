import type { MouseEvent } from 'react';
import type { Camera, Image, Point2D } from '../../types/colmap';
import { getMatchImagePairRenderState } from './imageDetailMatchImagePairViewModel';
import type { MatchViewLayout, SingleImageLayout, Size2D } from './imageDetailLayoutViewModel';
import type { MaskMode } from './imageDetailMaskViewModel';
import { getSingleImageViewRenderState } from './imageDetailSingleImageViewModel';
import type { MatchLine } from './imageDetailViewModel';
import {
  DeletedCrossOverlay,
  ImagePlaceholder,
  KeypointCanvas,
  MatchCanvas,
} from './ImageDetailMedia';

interface MatchImagePairProps {
  image: Image;
  camera: Camera;
  imageSrc: string | null;
  matchedImage: Image | null;
  matchedCamera: Camera | null;
  matchedImageSrc: string | null;
  layout: MatchViewLayout;
  containerSize: Size2D;
  matchLines: MatchLine[];
  matchLineOpacity: number;
}

export function MatchImagePair({
  image,
  camera,
  imageSrc,
  matchedImage,
  matchedCamera,
  matchedImageSrc,
  layout,
  containerSize,
  matchLines,
  matchLineOpacity,
}: MatchImagePairProps) {
  const { image1, image2 } = layout;
  const viewState = getMatchImagePairRenderState({
    layout,
    hasImageSrc: Boolean(imageSrc),
    hasMatchedImageSrc: Boolean(matchedImageSrc),
    hasMatchedCamera: Boolean(matchedCamera),
    matchLineCount: matchLines.length,
  });

  return (
    <>
      {viewState.primaryImage.showImage && (
        <img
          src={imageSrc ?? ''}
          alt={image.name}
          className="absolute object-contain"
          style={viewState.primaryImage.imageStyle}
          draggable={false}
        />
      )}
      {viewState.primaryImage.showPlaceholder && (
        <ImagePlaceholder
          width={image1.width}
          height={image1.height}
          cameraWidth={camera.width}
          cameraHeight={camera.height}
          label={image.name}
          style={viewState.primaryImage.placeholderStyle}
        />
      )}
      {viewState.matchedImage.showImage && (
        <img
          src={matchedImageSrc ?? ''}
          alt={matchedImage?.name || ''}
          className="absolute object-contain"
          style={viewState.matchedImage.imageStyle}
          draggable={false}
        />
      )}
      {matchedCamera && viewState.matchedImage.showPlaceholder && (
        <ImagePlaceholder
          width={image2.width}
          height={image2.height}
          cameraWidth={matchedCamera.width}
          cameraHeight={matchedCamera.height}
          label={matchedImage?.name}
          style={viewState.matchedImage.placeholderStyle}
        />
      )}
      {viewState.showMatchLines && (
        <MatchCanvas
          lines={matchLines}
          layout={layout}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          lineOpacity={matchLineOpacity}
        />
      )}
    </>
  );
}

interface SingleImageViewProps {
  image: Image;
  camera: Camera;
  imageSrc: string | null;
  maskSrc?: string | null;
  layout: SingleImageLayout;
  containerSize: Size2D;
  isMarkedForDeletion: boolean;
  showPoints2D: boolean;
  showPoints3D: boolean;
  points2D: Point2D[];
  maskMode?: MaskMode;
  splitX?: number;
  maskEnabled?: boolean;
  onMaskClick?: () => void;
  onMaskMouseMove?: (event: MouseEvent<HTMLDivElement>) => void;
  onMaskMouseLeave?: () => void;
}

export function SingleImageView({
  image,
  camera,
  imageSrc,
  maskSrc = null,
  layout,
  containerSize,
  isMarkedForDeletion,
  showPoints2D,
  showPoints3D,
  points2D,
  maskMode = 'hover',
  splitX = 0.5,
  maskEnabled = false,
  onMaskClick,
  onMaskMouseMove,
  onMaskMouseLeave,
}: SingleImageViewProps) {
  const { renderedImageWidth, renderedImageHeight } = layout;
  const viewState = getSingleImageViewRenderState({
    layout,
    isMarkedForDeletion,
    showPoints2D,
    showPoints3D,
    pointCount: points2D.length,
    maskMode,
    splitX,
    maskEnabled,
    hasMaskSrc: Boolean(maskSrc),
  });

  return (
    <div
      className="group absolute inset-0"
      onClick={viewState.canShowMask ? onMaskClick : undefined}
      onMouseMove={viewState.canShowMask ? onMaskMouseMove : undefined}
      onMouseLeave={viewState.canShowMask ? onMaskMouseLeave : undefined}
      style={viewState.containerStyle}
    >
      {viewState.canShowRenderedArea && (imageSrc ? (
        <>
          <img
            src={imageSrc}
            alt={image.name}
            className="absolute object-contain pointer-events-none"
            style={viewState.imageStyle}
            draggable={false}
          />
          {viewState.showDeletedOverlay && (
            <DeletedCrossOverlay
              width={renderedImageWidth}
              height={renderedImageHeight}
              style={viewState.mediaOverlayStyle}
            />
          )}
          {viewState.canShowMask && (
            <img
              src={maskSrc ?? ''}
              alt="mask"
              className={viewState.maskClassName}
              style={viewState.maskStyle}
              draggable={false}
            />
          )}
        </>
      ) : (
        <ImagePlaceholder
          width={renderedImageWidth}
          height={renderedImageHeight}
          cameraWidth={camera.width}
          cameraHeight={camera.height}
          label="No image loaded"
          style={viewState.mediaOverlayStyle}
        />
      ))}
      {viewState.showKeypoints && (
        <KeypointCanvas
          points2D={points2D}
          camera={camera}
          imageWidth={renderedImageWidth}
          imageHeight={renderedImageHeight}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          showPoints2D={showPoints2D}
          showPoints3D={showPoints3D}
        />
      )}
    </div>
  );
}
