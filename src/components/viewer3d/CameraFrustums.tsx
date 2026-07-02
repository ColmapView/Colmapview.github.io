import { useEffect, useMemo, useState, useCallback } from 'react';
import { useThree } from '@react-three/fiber';

import { BatchedArrowMeshes } from './BatchedArrowMeshes';
import { BatchedFrustumLines } from './BatchedFrustumLines';
import { BatchedPlaneHitTargets } from './BatchedPlaneHitTargets';
import { CameraFrustumContextMenuOverlay } from './CameraFrustumContextMenuOverlay';
import { ImagePlaneFrustumPlanes, SelectedCameraFrustumPlane } from './CameraFrustumPlaneLayer';
export { CameraMatches } from './CameraMatches';
import { useFrustumTextureCachePause } from './useFrustumTextureCachePause';
import { useSelectedFrustumImageCacheRefresh } from './useSelectedFrustumImageCacheRefresh';
import { useCameraFrustumNavigationHandlers } from './useCameraFrustumNavigationHandlers';
import { useCameraFrustumsStoreFacade } from './useCameraFrustumsStoreFacade';
import { useTrackballControlsApi } from './trackballControlsApi';
import { appLogger } from '../../utils/logger';
import {
  buildCameraFrustumItems,
  buildCameraIdToIndex,
  buildImageFrameIndexMap,
  buildMatchedImageIds,
  getCameraScaleValue,
  getLastNavigationToImageId,
} from './cameraFrustumViewModel';
import { prefetchImagePlaneTexturesForReconstruction } from './imagePlaneTexturePrefetch';
import { partitionFrustumsByFamily } from './cameraFamilyPartition';
import { SphericalCameraLines } from './SphericalCameraLines';
import { SphericalCameraHitTargets } from './SphericalCameraHitTargets';

