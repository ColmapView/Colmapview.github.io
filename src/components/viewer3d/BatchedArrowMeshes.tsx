import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { SelectionColorMode } from '../../store/types';
import type { Camera, Image } from '../../types/colmap';
import { VIZ_COLORS, RAINBOW } from '../../theme';
import {
  getFrustumBaseColor,
  type FrustumPsnrMetricSource,
  type FrustumColorMode,
} from './cameraFrustumViewModel';
import {
  getFrustumArrowStyle,
  getMatchesBlinkFactor,
  setRainbowColor,
  type FrustumMatchesDisplayMode,
} from './cameraFrustumStylePolicy';
import { FrustumPlaneHoverCard } from './FrustumPlaneHoverCard';
import { syncMaterialOpacity } from './threeMaterialMutations';
import { useTrackballDraggingReader } from './trackballControlsApi';
import { useBatchedFrustumInteractions } from './useBatchedFrustumInteractions';
import { calculateFixedHtmlPosition, getFixedCursorHtmlStyle } from './htmlOverlayStylePolicy';
import { useFrustumHoverCardStoreFacade } from './useFrustumHoverCardStoreFacade';

interface BatchedArrowMeshesProps {
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
  hoveredImageId: number | null;
  matchedImageIds: Set<number>;
  matchesOpacity: number;
  matchesDisplayMode: FrustumMatchesDisplayMode;
  matchesColor: string;
  frustumColorMode: FrustumColorMode;
  frustumSingleColor: string;
  frustumStandbyOpacity: number;
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;
  unselectedCameraOpacity: number;
  imageFrameIndexMap: Map<number, number>;
  splatPsnrByImage: FrustumPsnrMetricSource;
  onHover: (id: number | null) => void;
  onClick: (imageId: number) => void;
  onContextMenu: (imageId: number) => void;
  onLongPress: (imageId: number) => void;
  lastNavigationToImageId: number | null;
  touchMode?: boolean;
  pendingDeletions?: Set<number>;
}

const tempColor = new THREE.Color();
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3(1, 1, 1);
const tempEuler = new THREE.Euler();

