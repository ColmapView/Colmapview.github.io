import { lazy, Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { HOTKEYS } from '../../config/hotkeys';
import { DesktopImageDetailFrame, TouchImageDetailFrame } from './ImageDetailModalFrames';
import { useImageDetailDeletionActions } from './useImageDetailDeletionActions';
import { useImageDetailFiles } from './useImageDetailFiles';
import { useImageDetailMaskState } from './useImageDetailMaskState';
import { useImageDetailModalData } from './useImageDetailModalData';
import { useImageDetailMatchOpacity } from './useImageDetailMatchOpacity';
import { useImageDetailNavigationHandlers } from './useImageDetailNavigationHandlers';
import { useImageDetailStoreFacade } from './useImageDetailStoreFacade';
import { useLazyImagePoints2D } from './useLazyImagePoints2D';
import { MediaLoadError } from '../MediaLoadError';
import { useResetKeyedState } from '../../hooks/useResetKeyedState';
import { useCameraVideoWindow } from './useCameraVideoWindow';
import { buttonStyles } from '../../theme';

const CameraVideoPlayer = lazy(() => import('./CameraVideoPlayer'));

export function ImageDetailModal() {
  const {
    data: {
      dataset,
      reconstruction,
      wasmReconstruction,
    },
    ui: {
      imageDetailId,
      closeImageDetail,
      openImageDetail,
      showPoints2D,
      showPoints3D,
      setShowPoints2D,
      setShowPoints3D,
      showMatchesInModal,
      setShowMatchesInModal,
      matchedImageId,
      setMatchedImageId,
      touchMode,
      showModalControls,
    },
  } = useImageDetailStoreFacade();

  const {
    cameraAllMarked,
    frameAllMarked,
    frameImageIds,
    handleDeleteToggle,
    handleToggleCamera,
    handleToggleFrame,
    isMarkedForDeletion,
    multiCamera,
    pendingDeletions,
  } = useImageDetailDeletionActions({ reconstruction, imageDetailId });

  const {
    applyOpacityValue,
    handleOpacityDoubleClick,
    handleOpacityKeyDown,
    handleOpacityWheel,
    isEditingOpacity,
    matchLineOpacity,
    opacityInputRef,
    opacityInputValue,
    setMatchLineOpacity,
    setOpacityInputValue,
  } = useImageDetailMatchOpacity();

  const lazyPoints2D = useLazyImagePoints2D({
    reconstruction,
    wasmReconstruction,
    imageDetailId,
    matchedImageId,
    showPoints2D,
    showPoints3D,
    showMatchesInModal,
  });

  const {
    camera,
    connectedImages,
    containerSize,
    currentMatchCount,
    effectivePoints2D,
    handleDragStart,
    handleResizeStart,
    image,
    imageContainerRef,
    isMatchViewMode,
    matchLines,
    matchedCamera,
    matchedImage,
    navigation: {
      currentIndex,
      hasNext,
      hasPrev,
      imageIds,
      nextImageId,
      prevImageId,
    },
    numPoints2D,
    numPoints3D,
    position,
    sideBySideLayout,
    singleImageLayout,
    size,
    verticalStackedLayout,
  } = useImageDetailModalData({
    reconstruction,
    imageDetailId,
    matchedImageId,
    showMatchesInModal,
    pendingDeletions,
    lazyPoints2D,
  });

  const videoSource = image ? dataset.getVideoSource(image.name) : undefined;
  const [videoActive, setVideoActive] = useResetKeyedState(videoSource && !isMatchViewMode ? videoSource.signal : undefined, false);
  const previousImage = prevImageId === null ? undefined : reconstruction?.images.get(prevImageId);
  const nextImage = nextImageId === null ? undefined : reconstruction?.images.get(nextImageId);
  const videoCache = useCameraVideoWindow(videoActive, videoSource,
    previousImage ? dataset.getVideoSource(previousImage.name) : undefined,
    nextImage ? dataset.getVideoSource(nextImage.name) : undefined);

  const {
    imageSrc,
    maskFile,
    maskSrc,
    matchedImageSrc,
    imageFailed,
    maskFailed,
    matchedImageFailed,
    retryImage,
    retryMask,
    retryMatchedImage,
  } = useImageDetailFiles({
    dataset,
    reconstruction,
    imageDetailId,
    matchedImageId,
    image,
    matchedImage,
  });
  const hasMask = !!maskFile;

  const goToPrev = useCallback(() => {
    if (prevImageId !== null) {
      openImageDetail(prevImageId);
    }
  }, [prevImageId, openImageDetail]);

  const goToNext = useCallback(() => {
    if (nextImageId !== null) {
      openImageDetail(nextImageId);
    }
  }, [nextImageId, openImageDetail]);

  const {
    cycleMaskMode,
    handleMaskMouseLeave,
    handleMaskMouseMove,
    maskMode,
    splitX,
  } = useImageDetailMaskState(imageDetailId);

  const {
    handleMatchedImageWheel,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
  } = useImageDetailNavigationHandlers({
    disabled: videoActive,
    imageContainerRef,
    showMatchesInModal,
    connectedImages,
    matchedImageId,
    hasMask,
    maskSrc,
    isMarkedForDeletion,
    onCycleMaskMode: cycleMaskMode,
    onPreviousImage: goToPrev,
    onNextImage: goToNext,
    onSetMatchedImageId: setMatchedImageId,
  });

  // Handle keyboard shortcuts using centralized hotkey system
  useHotkeys(
    HOTKEYS.closeModal.keys,
    closeImageDetail,
    { scopes: HOTKEYS.closeModal.scopes, enabled: imageDetailId !== null },
    [closeImageDetail]
  );

  useHotkeys(
    HOTKEYS.prevImage.keys,
    goToPrev,
    { scopes: HOTKEYS.prevImage.scopes, enabled: imageDetailId !== null && hasPrev },
    [hasPrev, goToPrev]
  );

  useHotkeys(
    HOTKEYS.nextImage.keys,
    goToNext,
    { scopes: HOTKEYS.nextImage.scopes, enabled: imageDetailId !== null && hasNext },
    [hasNext, goToNext]
  );

  if (imageDetailId === null || !image || !camera) return null;

  const videoPlayer = videoActive && videoSource ? <Suspense fallback={imageSrc ? <img src={imageSrc} alt="" className="absolute object-contain pointer-events-none"
    style={{ left: singleImageLayout.offsetX, top: singleImageLayout.offsetY, width: singleImageLayout.renderedImageWidth, height: singleImageLayout.renderedImageHeight }} /> : null}>
    <CameraVideoPlayer key={imageDetailId} source={videoSource} cache={videoCache} name={image.name} poster={imageSrc} layout={singleImageLayout} onClose={() => setVideoActive(false)} />
  </Suspense> : undefined;
  const mediaActions = videoSource && !videoActive && !isMatchViewMode ? <button
    className={`absolute top-2 right-2 z-10 ${buttonStyles.base} ${buttonStyles.sizes.sm} ${buttonStyles.variants.secondary}`}
    aria-label="Play camera video" title="Play this camera’s recording" onClick={() => setVideoActive(true)}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m7 3 15 9-15 9z" /></svg>Video
  </button> : undefined;

  const loadErrors = <>
    {imageFailed && <MediaLoadError message="Image could not be loaded." retryLabel="Retry image" onRetry={retryImage} />}
    {maskFailed && <MediaLoadError message="Mask could not be loaded." retryLabel="Retry mask" onRetry={retryMask} />}
    {isMatchViewMode && matchedImageFailed && <MediaLoadError message="Matched image could not be loaded." retryLabel="Retry matched image" onRetry={retryMatchedImage} />}
  </>;

  if (touchMode) {
    return createPortal(
      <TouchImageDetailFrame
        videoPlayer={videoPlayer}
        mediaActions={mediaActions}
        loadErrors={loadErrors}
        camera={camera}
        closeImageDetail={closeImageDetail}
        connectedImages={connectedImages}
        containerSize={containerSize}
        currentIndex={currentIndex}
        effectivePoints2D={effectivePoints2D}
        handleTouchEnd={handleTouchEnd}
        handleTouchMove={handleTouchMove}
        handleTouchStart={handleTouchStart}
        hasNext={hasNext}
        hasPrev={hasPrev}
        image={image}
        imageContainerRef={imageContainerRef}
        imageIds={imageIds}
        imageSrc={imageSrc}
        maskSrc={maskSrc}
        maskMode={maskMode}
        splitX={splitX}
        isMarkedForDeletion={isMarkedForDeletion}
        isMatchViewMode={isMatchViewMode}
        matchLineOpacity={matchLineOpacity}
        matchLines={matchLines}
        matchedCamera={matchedCamera}
        matchedImage={matchedImage}
        matchedImageId={matchedImageId}
        matchedImageSrc={matchedImageSrc}
        numPoints2D={numPoints2D}
        numPoints3D={numPoints3D}
        setMatchedImageId={setMatchedImageId}
        setMatchLineOpacity={setMatchLineOpacity}
        setShowMatchesInModal={setShowMatchesInModal}
        setShowPoints2D={setShowPoints2D}
        setShowPoints3D={setShowPoints3D}
        showMatchesInModal={showMatchesInModal}
        showModalControls={showModalControls}
        showPoints2D={showPoints2D}
        showPoints3D={showPoints3D}
        singleImageLayout={singleImageLayout}
        verticalStackedLayout={verticalStackedLayout}
        onNext={goToNext}
        onPrev={goToPrev}
      />,
      document.body
    );
  }

  return createPortal(
    <DesktopImageDetailFrame
      videoPlayer={videoPlayer}
      mediaActions={mediaActions}
      loadErrors={loadErrors}
      camera={camera}
      cameraAllMarked={cameraAllMarked}
      closeImageDetail={closeImageDetail}
      connectedImages={connectedImages}
      containerSize={containerSize}
      currentMatchCount={currentMatchCount}
      cycleMaskMode={cycleMaskMode}
      effectivePoints2D={effectivePoints2D}
      frameAllMarked={frameAllMarked}
      frameImageIds={frameImageIds}
      handleDeleteToggle={handleDeleteToggle}
      handleDragStart={handleDragStart}
      handleMaskMouseLeave={handleMaskMouseLeave}
      handleMaskMouseMove={handleMaskMouseMove}
      handleMatchedImageWheel={handleMatchedImageWheel}
      handleOpacityDoubleClick={handleOpacityDoubleClick}
      handleOpacityKeyDown={handleOpacityKeyDown}
      handleOpacityWheel={handleOpacityWheel}
      handleResizeStart={handleResizeStart}
      handleToggleCamera={handleToggleCamera}
      handleToggleFrame={handleToggleFrame}
      hasMask={hasMask}
      hasNext={hasNext}
      hasPrev={hasPrev}
      image={image}
      imageContainerRef={imageContainerRef}
      imageCount={imageIds.length}
      imageDetailId={imageDetailId}
      imageExists={(id) => reconstruction?.images.has(id) ?? false}
      imageSrc={imageSrc}
      isEditingOpacity={isEditingOpacity}
      isMarkedForDeletion={isMarkedForDeletion}
      isMatchViewMode={isMatchViewMode}
      maskMode={maskMode}
      maskSrc={maskSrc}
      matchLineOpacity={matchLineOpacity}
      matchLines={matchLines}
      matchedCamera={matchedCamera}
      matchedImage={matchedImage}
      matchedImageId={matchedImageId}
      matchedImageSrc={matchedImageSrc}
      multiCamera={multiCamera}
      numPoints2D={numPoints2D}
      numPoints3D={numPoints3D}
      opacityInputRef={opacityInputRef}
      opacityInputValue={opacityInputValue}
      position={position}
      setMatchedImageId={setMatchedImageId}
      setMatchLineOpacity={setMatchLineOpacity}
      setOpacityInputValue={setOpacityInputValue}
      setShowMatchesInModal={setShowMatchesInModal}
      setShowPoints2D={setShowPoints2D}
      setShowPoints3D={setShowPoints3D}
      showMatchesInModal={showMatchesInModal}
      showPoints2D={showPoints2D}
      showPoints3D={showPoints3D}
      sideBySideLayout={sideBySideLayout}
      singleImageLayout={singleImageLayout}
      size={size}
      splitX={splitX}
      onNext={goToNext}
      onOpenImageId={openImageDetail}
      onOpacityBlur={applyOpacityValue}
      onPrev={goToPrev}
    />,
    document.body
  );
}

