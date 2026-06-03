import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRigNode, useSelectionNode } from '../../nodes';
import { lineVertexShader, lineFragmentShader } from './shaders';
import {
  buildRigConnectionGeometryData,
  getRigConnectionAlpha,
  getRigConnectionBlinkOpacityFactor,
  hasRigConnectionRenderStateChanged,
  shouldRestoreRigConnectionFrameColors,
  type RigConnectionRenderState,
} from './rigConnectionsViewModel';
import { getFloat32BufferAttribute } from './threeBufferAttributes';
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

  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const blinkPhaseRef = useRef(0);
  const prevStateRef = useRef<RigConnectionRenderState | null>(null);

  const geometryData = useMemo(() => {
    if (!rig.visible || !reconstruction) return null;
    return buildRigConnectionGeometryData(reconstruction.images.values());
  }, [reconstruction, rig.visible]);

  useEffect(() => {
    prevStateRef.current = null;
  }, [geometryData]);

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Push lines slightly back in depth to avoid rendering in front of image planes
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }, []);

  // Update colors and alphas based on selection, color mode, and blink animation
  useFrame((_, delta) => {
    if (!geometryRef.current || !geometryData) return;

    const colorAttr = getFloat32BufferAttribute(geometryRef.current, 'color');
    const alphaAttr = getFloat32BufferAttribute(geometryRef.current, 'alpha');
    if (!colorAttr || !alphaAttr) return;

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

    for (let i = 0; i < alphaAttr.count; i++) {
      alphaAttr.setX(i, getRigConnectionAlpha({
        frameImageIds: lineFrameImageIds[i],
        selectedImageId: currentState.selectedImageId,
        rigOpacity: currentState.rigOpacity,
        unselectedOpacity: currentState.unselectedOpacity,
        blinkOpacityFactor,
      }));
    }

    // Update colors based on color mode
    if (currentState.colorMode === 'single') {
      tempColor.set(rig.color);
      for (let i = 0; i < colorAttr.count; i++) {
        colorAttr.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
      }
      colorAttr.needsUpdate = true;
    } else if (shouldRestoreRigConnectionFrameColors(previousState, currentState)) {
      const colors = colorAttr.array;
      colors.set(geometryData.colors);
      colorAttr.needsUpdate = true;
    }

    alphaAttr.needsUpdate = true;

    prevStateRef.current = currentState;
  });

  if (!rig.visible || !geometryData) return null;

  return (
    <lineSegments material={shaderMaterial} renderOrder={2}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[geometryData.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[geometryData.colors, 3]}
        />
        <bufferAttribute
          attach="attributes-alpha"
          args={[geometryData.alphas, 1]}
        />
      </bufferGeometry>
    </lineSegments>
  );
}
