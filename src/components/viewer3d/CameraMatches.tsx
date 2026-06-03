import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCamerasNode, useMatchesNode, useSelectionNode } from '../../nodes';
import { getMatchesDisplayOpacity } from './cameraFrustumStylePolicy';
import { buildCameraMatchLinePositions } from './cameraMatchesViewModel';
import { useCameraMatchesStoreFacade } from './useCameraMatchesStoreFacade';

export function CameraMatches() {
  const { reconstruction } = useCameraMatchesStoreFacade();

  const cameras = useCamerasNode();
  const selection = useSelectionNode();
  const matches = useMatchesNode();

  const { selectedImageId } = selection;
  const { displayMode: cameraDisplayMode } = cameras;
  const {
    visible: showMatches,
    displayMode: matchesDisplayMode,
    opacity: matchesOpacity,
    color: matchesColor,
  } = matches;

  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const blinkPhaseRef = useRef(0);

  useFrame((_, delta) => {
    if (!showMatches || !materialRef.current) return;

    if (matchesDisplayMode === 'blink') {
      blinkPhaseRef.current = (blinkPhaseRef.current + delta) % 2;
    }

    materialRef.current.opacity = getMatchesDisplayOpacity(
      matchesOpacity,
      matchesDisplayMode,
      blinkPhaseRef.current
    );
  });

  const linePositions = useMemo(() => buildCameraMatchLinePositions({
    reconstruction,
    selectedImageId,
    showMatches,
    cameraDisplayMode,
  }), [reconstruction, selectedImageId, showMatches, cameraDisplayMode]);

  const geometry = useMemo(() => {
    if (!linePositions) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    return geo;
  }, [linePositions]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!showMatches || cameraDisplayMode === 'imageplane' || !geometry) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={999}>
      <lineBasicMaterial
        ref={materialRef}
        color={matchesColor}
        transparent
        opacity={matchesOpacity}
        depthTest={false}
      />
    </lineSegments>
  );
}
