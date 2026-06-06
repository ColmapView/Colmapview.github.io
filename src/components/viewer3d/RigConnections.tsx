import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRigNode, useSelectionNode } from '../../nodes';
import {
  buildRigConnectionGeometryData,
  getRigConnectionAlpha,
  getRigConnectionBlinkOpacityFactor,
  hasRigConnectionRenderStateChanged,
  shouldRestoreRigConnectionFrameColors,
  type RigConnectionRenderState,
} from './rigConnectionsViewModel';
import {
  createFatLineSegmentsObject,
  disposeFatLineSegmentsObject,
  getFatLineAlphaArray,
  getFatLineColorArray,
  markFatLineAlphasNeedUpdate,
  markFatLineColorsNeedUpdate,
} from './fatLineSegments';
import { syncMaterialLineWidth } from './threeMaterialMutations';
import { useRigConnectionsStoreFacade } from './useRigConnectionsStoreFacade';

const tempColor = new THREE.Color();

/**
 * RigConnections component renders visual connections between cameras
 * that belong to the same frame in a multi-camera rig.
 *
 * It infers rig connections from image names - images with the same
 * frame identifier (e.g., "cam_1/00.png" and "cam_2/00.png" share frame "00.png")
 * are connected with lines.
 */
export function RigConnections() {
  const { reconstruction } = useRigConnectionsStoreFacade();
  const rig = useRigNode();
  const selection = useSelectionNode();

  const blinkPhaseRef = useRef(0);
  const prevStateRef = useRef<RigConnectionRenderState | null>(null);

  const geometryData = useMemo(() => {
    if (!rig.visible || !reconstruction) return null;
    return buildRigConnectionGeometryData(reconstruction.images.values());
  }, [reconstruction, rig.visible]);

  useEffect(() => {
    prevStateRef.current = null;
  }, [geometryData]);

  const fatLines = useMemo(() => {
    if (!geometryData) return null;

    return createFatLineSegmentsObject({
      positions: geometryData.positions,
      colors: new Float32Array(geometryData.colors),
      alphas: new Float32Array(geometryData.alphas),
      lineWidth: 1,
      depthWrite: false,
      depthTest: true,
      // Push lines slightly back in depth to avoid rendering in front of image planes
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      renderOrder: 2,
    });
  }, [geometryData]);

  useLayoutEffect(() => {
    if (!fatLines) return;
    syncMaterialLineWidth(fatLines.material, rig.lineWidth);
  }, [fatLines, rig.lineWidth]);

  useEffect(() => {
    if (!fatLines) return undefined;
    return () => disposeFatLineSegmentsObject(fatLines);
  }, [fatLines]);

  // Update colors and alphas based on selection, color mode, and blink animation
  useFrame((_, delta) => {
    if (!geometryData || !fatLines) return;

    const colors = getFatLineColorArray(fatLines.geometry);
    const alphas = getFatLineAlphaArray(fatLines.geometry);
    if (!colors || !alphas) return;

    const isBlinkAnimated = rig.displayMode === 'blink';
    if (isBlinkAnimated) {
      blinkPhaseRef.current = (blinkPhaseRef.current + delta) % 2;
    }

    const currentState: RigConnectionRenderState = {
      selectedImageId: selection.selectedImageId,
      rigOpacity: rig.opacity,
      unselectedOpacity: selection.unselectedOpacity,
      colorMode: rig.colorMode,
      color: rig.color,
    };
    const previousState = prevStateRef.current;
    const stateChanged = hasRigConnectionRenderStateChanged(prevStateRef.current, currentState);

    if (!isBlinkAnimated && !stateChanged) return;

    const blinkOpacityFactor = getRigConnectionBlinkOpacityFactor(rig.displayMode, blinkPhaseRef.current);
    const { lineFrameImageIds } = geometryData;

    for (let i = 0; i < alphas.length; i++) {
      alphas[i] = getRigConnectionAlpha({
        frameImageIds: lineFrameImageIds[i],
        selectedImageId: currentState.selectedImageId,
        rigOpacity: currentState.rigOpacity,
        unselectedOpacity: currentState.unselectedOpacity,
        blinkOpacityFactor,
      });
    }

    // Update colors based on color mode
    if (currentState.colorMode === 'single') {
      tempColor.set(rig.color);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = tempColor.r;
        colors[i + 1] = tempColor.g;
        colors[i + 2] = tempColor.b;
      }
      markFatLineColorsNeedUpdate(fatLines.geometry);
    } else if (shouldRestoreRigConnectionFrameColors(previousState, currentState)) {
      colors.set(geometryData.colors);
      markFatLineColorsNeedUpdate(fatLines.geometry);
    }

    markFatLineAlphasNeedUpdate(fatLines.geometry);

    prevStateRef.current = currentState;
  });

  if (!rig.visible || !geometryData || !fatLines) return null;

  return <primitive object={fatLines.object} />;
}