export function BatchedArrowMeshes({
  frustums,
  cameraScale,
  selectedImageId,
  hoveredImageId,
  matchedImageIds,
  matchesOpacity,
  matchesDisplayMode,
  matchesColor,
  frustumColorMode,
  frustumSingleColor,
  frustumStandbyOpacity,
  selectionColorMode,
  selectionColor,
  selectionAnimationSpeed,
  unselectedCameraOpacity,
  imageFrameIndexMap,
  splatPsnrByImage,
  onHover,
  onClick,
  onContextMenu,
  onLongPress,
  lastNavigationToImageId,
  touchMode = false,
  pendingDeletions,
}: BatchedArrowMeshesProps) {
  const { multiCamera } = useFrustumHoverCardStoreFacade();
  const shaftRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const rainbowHueRef = useRef(0);
  const matchesBlinkPhaseRef = useRef(0);
  const prevSelectedRef = useRef<number | null>(null);
  const prevHoveredRef = useRef<number | null>(null);
  const needsUpdateRef = useRef(true);
  const imageIdToIndex = useMemo(() => {
    const map = new Map<number, number>();
    frustums.forEach((frustum, index) => {
      map.set(frustum.image.imageId, index);
    });
    return map;
  }, [frustums]);

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

  const shaftLength = cameraScale * 0.8;
  const shaftRadius = cameraScale * 0.04;
  const coneLength = cameraScale * 0.2;
  const coneRadius = cameraScale * 0.08;

  const shaftGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8);
    geo.computeBoundingSphere();
    return geo;
  }, [shaftRadius, shaftLength]);

  const coneGeometry = useMemo(() => {
    const geo = new THREE.ConeGeometry(coneRadius, coneLength, 12);
    geo.computeBoundingSphere();
    return geo;
  }, [coneRadius, coneLength]);

  const shaftMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), []);
  const coneMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), []);

  useEffect(() => {
    return () => {
      shaftGeometry.dispose();
      coneGeometry.dispose();
    };
  }, [shaftGeometry, coneGeometry]);

  useEffect(() => {
    return () => {
      shaftMaterial.dispose();
      coneMaterial.dispose();
    };
  }, [shaftMaterial, coneMaterial]);

  useFrame((state, delta) => {
    if (!shaftRef.current || !coneRef.current) return;
    const shaft = shaftRef.current;
    const cone = coneRef.current;

    const isSelectionAnimated = (selectionColorMode === 'blink' || selectionColorMode === 'rainbow') && selectedImageId !== null;
    const isMatchesAnimated = matchesDisplayMode === 'blink' && matchedImageIds.size > 0;

    if (isSelectionAnimated) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
      }
    }
    if (isMatchesAnimated) {
      matchesBlinkPhaseRef.current = (matchesBlinkPhaseRef.current + delta) % 2;
    }

    const blinkPhase = state.clock.elapsedTime * selectionAnimationSpeed * 2;
    const stateChanged =
      selectedImageId !== prevSelectedRef.current ||
      hoveredImageId !== prevHoveredRef.current;

    const forceFullUpdate = stateChanged || needsUpdateRef.current;
    if (!isSelectionAnimated && !isMatchesAnimated && !forceFullUpdate) {
      return;
    }

    prevSelectedRef.current = selectedImageId;
    prevHoveredRef.current = hoveredImageId;
    needsUpdateRef.current = false;

    const updateArrow = (i: number) => {
      const f = frustums[i];
      if (!f) return false;
      const isSelected = f.image.imageId === selectedImageId;
      const isHovered = f.image.imageId === hoveredImageId;
      const isMatched = matchedImageIds.has(f.image.imageId);
      const isPendingDeletion = pendingDeletions?.has(f.image.imageId) ?? false;

      const style = getFrustumArrowStyle({
        isSelected,
        isHovered,
        isMatched,
        isPendingDeletion,
        matchesOpacity,
        selectionColorMode,
        matchesDisplayMode,
        selectionBlinkFactor: (Math.sin(blinkPhase) + 1) / 2,
        matchesBlinkFactor: getMatchesBlinkFactor(matchesBlinkPhaseRef.current),
      });

      tempScale.set(style.scale, style.scale, style.scale);

      switch (style.colorSource) {
        case 'deleted':
          tempColor.set(VIZ_COLORS.frustum.deleted ?? '#ff4444');
          break;
        case 'hover':
          tempColor.set(VIZ_COLORS.frustum.hover);
          break;
        case 'selectionRainbow':
          setRainbowColor(tempColor, rainbowHueRef.current);
          break;
        case 'selection':
          tempColor.set(selectionColor);
          break;
        case 'matches':
          tempColor.set(matchesColor);
          break;
        case 'base':
          tempColor.set(getFrustumBaseColor(
            frustumColorMode,
            f.cameraIndex,
            f.image.imageId,
            imageFrameIndexMap,
            frustumSingleColor,
            splatPsnrByImage
          ));
          break;
      }

      if (style.colorIntensity !== 1) {
        tempColor.multiplyScalar(style.colorIntensity);
      }

      tempEuler.set(Math.PI / 2, 0, 0);
      tempQuaternion.setFromEuler(tempEuler);
      tempQuaternion.premultiply(f.quaternion);

      tempPosition.set(0, 0, shaftLength / 2);
      tempPosition.applyQuaternion(f.quaternion);
      tempPosition.add(f.position);

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      shaft.setMatrixAt(i, tempMatrix);
      shaft.setColorAt(i, tempColor);

      tempPosition.set(0, 0, shaftLength + coneLength / 2);
      tempPosition.applyQuaternion(f.quaternion);
      tempPosition.add(f.position);

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      cone.setMatrixAt(i, tempMatrix);
      cone.setColorAt(i, tempColor);
      return true;
    };

    let updatedAny = false;
    if ((isSelectionAnimated || isMatchesAnimated) && !forceFullUpdate) {
      const animatedIndices = new Set<number>();
      if (isSelectionAnimated && selectedImageId !== null) {
        const selectedIndex = imageIdToIndex.get(selectedImageId);
        if (selectedIndex !== undefined) animatedIndices.add(selectedIndex);
      }
      if (isMatchesAnimated) {
        matchedImageIds.forEach((imageId) => {
          const index = imageIdToIndex.get(imageId);
          if (index !== undefined) animatedIndices.add(index);
        });
      }
      animatedIndices.forEach((index) => {
        updatedAny = updateArrow(index) || updatedAny;
      });
    } else {
      for (let i = 0; i < frustums.length; i++) {
        updatedAny = updateArrow(i) || updatedAny;
      }
    }

    if (!updatedAny) return;

    shaft.instanceMatrix.needsUpdate = true;
    cone.instanceMatrix.needsUpdate = true;
    if (shaft.instanceColor) shaft.instanceColor.needsUpdate = true;
    if (cone.instanceColor) cone.instanceColor.needsUpdate = true;
  });

  useEffect(() => {
    needsUpdateRef.current = true;
  }, [
    frustums,
    cameraScale,
    matchedImageIds,
    matchesOpacity,
    matchesDisplayMode,
    matchesColor,
    frustumColorMode,
    frustumSingleColor,
    selectionColorMode,
    selectionColor,
    selectionAnimationSpeed,
    imageFrameIndexMap,
    splatPsnrByImage,
    pendingDeletions,
  ]);

  useLayoutEffect(() => {
    if (!shaftRef.current || !coneRef.current) return;
    const shaft = shaftRef.current;
    const cone = coneRef.current;

    frustums.forEach((f, i) => {
      const isSelected = f.image.imageId === selectedImageId;
      tempScale.set(isSelected ? 0 : 1, isSelected ? 0 : 1, isSelected ? 0 : 1);

      tempEuler.set(Math.PI / 2, 0, 0);
      tempQuaternion.setFromEuler(tempEuler);
      tempQuaternion.premultiply(f.quaternion);

      tempPosition.set(0, 0, shaftLength / 2);
      tempPosition.applyQuaternion(f.quaternion);
      tempPosition.add(f.position);

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      shaft.setMatrixAt(i, tempMatrix);

      tempPosition.set(0, 0, shaftLength + coneLength / 2);
      tempPosition.applyQuaternion(f.quaternion);
      tempPosition.add(f.position);

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      cone.setMatrixAt(i, tempMatrix);
    });

    shaft.instanceMatrix.needsUpdate = true;
    cone.instanceMatrix.needsUpdate = true;
    shaft.computeBoundingSphere();
    cone.computeBoundingSphere();
  }, [frustums, selectedImageId, shaftLength, coneLength]);

  useEffect(() => {
    const opacity = selectedImageId === null ? frustumStandbyOpacity : unselectedCameraOpacity;
    syncMaterialOpacity(shaftMaterial, opacity);
    syncMaterialOpacity(coneMaterial, opacity);
  }, [shaftMaterial, coneMaterial, selectedImageId, frustumStandbyOpacity, unselectedCameraOpacity]);

  if (frustums.length === 0) return null;

  const meshKey = `arrows-${frustums.length}-${frustums[0]?.image.imageId ?? 0}-${cameraScale.toFixed(4)}`;

  return (
    <>
      <instancedMesh
        key={meshKey}
        ref={shaftRef}
        dispose={null}
        args={[shaftGeometry, shaftMaterial, frustums.length]}
        {...interactionHandlers}
      />
      <instancedMesh
        key={`${meshKey}-cone`}
        ref={coneRef}
        dispose={null}
        args={[coneGeometry, coneMaterial, frustums.length]}
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
            splatPsnr={splatPsnrByImage.get(tooltipFrustum.image.imageId)?.psnr}
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
