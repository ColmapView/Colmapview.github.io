import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  RefObject,
  WheelEvent,
} from 'react';
import { modalStyles } from '../../theme';
import type { Camera, Image, ImageId, Point2D } from '../../types/colmap';
import { CameraPoseInfoDisplay } from './ImageDetailMedia';
import { DesktopImageControls } from './ImageDetailControls';
import { DesktopImageDetailHeader } from './ImageDetailModalHeader';
import { DesktopImageDetailResizeHandles, type ResizeDirection } from './ImageDetailResizeHandles';
import { MatchImagePair, SingleImageView } from './ImageDetailViews';
import { getImageDetailFrameHintState } from './imageDetailFrameHintsViewModel';
import {
  DESKTOP_IMAGE_DETAIL_FRAME_CLASS,
  getDesktopImageDetailPanelStyle,
  isImageDetailMaskInteractionEnabled,
} from './imageDetailFrameViewModel';
import type { MatchViewLayout, SingleImageLayout, Size2D } from './imageDetailLayoutViewModel';
import type { MaskMode } from './imageDetailMaskViewModel';
import type {
  ConnectedImageOption,
  MatchLine,
} from './imageDetailViewModel';
import { ModalErrorBoundary } from './ModalErrorBoundary';

interface DesktopImageDetailFrameProps {
  camera: Camera;
  cameraAllMarked: boolean;
  closeImageDetail: () => void;
  connectedImages: ConnectedImageOption[];
  containerSize: Size2D;
  currentMatchCount: number;
  cycleMaskMode: () => void;
  effectivePoints2D: Point2D[];
  frameAllMarked: boolean;
  frameImageIds: ImageId[];
  handleDeleteToggle: () => void;
  handleDragStart: (event: PointerEvent<HTMLElement>) => void;
  handleMaskMouseLeave: () => void;
  handleMaskMouseMove: (event: MouseEvent<HTMLDivElement>) => void;
  handleMatchedImageWheel: (event: WheelEvent<HTMLSelectElement>) => void;
  handleOpacityDoubleClick: () => void;
  handleOpacityKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  handleOpacityWheel: (event: WheelEvent<HTMLDivElement>) => void;
  handleResizeStart: (event: PointerEvent<HTMLElement>, direction: ResizeDirection) => void;
  handleToggleCamera: () => void;
  handleToggleFrame: () => void;
  hasMask: boolean;
  hasNext: boolean;
  hasPrev: boolean;
  image: Image;
  imageContainerRef: RefObject<HTMLDivElement | null>;
  imageCount: number;
  imageDetailId: ImageId;
  imageExists: (imageId: ImageId) => boolean;
  imageSrc: string | null;
  isEditingOpacity: boolean;
  isMarkedForDeletion: boolean;
  isMatchViewMode: boolean;
  maskMode: MaskMode;
  maskSrc: string | null;
  matchLineOpacity: number;
  matchLines: MatchLine[];
  matchedCamera: Camera | null | undefined;
  matchedImage: Image | null;
  matchedImageId: ImageId | null;
  matchedImageSrc: string | null;
  multiCamera: boolean;
  numPoints2D: number;
  numPoints3D: number;
  opacityInputRef: RefObject<HTMLInputElement | null>;
  opacityInputValue: string;
  position: { x: number; y: number };
  setMatchedImageId: (imageId: ImageId | null) => void;
  setMatchLineOpacity: (opacity: number) => void;
  setOpacityInputValue: (value: string) => void;
  setShowMatchesInModal: (show: boolean) => void;
  setShowPoints2D: (show: boolean) => void;
  setShowPoints3D: (show: boolean) => void;
  showMatchesInModal: boolean;
  showPoints2D: boolean;
  showPoints3D: boolean;
  sideBySideLayout: MatchViewLayout;
  singleImageLayout: SingleImageLayout;
  size: { width: number; height: number };
  splitX: number;
  onNext: () => void;
  onOpenImageId: (imageId: ImageId) => void;
  onOpacityBlur: () => void;
  onPrev: () => void;
}

