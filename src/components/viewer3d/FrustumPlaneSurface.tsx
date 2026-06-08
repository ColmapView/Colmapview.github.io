import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Camera } from '../../types/colmap';
import { VIZ_COLORS } from '../../theme';
import type { FrustumPlaneSize } from './cameraFrustumGeometry';
import {
  getFrustumPlaneBasicMaterialProps,
  syncFrustumPlaneMaterialMap,
} from './frustumPlaneMaterialPolicy';
import { UndistortedImageMaterial } from './UndistortedImageMaterial';

const TESSELLATION_SEGMENTS = 32;

interface FrustumPlaneSurfaceProps {
  camera: Camera;
  displayColor: string;
  displayTexture: THREE.Texture | null;
  isSelected: boolean;
  isTransparent: boolean;
  planeSize: FrustumPlaneSize;
  selectionPlaneOpacity: number;
  shouldShowTexture: boolean;
  textureHiddenByViewAngle: boolean;
  undistortionEnabled: boolean;
  undistortionMode: 'cropped' | 'fullFrame';
}

export function FrustumPlaneSurface({
  camera,
  displayColor,
  displayTexture,
  isSelected,
  isTransparent,
  planeSize,
  selectionPlaneOpacity,
  shouldShowTexture,
  textureHiddenByViewAngle,
  undistortionEnabled,
  undistortionMode,
}: FrustumPlaneSurfaceProps) {
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const previousMaterialTextureRef = useRef<THREE.Texture | null | undefined>(undefined);
  const materialTexture = shouldShowTexture ? displayTexture : null;

  useEffect(() => {
    syncFrustumPlaneMaterialMap(
      materialRef.current,
      materialTexture,
      previousMaterialTextureRef.current
    );
    previousMaterialTextureRef.current = materialTexture;
  }, [materialTexture]);

  if (undistortionEnabled && shouldShowTexture && displayTexture) {
    return (
      <>
        {undistortionMode === 'fullFrame' ? (
          <planeGeometry args={[planeSize.width, planeSize.height, TESSELLATION_SEGMENTS, TESSELLATION_SEGMENTS]} />
        ) : (
          <planeGeometry args={[planeSize.width, planeSize.height]} />
        )}
        <UndistortedImageMaterial
          map={displayTexture}
          camera={camera}
          undistortionEnabled={undistortionEnabled}
          undistortionMode={undistortionMode}
          planeWidth={planeSize.width}
          planeHeight={planeSize.height}
          opacity={isTransparent ? selectionPlaneOpacity * 0.5 : selectionPlaneOpacity}
          color={VIZ_COLORS.material.white}
          side={THREE.DoubleSide}
          depthTest={!isSelected}
          forceTransparent={isSelected}
          forceDepthWrite={isSelected ? false : undefined}
        />
      </>
    );
  }

  const materialProps = getFrustumPlaneBasicMaterialProps({
    isSelected,
    isTransparent,
    shouldShowTexture,
    textureHiddenByViewAngle,
    selectionPlaneOpacity,
    displayColor,
  });

  return (
    <>
      <planeGeometry args={[planeSize.width, planeSize.height]} />
      <meshBasicMaterial
        ref={materialRef}
        map={materialTexture}
        color={materialProps.color}
        side={THREE.DoubleSide}
        transparent={materialProps.transparent}
        depthWrite={materialProps.depthWrite}
        depthTest={materialProps.depthTest}
        toneMapped={false}
        opacity={materialProps.opacity}
      />
    </>
  );
}
