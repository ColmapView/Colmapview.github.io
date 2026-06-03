import { VIZ_COLORS } from '../../theme';
import type { ImageId } from '../../types/colmap';
import type { SelectionColorMode } from '../../store/types';
import { COS_90_DEG } from './cameraFrustumConstants';
import type { CameraFrustumItem } from './cameraFrustumViewModel';
import { buildImagePlaneRenderItems, type BuildImagePlaneRenderItemsOptions } from './cameraFrustumPlaneLayerPolicy';
import { FrustumPlane } from './FrustumPlane';

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

interface ImagePlaneFrustumPlanesProps extends SharedPlaneLayerProps, BuildImagePlaneRenderItemsOptions {
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
  ...renderItemOptions
}: ImagePlaneFrustumPlanesProps) {
  const items = buildImagePlaneRenderItems(renderItemOptions);

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
          showImagePlane={renderItemOptions.selectedImageId === null}
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