export function CameraFrustums() {
  const {
    data: {
      reconstruction,
      dataset,
      cameras,
      selection,
      matches,
      nav,
      isAlignmentMode,
      touchMode,
      pendingDeletions,
      splatPsnrByImage,
    },
    actions: {
      navActions,
      selectionActions,
      openImageDetail,
      setMatchedImageId,
      setShowMatchesInModal,
    },
  } = useCameraFrustumsStoreFacade();

  // Extract cameras state
  const {
    displayMode: cameraDisplayMode,
    scale: cameraScaleBase,
    scaleFactor: cameraScaleFactor,
    colorMode: frustumColorMode,
    singleColor: frustumSingleColor,
    standbyOpacity: frustumStandbyOpacity,
    lineWidth: frustumLineWidth,
    undistortionEnabled,
    undistortionMode,
  } = cameras;
  const cameraScale = getCameraScaleValue(cameraScaleBase, cameraScaleFactor);

  // Extract selection state
  const {
    selectedImageId,
    planeOpacity: selectionPlaneOpacity,
    colorMode: selectionColorMode,
    color: selectionColor,
    animationSpeed: selectionAnimationSpeed,
    unselectedOpacity: unselectedCameraOpacity,
  } = selection;

  // Extract matches state
  const {
    visible: showMatches,
    displayMode: matchesDisplayMode,
    opacity: matchesOpacity,
    color: matchesColor,
  } = matches;

  // Image planes are shown in 'imageplane' mode
  const showImagePlanes = cameraDisplayMode === 'imageplane';

  // Hovered image ID for arrow mode (batched rendering needs this at parent level)
  const [hoveredImageId, setHoveredImageId] = useState<number | null>(null);

  // Camera movement detection - pauses texture loading during orbit/pan
  const { camera: threeCamera, gl, size } = useThree();
  const controls = useTrackballControlsApi();
  const requestHoverRefresh = useFrustumTextureCachePause({
    camera: threeCamera,
    canvas: gl?.domElement ?? null,
  });

  // Extract navigation values for FOV auto-adjustment
  const {
    fov: cameraFov,
    autoFovEnabled,
    navigationHistory,
  } = nav;

  // Build a map from cameraId to index for consistent coloring
  const cameraIdToIndex = useMemo(() => {
    return buildCameraIdToIndex(reconstruction);
  }, [reconstruction]);

  // Build a map from imageId to frame index for rig-frame coloring
  // Images with the same filename (different directories) belong to the same frame
  const imageFrameIndexMap = useMemo(() => {
    return buildImageFrameIndexMap(reconstruction);
  }, [reconstruction]);

  // Compute matched image IDs when matches are shown
  // Uses pre-computed connectedImagesIndex (avoids iterating points3D Map)
  const matchedImageIds = useMemo(() => {
    return buildMatchedImageIds(reconstruction, selectedImageId, showMatches);
  }, [reconstruction, selectedImageId, showMatches]);

  // Get the last navigation target for "back" hint display
  const lastNavigationToImageId = useMemo(() => {
    return getLastNavigationToImageId(navigationHistory);
  }, [navigationHistory]);

  const [imageCacheVersion, setImageCacheVersion] = useState(0);

  const frustums = useMemo(() => {
    // Cache version intentionally triggers a recompute when lazy image loads finish.
    void imageCacheVersion;

    return buildCameraFrustumItems({
      reconstruction,
      imageSource: dataset,
      cameraIdToIndex,
      pendingDeletions,
    });
  }, [reconstruction, dataset, cameraIdToIndex, imageCacheVersion, pendingDeletions]);

  const { spherical: sphericalFrustums, nonSpherical: pinholeFrustums } = useMemo(
    () => partitionFrustumsByFamily(frustums),
    [frustums]
  );

  const handleSelectedImageLoaded = useCallback(() => {
    setImageCacheVersion(v => v + 1);
  }, []);

  useSelectedFrustumImageCacheRefresh({
    imageSource: dataset,
    reconstruction,
    selectedImageId,
    onImageLoaded: handleSelectedImageLoaded,
  });

  useEffect(() => {
    if (!showImagePlanes || !reconstruction || reconstruction.images.size === 0) {
      return;
    }

    let cancelled = false;
    void prefetchImagePlaneTexturesForReconstruction({
      reconstruction,
      dataset,
      shouldCancel: () => cancelled,
      onBatchPrefetched: handleSelectedImageLoaded,
    }).catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      appLogger.warn(`[Image Plane] Background texture prefetch failed: ${message}`);
    });

    return () => {
      cancelled = true;
    };
  }, [
    dataset,
    handleSelectedImageLoaded,
    reconstruction,
    showImagePlanes,
  ]);

  const {
    contextMenu,
    handleArrowClick,
    handleArrowContextMenu,
    handleContextMenuSelect,
    handleContextMenuGoto,
    handleContextMenuInfo,
    handleContextMenuClose,
  } = useCameraFrustumNavigationHandlers({
    frustums,
    selectedImageId,
    matchedImageIds,
    controls,
    viewportSize: size,
    cameraFov,
    cameraScale,
    autoFovEnabled,
    navActions,
    selectionActions,
    openImageDetail,
    setMatchedImageId,
    setShowMatchesInModal,
    setHoveredImageId,
    requestHoverRefresh,
  });

  // Hide frustums when no frustums or in alignment mode
  if (frustums.length === 0 || isAlignmentMode) return null;

  // === Selected camera source of truth ===
  // Compute selected frustum once for all display modes
  const selectedFrustum = selectedImageId !== null
    ? frustums.find(f => f.image.imageId === selectedImageId) ?? null
    : null;

  // Shared FrustumPlane render for selected camera (used by all modes)
  const selectedCameraPlane = (
    <SelectedCameraFrustumPlane
      frustum={selectedFrustum}
      cameraScale={cameraScale}
      hoveredImageId={hoveredImageId}
      lastNavigationToImageId={lastNavigationToImageId}
      onHover={setHoveredImageId}
      onClick={handleArrowClick}
      onContextMenu={handleArrowContextMenu}
      onLongPress={openImageDetail}
      selectionColor={selectionColor}
      selectionColorMode={selectionColorMode}
      selectionPlaneOpacity={selectionPlaneOpacity}
      touchMode={touchMode}
      undistortionEnabled={undistortionEnabled}
      undistortionMode={undistortionMode}
    />
  );

  // Spherical layer: grid lines + hit targets for all spherical cameras (shared across modes)
  // Only mount when there are spherical cameras to avoid allocating empty geometry.
  const sphericalLayer = sphericalFrustums.length > 0 ? (
    <>
      <SphericalCameraLines
        frustums={sphericalFrustums}
        selectedImageId={selectedImageId}
        cameraScale={cameraScale}
        frustumColorMode={frustumColorMode}
        frustumSingleColor={frustumSingleColor}
        frustumLineWidth={frustumLineWidth}
        frustumStandbyOpacity={frustumStandbyOpacity}
        selectionColor={selectionColor}
        unselectedCameraOpacity={unselectedCameraOpacity}
        imageFrameIndexMap={imageFrameIndexMap}
        splatPsnrByImage={splatPsnrByImage}
      />
      <SphericalCameraHitTargets
        frustums={sphericalFrustums}
        cameraScale={cameraScale}
        onHover={setHoveredImageId}
        onClick={handleArrowClick}
        onContextMenu={handleArrowContextMenu}
        onLongPress={openImageDetail}
        touchMode={touchMode}
      />
    </>
  ) : null;

  // Arrow mode: use batched rendering for efficiency
  if (cameraDisplayMode === 'arrow') {
    return (
      <group>
        {/* Instanced meshes for all cone arrows (with batched raycasting) */}
        <BatchedArrowMeshes
          frustums={pinholeFrustums}
          cameraScale={cameraScale}
          selectedImageId={selectedImageId}
          hoveredImageId={hoveredImageId}
          matchedImageIds={matchedImageIds}
          matchesOpacity={matchesOpacity}
          matchesDisplayMode={matchesDisplayMode}
          matchesColor={matchesColor}
          frustumColorMode={frustumColorMode}
          frustumSingleColor={frustumSingleColor}
          frustumStandbyOpacity={frustumStandbyOpacity}
          selectionColorMode={selectionColorMode}
          selectionColor={selectionColor}
          selectionAnimationSpeed={selectionAnimationSpeed}
          unselectedCameraOpacity={unselectedCameraOpacity}
          imageFrameIndexMap={imageFrameIndexMap}
          splatPsnrByImage={splatPsnrByImage}
          onHover={setHoveredImageId}
          onClick={handleArrowClick}
          onContextMenu={handleArrowContextMenu}
          onLongPress={openImageDetail}
          lastNavigationToImageId={lastNavigationToImageId}
          touchMode={touchMode}
          pendingDeletions={pendingDeletions}
        />
        {/* Spherical cameras: grid lines + hit targets */}
        {sphericalLayer}
        {/* Image plane for selected camera (replaces arrow) */}
        {selectedCameraPlane}
        <CameraFrustumContextMenuOverlay
          contextMenu={contextMenu}
          onSelect={handleContextMenuSelect}
          onGoto={handleContextMenuGoto}
          onInfo={handleContextMenuInfo}
          onClose={handleContextMenuClose}
        />
      </group>
    );
  }

  // Image plane mode: only image planes, no wireframes
  if (cameraDisplayMode === 'imageplane') {
    return (
      <group>
        {/* Batched invisible hit targets for efficient raycasting */}
        <BatchedPlaneHitTargets
          frustums={pinholeFrustums}
          cameraScale={cameraScale}
          selectedImageId={selectedImageId}
          matchedImageIds={matchedImageIds}
          onHover={setHoveredImageId}
          onClick={handleArrowClick}
          onContextMenu={handleArrowContextMenu}
          onLongPress={openImageDetail}
          lastNavigationToImageId={lastNavigationToImageId}
          touchMode={touchMode}
        />
        {/* Per-frustum planes for texture rendering (non-selected only, interaction handled by BatchedPlaneHitTargets) */}
        <ImagePlaneFrustumPlanes
          frustums={pinholeFrustums}
          selectedImageId={selectedImageId}
          matchedImageIds={matchedImageIds}
          pendingDeletions={pendingDeletions}
          imageFrameIndexMap={imageFrameIndexMap}
          lastNavigationToImageId={lastNavigationToImageId}
          frustumColorMode={frustumColorMode}
          frustumSingleColor={frustumSingleColor}
          selectionPlaneOpacity={selectionPlaneOpacity}
          matchesOpacity={matchesOpacity}
          unselectedCameraOpacity={unselectedCameraOpacity}
          matchesColor={matchesColor}
          cameraScale={cameraScale}
          hoveredImageId={hoveredImageId}
          onHover={setHoveredImageId}
          onClick={handleArrowClick}
          onContextMenu={handleArrowContextMenu}
          touchMode={touchMode}
          undistortionEnabled={undistortionEnabled}
          undistortionMode={undistortionMode}
          splatPsnrByImage={splatPsnrByImage}
        />
        {/* Spherical cameras: grid lines + hit targets */}
        {sphericalLayer}
        {/* Selected camera image plane (source of truth) */}
        {selectedCameraPlane}
        <CameraFrustumContextMenuOverlay
          contextMenu={contextMenu}
          onSelect={handleContextMenuSelect}
          onGoto={handleContextMenuGoto}
          onInfo={handleContextMenuInfo}
          onClose={handleContextMenuClose}
        />
      </group>
    );
  }

  // Frustum mode: use batched lines + individual planes for textures
  return (
    <group>
      {/* Single batched geometry for all frustum wireframes */}
      <BatchedFrustumLines
        frustums={pinholeFrustums}
        cameraScale={cameraScale}
        selectedImageId={selectedImageId}
        hoveredImageId={hoveredImageId}
        matchedImageIds={matchedImageIds}
        matchesOpacity={matchesOpacity}
        matchesDisplayMode={matchesDisplayMode}
        matchesColor={matchesColor}
        frustumColorMode={frustumColorMode}
        frustumSingleColor={frustumSingleColor}
        frustumStandbyOpacity={frustumStandbyOpacity}
        frustumLineWidth={frustumLineWidth}
        selectionColorMode={selectionColorMode}
        selectionColor={selectionColor}
        selectionAnimationSpeed={selectionAnimationSpeed}
        unselectedCameraOpacity={unselectedCameraOpacity}
        showImagePlanes={showImagePlanes}
        imageFrameIndexMap={imageFrameIndexMap}
        splatPsnrByImage={splatPsnrByImage}
        pendingDeletions={pendingDeletions}
      />
      {/* Batched invisible hit targets for frustum selection */}
      <BatchedPlaneHitTargets
        frustums={pinholeFrustums}
        cameraScale={cameraScale}
        selectedImageId={selectedImageId}
        matchedImageIds={matchedImageIds}
        onHover={setHoveredImageId}
        onClick={handleArrowClick}
        onContextMenu={handleArrowContextMenu}
        onLongPress={openImageDetail}
        lastNavigationToImageId={lastNavigationToImageId}
        touchMode={touchMode}
      />
      {/* Spherical cameras: grid lines + hit targets */}
      {sphericalLayer}
      {/* Selected camera image plane (source of truth) */}
      {selectedCameraPlane}
      <CameraFrustumContextMenuOverlay
        contextMenu={contextMenu}
        onSelect={handleContextMenuSelect}
        onGoto={handleContextMenuGoto}
        onInfo={handleContextMenuInfo}
        onClose={handleContextMenuClose}
      />
    </group>
  );
}
