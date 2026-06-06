import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useCamerasNode, useMatchesNode, useSelectionNode } from '../../nodes';
import { getMatchesDisplayOpacity } from './cameraFrustumStylePolicy';
import { buildCameraMatchLinePositions } from './cameraMatchesViewModel';
import {
  createFatLineSegmentsObject,
  disposeFatLineSegmentsObject,
} from './fatLineSegments';
import {
  syncMaterialColor,
  syncMaterialLineWidth,
  syncMaterialOpacity,
} from './threeMaterialMutations';
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
    lineWidth: matchesLineWidth,
  } = matches;

  const blinkPhaseRef = useRef(0);

  const linePositions = useMemo(() => buildCameraMatchLinePositions({
    reconstruction,
    selectedImageId,
    showMatches,
    cameraDisplayMode,
  }), [reconstruction, selectedImageId, showMatches, cameraDisplayMode]);

  const fatLines = useMemo(() => {
    if (!linePositions) return null;
    return createFatLineSegmentsObject({
      positions: linePositions,
      lineWidth: 1,
      depthTest: false,
      depthWrite: false,
      renderOrder: 999,
    });
  }, [linePositions]);

  useEffect(() => {
    if (!fatLines) return undefined;
    return () => disposeFatLineSegmentsObject(fatLines);
  }, [fatLines]);

  useLayoutEffect(() => {
    if (!fatLines) return;
    syncMaterialColor(fatLines.material, matchesColor);
    syncMaterialLineWidth(fatLines.material, matchesLineWidth);
    syncMaterialOpacity(fatLines.material, getMatchesDisplayOpacity(
      matchesOpacity,
      matchesDisplayMode,
      blinkPhaseRef.current
    ));
  }, [fatLines, matchesColor, matchesLineWidth, matchesOpacity, matchesDisplayMode]);

  useFrame((_, delta) => {
    if (!showMatches || !fatLines) return;

    if (matchesDisplayMode === 'blink') {
      blinkPhaseRef.current = (blinkPhaseRef.current + delta) % 2;
    }

    syncMaterialOpacity(fatLines.material, getMatchesDisplayOpacity(
      matchesOpacity,
      matchesDisplayMode,
      blinkPhaseRef.current
    ));
  });

  if (!showMatches || cameraDisplayMode === 'imageplane' || !fatLines) return null;

  return <primitive object={fatLines.object} />;
}
