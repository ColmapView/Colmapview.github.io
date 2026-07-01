import { useMemo } from 'react';
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
}: {
  frustum: CameraFrustumItem;
  cameraScale: number;
}) {
  const { data: { dataset } } = useFrustumPlaneStoreFacade();
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
  // Grid sphere from SphericalCameraLines is already visible; photosphere fades in once loaded.
  if (!displayTexture) return null;
  return (
    <Photosphere
      position={frustum.position}
      quaternion={frustum.quaternion}
      radius={cameraScale}
      texture={displayTexture}
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
    return <SelectedSphericalPhotosphere frustum={frustum} cameraScale={cameraScale} />;
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
