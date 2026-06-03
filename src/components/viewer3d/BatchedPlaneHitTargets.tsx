import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Camera, Image } from '../../types/colmap';
import { getFrustumPlaneSize } from './cameraFrustumViewModel';
import { FrustumPlaneHoverCard } from './FrustumPlaneHoverCard';
import { useTrackballDraggingReader } from './trackballControlsApi';
import { useBatchedFrustumInteractions } from './useBatchedFrustumInteractions';
import {
  composePlaneHitTargetMatrix,
  getBatchedPlaneHitTargetMeshKey,
} from './batchedPlaneHitTargetPolicy';
import { calculateFixedHtmlPosition, getFixedCursorHtmlStyle } from './htmlOverlayStylePolicy';
import { useFrustumHoverCardStoreFacade } from './useFrustumHoverCardStoreFacade';

interface BatchedPlaneHitTargetsProps {
  frustums: {
    image: Image;
    camera: Camera;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    cameraIndex: number;
    numPoints3D: number;
  }[];
  cameraScale: number;
  selectedImageId: number | null;
  matchedImageIds: Set<number>;
  onHover: (id: number | null) => void;
  onClick: (imageId: number) => void;
  onContextMenu: (imageId: number) => void;
  onLongPress: (imageId: number) => void;
  lastNavigationToImageId: number | null;
  touchMode?: boolean;
}

const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempForward = new THREE.Vector3();
const tempScale = new THREE.Vector3(1, 1, 1);

export function BatchedPlaneHitTargets({
  frustums,
  cameraScale,
  selectedImageId,
  matchedImageIds,
  onHover,
  onClick,
  onContextMenu,
  onLongPress,
  lastNavigationToImageId,
  touchMode = false,
}: BatchedPlaneHitTargetsProps) {
  const { multiCamera } = useFrustumHoverCardStoreFacade();
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const isDragging = useTrackballDraggingReader();
  const { tooltipData, tooltipFrustum, interactionHandlers } = useBatchedFrustumInteractions({
    frustums,
    selectedImageId,
    touchMode,
    isDragging,
    onHover,
    onClick,
    onContextMenu,
    onLongPress,
  });

  const planeGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const hitMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  useEffect(() => {
    return () => {
      planeGeometry.dispose();
      hitMaterial.dispose();
    };
  }, [planeGeometry, hitMaterial]);

  const planeSizes = useMemo(() => {
    return frustums.map(frustum => getFrustumPlaneSize(frustum.camera, cameraScale));
  }, [frustums, cameraScale]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;

    frustums.forEach((frustum, index) => {
      const size = planeSizes[index];
      const isSelected = frustum.image.imageId === selectedImageId;

      composePlaneHitTargetMatrix({
        matrix: tempMatrix,
        targetPosition: tempPosition,
        targetForward: tempForward,
        targetScale: tempScale,
        frustumPosition: frustum.position,
        frustumQuaternion: frustum.quaternion,
        planeSize: size,
        isSelected,
        touchMode,
      });
      mesh.setMatrixAt(index, tempMatrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [frustums, planeSizes, selectedImageId, touchMode]);

  if (frustums.length === 0) return null;

  const meshKey = getBatchedPlaneHitTargetMeshKey(frustums.length, frustums[0]?.image.imageId);

  return (
    <>
      <instancedMesh
        key={meshKey}
        ref={meshRef}
        dispose={null}
        args={[planeGeometry, hitMaterial, frustums.length]}
        {...interactionHandlers}
      />
      {!touchMode && tooltipData !== null && tooltipFrustum && (
        <Html
          style={getFixedCursorHtmlStyle(tooltipData)}
          calculatePosition={calculateFixedHtmlPosition}
        >
          <FrustumPlaneHoverCard
            imageName={tooltipFrustum.image.name}
            imageId={tooltipFrustum.image.imageId}
            cameraId={tooltipFrustum.image.cameraId}
            multiCamera={multiCamera}
            numPoints3D={tooltipFrustum.numPoints3D}
            isSelected={false}
            isMatched={matchedImageIds.has(tooltipFrustum.image.imageId)}
            wouldGoBack={tooltipFrustum.image.imageId === lastNavigationToImageId}
            cameraProjection="orthographic"
          />
        </Html>
      )}
    </>
  );
}
