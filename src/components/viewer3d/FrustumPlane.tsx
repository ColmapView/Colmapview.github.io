import { memo, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Camera, Image } from '../../types/colmap';
import {
  VIZ_COLORS,
} from '../../theme';
import { CAMERA_FRUSTUM_CURSOR_OWNER } from './cameraFrustumConstants';
import { getFrustumPlaneSize } from './cameraFrustumViewModel';
import { FrustumPlaneHoverCard } from './FrustumPlaneHoverCard';
import { FrustumPlaneSelectionBorder } from './FrustumPlaneSelectionBorder';
import { FrustumPlaneSurface } from './FrustumPlaneSurface';
import { useTrackballControlsApi, useTrackballDraggingReader } from './trackballControlsApi';
import { useFrustumPlaneClickInteractions } from './useFrustumPlaneClickInteractions';
import { useFrustumPlaneDisplayTexture } from './useFrustumPlaneDisplayTexture';
import { useFrustumPlaneHoverInteractions } from './useFrustumPlaneHoverInteractions';
import { useFrustumPlaneTouchInteractions } from './useFrustumPlaneTouchInteractions';
import { useFrustumPlaneViewAngleCulling } from './useFrustumPlaneViewAngleCulling';
import { useSelectedFrustumFovWheel } from './useSelectedFrustumFovWheel';
import { useSelectedFrustumImageFile } from './useSelectedFrustumImageFile';
import { calculateFixedHtmlPosition, getFixedCursorHtmlStyle } from './htmlOverlayStylePolicy';
import { useFrustumPlaneStoreFacade } from './useFrustumPlaneStoreFacade';

const COS_45_DEG = Math.cos(Math.PI / 4);

interface FrustumPlaneProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  camera: Camera;
  image: Image;
  scale: number;
  imageFile?: File;
  showImagePlane: boolean;
  isSelected: boolean;
  isMatched?: boolean;
  wouldGoBack?: boolean;
  selectionPlaneOpacity: number;
  color: string;
  cullAngleThreshold?: number;
  undistortionEnabled?: boolean;
  undistortionMode?: 'cropped' | 'fullFrame';
  numPoints3D: number;
  hoveredImageId: number | null;
  onHover: (id: number | null) => void;
  onClick: (imageId: number) => void;
  onContextMenu: (imageId: number) => void;
  onLongPress?: (imageId: number) => void;
  disableInteraction?: boolean;
  touchMode?: boolean;
}

export const FrustumPlane = memo(function FrustumPlane({
  position,
  quaternion,
  camera,
  image,
  scale,
  imageFile: imageFileProp,
  showImagePlane,
  isSelected,
  isMatched = false,
  wouldGoBack = false,
  selectionPlaneOpacity,
  color,
  cullAngleThreshold = COS_45_DEG,
  undistortionEnabled = false,
  undistortionMode = 'fullFrame',
  numPoints3D,
  hoveredImageId,
  onHover,
  onClick,
  onContextMenu,
  onLongPress,
  disableInteraction = false,
  touchMode = false,
}: FrustumPlaneProps) {
  const {
    data: {
      cameraFov,
      cameraProjection,
      dataset,
      multiCamera,
      selectionAnimationSpeed,
      selectionColorMode,
    },
    actions: {
      setCameraFov,
    },
  } = useFrustumPlaneStoreFacade();
  const [hovered, setHovered] = useState(false);
  const [viewAngleOk, setViewAngleOk] = useState(true);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [touchTransparent, setTouchTransparent] = useState(false);

  const imageFile = useSelectedFrustumImageFile({
    dataset,
    imageName: image.name,
    imageFile: imageFileProp,
    isSelected,
    showImagePlane,
  });

  const { camera: threeCamera } = useThree();
  const controls = useTrackballControlsApi();
  const isDragging = useTrackballDraggingReader();
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  useSelectedFrustumFovWheel({
    enabled: isSelected && hovered,
    cameraProjection,
    cameraFov,
    setCameraFov,
    controls,
  });

  const { displayTexture, shouldShowTexture } = useFrustumPlaneDisplayTexture({
    imageFile,
    imageName: image.name,
    isSelected,
    materialRef,
    showImagePlane,
    viewAngleOk,
  });

  const planeSize = useMemo(() => {
    return getFrustumPlaneSize(camera, scale);
  }, [camera, scale]);

  useFrustumPlaneViewAngleCulling({
    enabled: showImagePlane,
    isSelected,
    groupRef,
    camera: threeCamera,
    scale,
    cullAngleThreshold,
    viewAngleOk,
    setViewAngleOk,
  });

  const displayColor = hovered ? VIZ_COLORS.frustum.hover : color;
  const isTransparent = hovered || touchTransparent;
  const clickHandlers = useFrustumPlaneClickInteractions({
    disabled: disableInteraction,
    imageId: image.imageId,
    touchMode,
    onClick,
    onContextMenu,
  });
  const hoverHandlers = useFrustumPlaneHoverInteractions({
    disabled: disableInteraction,
    imageId: image.imageId,
    isSelected,
    hovered,
    hoveredImageId,
    isDragging,
    onHover,
    setHovered,
    setMousePos,
    cursorOwner: CAMERA_FRUSTUM_CURSOR_OWNER,
  });
  const touchHandlers = useFrustumPlaneTouchInteractions({
    enabled: touchMode && !disableInteraction,
    imageId: image.imageId,
    isSelected,
    onContextMenu,
    onLongPress,
    setTouchTransparent,
  });

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      <mesh
        position={[0, 0, planeSize.depth]}
        renderOrder={isSelected ? 100 : 0}
        userData={{ isSelectedPlane: isSelected }}
        raycast={disableInteraction ? () => {} : undefined}
        onPointerDown={touchMode ? touchHandlers.onPointerDown : clickHandlers.onPointerDown}
        onPointerUp={touchHandlers.onPointerUp}
        onClick={clickHandlers.onClick}
        onContextMenu={clickHandlers.onContextMenu}
        onPointerOver={hoverHandlers.onPointerOver}
        onPointerMove={hoverHandlers.onPointerMove}
        onPointerOut={hoverHandlers.onPointerOut}
      >
        <FrustumPlaneSurface
          camera={camera}
          displayColor={displayColor}
          displayTexture={displayTexture}
          isSelected={isSelected}
          isTransparent={isTransparent}
          materialRef={materialRef}
          planeSize={planeSize}
          selectionPlaneOpacity={selectionPlaneOpacity}
          shouldShowTexture={shouldShowTexture}
          undistortionEnabled={undistortionEnabled}
          undistortionMode={undistortionMode}
        />
      </mesh>
      {isSelected && (
        <FrustumPlaneSelectionBorder
          color={color}
          planeSize={planeSize}
          selectionAnimationSpeed={selectionAnimationSpeed}
          selectionColorMode={selectionColorMode}
        />
      )}
      {!touchMode && hovered && mousePos && (
        <Html
          style={getFixedCursorHtmlStyle(mousePos)}
          calculatePosition={calculateFixedHtmlPosition}
        >
          <FrustumPlaneHoverCard
            imageName={image.name}
            imageId={image.imageId}
            cameraId={image.cameraId}
            multiCamera={multiCamera}
            numPoints3D={numPoints3D}
            isSelected={isSelected}
            isMatched={isMatched}
            wouldGoBack={wouldGoBack}
            cameraProjection={cameraProjection}
          />
        </Html>
      )}
    </group>
  );
});
