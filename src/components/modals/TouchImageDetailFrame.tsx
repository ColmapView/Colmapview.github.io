import type { RefObject, TouchEventHandler } from 'react';
import type { Camera, Image, ImageId, Point2D } from '../../types/colmap';
import { TouchImageControls } from './ImageDetailControls';
import { TouchImageDetailHeader } from './ImageDetailModalHeader';
import { MatchImagePair, SingleImageView } from './ImageDetailViews';
import { TOUCH_IMAGE_DETAIL_FRAME_CLASS } from './imageDetailFrameViewModel';
import type { MatchViewLayout, SingleImageLayout, Size2D } from './imageDetailLayoutViewModel';
import type {
  ConnectedImageOption,
  MatchLine,
} from './imageDetailViewModel';

interface TouchImageDetailFrameProps {
  camera: Camera;
  closeImageDetail: () => void;
  connectedImages: ConnectedImageOption[];
  containerSize: Size2D;
  currentIndex: number;
  effectivePoints2D: Point2D[];
  handleTouchEnd: TouchEventHandler<HTMLDivElement>;
  handleTouchMove: TouchEventHandler<HTMLDivElement>;
  handleTouchStart: TouchEventHandler<HTMLDivElement>;
  hasNext: boolean;
  hasPrev: boolean;
  image: Image;
  imageContainerRef: RefObject<HTMLDivElement | null>;
  imageIds: ImageId[];
  imageSrc: string | null;
  isMarkedForDeletion: boolean;
  isMatchViewMode: boolean;
  matchLineOpacity: number;
  matchLines: MatchLine[];
  matchedCamera: Camera | null | undefined;
  matchedImage: Image | null;
  matchedImageId: ImageId | null;
  matchedImageSrc: string | null;
  numPoints2D: number;
  numPoints3D: number;
  setMatchedImageId: (imageId: ImageId | null) => void;
  setMatchLineOpacity: (opacity: number) => void;
  setShowMatchesInModal: (show: boolean) => void;
  setShowPoints2D: (show: boolean) => void;
  setShowPoints3D: (show: boolean) => void;
  showMatchesInModal: boolean;
  showModalControls: boolean;
  showPoints2D: boolean;
  showPoints3D: boolean;
  singleImageLayout: SingleImageLayout;
  verticalStackedLayout: MatchViewLayout;
  onNext: () => void;
  onPrev: () => void;
}

export function TouchImageDetailFrame({
  camera,
  closeImageDetail,
  connectedImages,
  containerSize,
  currentIndex,
  effectivePoints2D,
  handleTouchEnd,
  handleTouchMove,
  handleTouchStart,
  hasNext,
  hasPrev,
  image,
  imageContainerRef,
  imageIds,
  imageSrc,
  isMarkedForDeletion,
  isMatchViewMode,
  matchLineOpacity,
  matchLines,
  matchedCamera,
  matchedImage,
  matchedImageId,
  matchedImageSrc,
  numPoints2D,
  numPoints3D,
  setMatchedImageId,
  setMatchLineOpacity,
  setShowMatchesInModal,
  setShowPoints2D,
  setShowPoints3D,
  showMatchesInModal,
  showModalControls,
  showPoints2D,
  showPoints3D,
  singleImageLayout,
  verticalStackedLayout,
  onNext,
  onPrev,
}: TouchImageDetailFrameProps) {
  return (
    <div className={TOUCH_IMAGE_DETAIL_FRAME_CLASS}>
      <TouchImageDetailHeader
        camera={camera}
        closeImageDetail={closeImageDetail}
        image={image}
        isMarkedForDeletion={isMarkedForDeletion}
        isMatchViewMode={isMatchViewMode}
        matchedImage={matchedImage}
      />

      <div
        ref={imageContainerRef}
        className="flex-1 min-h-0 bg-ds-secondary relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isMatchViewMode ? (
          <MatchImagePair
            image={image}
            camera={camera}
            imageSrc={imageSrc}
            matchedImage={matchedImage}
            matchedCamera={matchedCamera ?? null}
            matchedImageSrc={matchedImageSrc}
            layout={verticalStackedLayout}
            containerSize={containerSize}
            matchLines={matchLines}
            matchLineOpacity={matchLineOpacity}
          />
        ) : (
          <SingleImageView
            image={image}
            camera={camera}
            imageSrc={imageSrc}
            layout={singleImageLayout}
            containerSize={containerSize}
            isMarkedForDeletion={isMarkedForDeletion}
            showPoints2D={showPoints2D}
            showPoints3D={showPoints3D}
            points2D={effectivePoints2D}
          />
        )}
      </div>

      {showModalControls && (
        <TouchImageControls
          isMarkedForDeletion={isMarkedForDeletion}
          showPoints2D={showPoints2D}
          showPoints3D={showPoints3D}
          showMatchesInModal={showMatchesInModal}
          matchedImageId={matchedImageId}
          connectedImages={connectedImages}
          numPoints2D={numPoints2D}
          numPoints3D={numPoints3D}
          matchLineOpacity={matchLineOpacity}
          hasPrev={hasPrev}
          hasNext={hasNext}
          currentIndex={currentIndex}
          imageCount={imageIds.length}
          setShowPoints2D={setShowPoints2D}
          setShowPoints3D={setShowPoints3D}
          setShowMatchesInModal={setShowMatchesInModal}
          setMatchedImageId={setMatchedImageId}
          setMatchLineOpacity={setMatchLineOpacity}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}
    </div>
  );
}
