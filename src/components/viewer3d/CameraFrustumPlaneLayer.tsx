import { useCallback, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { VIZ_COLORS } from '../../theme';
import type { ImageId } from '../../types/colmap';
import type { SelectionColorMode } from '../../store/types';
import { COS_90_DEG } from './cameraFrustumConstants';
import type { CameraFrustumItem, FrustumPsnrMetricSource } from './cameraFrustumViewModel';
import { buildImagePlaneRenderItems, type BuildImagePlaneRenderItemsOptions } from './cameraFrustumPlaneLayerPolicy';
import { FrustumPlane } from './FrustumPlane';
import { isSphericalCameraModel } from '../../utils/cameraModelRegistry';
import { Photosphere } from './Photosphere';
import { useFrustumPlaneStoreFacade } from './useFrustumPlaneStoreFacade';
import { useSelectedFrustumImageFile } from './useSelectedFrustumImageFile';
import { useFrustumPlaneDisplayTexture } from './useFrustumPlaneDisplayTexture';
import { useTrackballControlsApi } from './trackballControlsApi';
import { useSphericalLensFovWheel } from './useSphericalLensFovWheel';

interface SharedPlaneLayerProps {
  cameraScale: number;
  hoveredImageId: ImageId | null;
  onHover: (id: ImageId | null) => void;
  onClick: (imageId: ImageId) => void;
  onContextMenu: (imageId: ImageId) => void;
  touchMode: boolean;
  undistortionEnabled: boolean;
  undistortionMode: 'cropped' | 'fullFrame';
}

interface SelectedCameraPlaneProps extends SharedPlaneLayerProps {
  frustum: CameraFrustumItem | null;
  lastNavigationToImageId: ImageId | null;
  onLongPress: (imageId: ImageId) => void;
  selectionColor: string;
  selectionColorMode: SelectionColorMode;
  selectionPlaneOpacity: number;
}

/**
 * Loads the image texture for a selected spherical camera and renders it as a Photosphere.
 * Uses the same two hooks as FrustumPlane so image loading/caching is shared.
 */
function SelectedSphericalPhotosphere({
  frustum,
  cameraScale,
  undistortionEnabled,
}: {
  frustum: CameraFrustumItem;
  cameraScale: number;
  undistortionEnabled: boolean;
}) {
  const {
    data: { dataset, cameraProjection, cameraFov },
    actions: { setCameraFov, setSelectedImageId },
  } = useFrustumPlaneStoreFacade();
  const controls = useTrackballControlsApi();
  // The R3F canvas: the wheel hook rejects wheels whose target isn't the canvas (or a
  // descendant), so scrolling a side panel / modal is never hijacked. Valid here because this
  // component renders inside the Canvas (like FrustumPlane, which also calls useThree()).
  const domElement = useThree((s) => s.gl.domElement);
  // Written each frame by Photosphere; gates the wheel handler below.
  const lensPointerStateRef = useRef({ pointerInsideLens: false, lensActive: false });
  // Scroll OUT with the pointer outside the lens circle leaves the immersive view by simply
  // deselecting the camera, which unmounts the photosphere. The camera is left exactly where it
  // is — no view reset (a jump to the whole-scene overview felt jarring). (U) undistortion stays
  // ON so the next selected camera comes up undistorted immediately.
  const handleLensExit = useCallback(() => {
    setSelectedImageId(null);
  }, [setSelectedImageId]);
  const imageFile = useSelectedFrustumImageFile({
    dataset,
    imageName: frustum.image.name,
    imageFile: frustum.imageFile,
    isSelected: true,
    showImagePlane: true,
  });
  const { displayTexture } = useFrustumPlaneDisplayTexture({
    imageFile,
    imageName: frustum.image.name,
    isSelected: true,
    showImagePlane: true,
    viewAngleOk: true,
    selectedTextureDelayMs: 0,
  });

  // Inside the (U) lens, scroll changes fov in place instead of dollying — keeping the
  // panorama circle and the splats/points aligned (the eye must stay at the capture center).
  // Called unconditionally (before the early return) to satisfy the rules of hooks; the
  // per-event pointer-in-lens gate leaves scroll OUTSIDE the circle on the dolly/exit path.
  useSphericalLensFovWheel({
    enabled: undistortionEnabled,
    cameraProjection,
    cameraFov,
    setCameraFov,
    domElement,
    lensPointerStateRef,
    onExit: handleLensExit,
    controls,
  });

  // Grid sphere from SphericalCameraLines is already visible; photosphere fades in once loaded.
  if (!displayTexture) return null;

  return (
    <Photosphere
      position={frustum.position}
      quaternion={frustum.quaternion}
      radius={cameraScale}
      texture={displayTexture}
      // BackSide from OUTSIDE = look "through" the sphere at its far inner wall:
      // the visible cap is always the slice of panorama aligned with the world
      // beyond it, it reads un-mirrored, and it tracks the view while orbiting
      // (visual-check decision 2026-07-02). FrontSide showed the near hemisphere
      // mirrored (back of the image). BackSide is ALSO the correct orientation
      // from INSIDE, so U (undistortion) reuses it — validated.
      side={THREE.BackSide}
      // (U) undistortion flies the viewer INSIDE to the capture center. From there
      // the BackSide sphere must not occlude the points/scene, so render it as a
      // non-occluding background. U-off keeps the opaque outside inspection sphere.
      background={undistortionEnabled}
      lensPointerStateRef={lensPointerStateRef}
    />
  );
}

export function SelectedCameraFrustumPlane({
  frustum,
  cameraScale,
  hoveredImageId,
  lastNavigationToImageId,
  onHover,
  onClick,
  onContextMenu,
  onLongPress,
  selectionColor,
  selectionColorMode,
  selectionPlaneOpacity,
  touchMode,
  undistortionEnabled,
  undistortionMode,
}: SelectedCameraPlaneProps) {
  if (!frustum) return null;

  // Spherical cameras: show a photosphere instead of a flat image plane.
  if (isSphericalCameraModel(frustum.camera.modelId)) {
    return (
      <SelectedSphericalPhotosphere
        frustum={frustum}
        cameraScale={cameraScale}
        undistortionEnabled={undistortionEnabled}
      />
    );
  }

  return (
    <FrustumPlane
      key={`selected-${frustum.image.imageId}`}
      position={frustum.position}
      quaternion={frustum.quaternion}
      camera={frustum.camera}
      image={frustum.image}
      scale={cameraScale}
      imageFile={frustum.imageFile}
      showImagePlane={true}
      isSelected={true}
      isMatched={false}
      wouldGoBack={frustum.image.imageId === lastNavigationToImageId}
      selectionPlaneOpacity={selectionPlaneOpacity}
      color={selectionColorMode === 'rainbow' ? VIZ_COLORS.frustum.selected : selectionColor}
      undistortionEnabled={undistortionEnabled}
      undistortionMode={undistortionMode}
      numPoints3D={frustum.numPoints3D}
      hoveredImageId={hoveredImageId}
      onHover={onHover}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onLongPress={onLongPress}
      touchMode={touchMode}
    />
  );
}

interface ImagePlaneFrustumPlanesProps
  extends SharedPlaneLayerProps,
    Omit<BuildImagePlaneRenderItemsOptions, 'splatPsnrByImage'> {
  splatPsnrByImage: FrustumPsnrMetricSource;
  onLongPress?: (imageId: ImageId) => void;
}

export function ImagePlaneFrustumPlanes({
  cameraScale,
  hoveredImageId,
  onHover,
  onClick,
  onContextMenu,
  touchMode,
  undistortionEnabled,
  undistortionMode,
  splatPsnrByImage,
  frustums,
  selectedImageId,
  matchedImageIds,
  pendingDeletions,
  imageFrameIndexMap,
  lastNavigationToImageId,
  frustumColorMode,
  frustumSingleColor,
  selectionPlaneOpacity,
  matchesOpacity,
  unselectedCameraOpacity,
  matchesColor,
  deletedColor,
  onLongPress: _onLongPress,
}: ImagePlaneFrustumPlanesProps) {
  const items = useMemo(() => buildImagePlaneRenderItems({
    frustums,
    selectedImageId,
    matchedImageIds,
    pendingDeletions,
    imageFrameIndexMap,
    splatPsnrByImage,
    lastNavigationToImageId,
    frustumColorMode,
    frustumSingleColor,
    selectionPlaneOpacity,
    matchesOpacity,
    unselectedCameraOpacity,
    matchesColor,
    deletedColor,
  }), [
    frustums,
    selectedImageId,
    matchedImageIds,
    pendingDeletions,
    imageFrameIndexMap,
    splatPsnrByImage,
    lastNavigationToImageId,
    frustumColorMode,
    frustumSingleColor,
    selectionPlaneOpacity,
    matchesOpacity,
    unselectedCameraOpacity,
    matchesColor,
    deletedColor,
  ]);

  return (
    <>
      {items.map(({ frustum, isMatched, style, wouldGoBack }) => (
        <FrustumPlane
          key={frustum.image.imageId}
          position={frustum.position}
          quaternion={frustum.quaternion}
          camera={frustum.camera}
          image={frustum.image}
          scale={cameraScale}
          imageFile={frustum.imageFile}
          showImagePlane={true}
          isSelected={false}
          isMatched={isMatched}
          wouldGoBack={wouldGoBack}
          selectionPlaneOpacity={style.opacity}
          color={style.color}
          cullAngleThreshold={COS_90_DEG}
          undistortionEnabled={undistortionEnabled}
          undistortionMode={undistortionMode}
          numPoints3D={frustum.numPoints3D}
          hoveredImageId={hoveredImageId}
          onHover={onHover}
          onClick={onClick}
          onContextMenu={onContextMenu}
          disableInteraction={true}
          touchMode={touchMode}
        />
      ))}
    </>
  );
}