export function DesktopImageDetailFrame({
  camera,
  cameraAllMarked,
  closeImageDetail,
  connectedImages,
  containerSize,
  currentMatchCount,
  cycleMaskMode,
  effectivePoints2D,
  frameAllMarked,
  frameImageIds,
  handleDeleteToggle,
  handleDragStart,
  handleMaskMouseLeave,
  handleMaskMouseMove,
  handleMatchedImageWheel,
  handleOpacityDoubleClick,
  handleOpacityKeyDown,
  handleOpacityWheel,
  handleResizeStart,
  handleToggleCamera,
  handleToggleFrame,
  hasMask,
  hasNext,
  hasPrev,
  image,
  imageContainerRef,
  imageCount,
  imageDetailId,
  imageExists,
  imageSrc,
  isEditingOpacity,
  isMarkedForDeletion,
  isMatchViewMode,
  maskMode,
  maskSrc,
  matchLineOpacity,
  matchLines,
  matchedCamera,
  matchedImage,
  matchedImageId,
  matchedImageSrc,
  multiCamera,
  numPoints2D,
  numPoints3D,
  opacityInputRef,
  opacityInputValue,
  position,
  setMatchedImageId,
  setMatchLineOpacity,
  setOpacityInputValue,
  setShowMatchesInModal,
  setShowPoints2D,
  setShowPoints3D,
  showMatchesInModal,
  showPoints2D,
  showPoints3D,
  sideBySideLayout,
  singleImageLayout,
  size,
  splitX,
  onNext,
  onOpenImageId,
  onOpacityBlur,
  onPrev,
}: DesktopImageDetailFrameProps) {
  const frameHintState = getImageDetailFrameHintState({
    showMatchesInModal,
    connectedImageCount: connectedImages.length,
    hasMask,
    maskSrc,
    maskMode,
  });

  return (
    <div className={DESKTOP_IMAGE_DETAIL_FRAME_CLASS}>
      <div
        className={modalStyles.backdrop}
        onClick={closeImageDetail}
        onContextMenu={(event) => { event.preventDefault(); closeImageDetail(); }}
      />

      <div
        className={modalStyles.panel}
        style={getDesktopImageDetailPanelStyle({ position, size })}
        onClick={(event) => event.stopPropagation()}
      >
        <ModalErrorBoundary onClose={closeImageDetail}>
          <DesktopImageDetailHeader
            cameraAllMarked={cameraAllMarked}
            closeImageDetail={closeImageDetail}
            currentMatchCount={currentMatchCount}
            frameAllMarked={frameAllMarked}
            frameImageIds={frameImageIds}
            handleDeleteToggle={handleDeleteToggle}
            handleDragStart={handleDragStart}
            handleToggleCamera={handleToggleCamera}
            handleToggleFrame={handleToggleFrame}
            image={image}
            imageDetailId={imageDetailId}
            isMarkedForDeletion={isMarkedForDeletion}
            isMatchViewMode={isMatchViewMode}
            matchedImage={matchedImage}
            multiCamera={multiCamera}
          />

          <div className="flex flex-col flex-1 overflow-hidden px-4 pt-1 pb-3 gap-2">
            <div className="flex-shrink-0 overflow-x-auto py-1">
              <CameraPoseInfoDisplay camera={camera} qvec={image.qvec} tvec={image.tvec} />
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              <div ref={imageContainerRef} className="group/scroll relative flex-1 min-h-0 bg-ds-secondary rounded overflow-hidden">
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 px-2 py-1 bg-ds-void/70 text-ds-secondary text-xs rounded opacity-0 group-hover/scroll:opacity-100 transition-opacity pointer-events-none whitespace-nowrap flex gap-3">
                  <span>
                    Scroll: iterate through {frameHintState.scrollTargetLabel}
                  </span>
                  {frameHintState.maskCycleHint && (
                    <span>
                      Click: <span className="text-ds-primary">{frameHintState.maskCycleHint.currentMode}</span> → {frameHintState.maskCycleHint.nextMode}
                    </span>
                  )}
                </div>
                {isMatchViewMode ? (
                  <MatchImagePair
                    image={image}
                    camera={camera}
                    imageSrc={imageSrc}
                    matchedImage={matchedImage}
                    matchedCamera={matchedCamera ?? null}
                    matchedImageSrc={matchedImageSrc}
                    layout={sideBySideLayout}
                    containerSize={containerSize}
                    matchLines={matchLines}
                    matchLineOpacity={matchLineOpacity}
                  />
                ) : (
                  <SingleImageView
                    image={image}
                    camera={camera}
                    imageSrc={imageSrc}
                    maskSrc={maskSrc}
                    layout={singleImageLayout}
                    containerSize={containerSize}
                    isMarkedForDeletion={isMarkedForDeletion}
                    showPoints2D={showPoints2D}
                    showPoints3D={showPoints3D}
                    points2D={effectivePoints2D}
                    maskMode={maskMode}
                    splitX={splitX}
                    maskEnabled={isImageDetailMaskInteractionEnabled({ hasMask, showMatchesInModal })}
                    onMaskClick={cycleMaskMode}
                    onMaskMouseMove={handleMaskMouseMove}
                    onMaskMouseLeave={handleMaskMouseLeave}
                  />
                )}
              </div>

              <DesktopImageControls
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
                imageDetailId={imageDetailId}
                imageCount={imageCount}
                isEditingOpacity={isEditingOpacity}
                opacityInputRef={opacityInputRef}
                opacityInputValue={opacityInputValue}
                setShowPoints2D={setShowPoints2D}
                setShowPoints3D={setShowPoints3D}
                setShowMatchesInModal={setShowMatchesInModal}
                setMatchedImageId={setMatchedImageId}
                setMatchLineOpacity={setMatchLineOpacity}
                setOpacityInputValue={setOpacityInputValue}
                onPrev={onPrev}
                onNext={onNext}
                onMatchedImageWheel={handleMatchedImageWheel}
                onOpacityWheel={handleOpacityWheel}
                onOpacityDoubleClick={handleOpacityDoubleClick}
                onOpacityBlur={onOpacityBlur}
                onOpacityKeyDown={handleOpacityKeyDown}
                onOpenImageId={onOpenImageId}
                imageExists={imageExists}
              />
            </div>
          </div>
        </ModalErrorBoundary>

        <DesktopImageDetailResizeHandles onResizeStart={handleResizeStart} />
      </div>
    </div>
  );
}
