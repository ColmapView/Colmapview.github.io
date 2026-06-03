import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Camera, Image } from '../../types/colmap';
import type { SelectionColorMode } from '../../store/types';
import { RAINBOW, VIZ_COLORS } from '../../theme';
import { lineFragmentShader, lineVertexShader } from './shaders';
import {
  buildFrustumLineGeometryData,
} from './cameraFrustumViewModel';
import {
  getFrustumLineStyle,
  getMatchesBlinkFactor,
  hasFrustumLineRenderStateChanged,
  setRainbowColor,
  type FrustumLineColorSource,
  type FrustumLineRenderState,
} from './cameraFrustumStylePolicy';
import { getFloat32BufferAttribute } from './threeBufferAttributes';

interface BatchedFrustumLinesProps {
  frustums: {
    image: Image;
    camera: Camera;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    cameraIndex: number;
  }[];
  cameraScale: number;
  selectedImageId: number | null;
  hoveredImageId: number | null;
  matchedImageIds: Set<number>;
  matchesOpacity: number;
  matchesDisplayMode: 'off' | 'static' | 'blink';
  matchesColor: string;
  frustumColorMode: 'single' | 'byCamera' | 'byRigFrame';
  frustumSingleColor: string;
  frustumStandbyOpacity: number;
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;
  unselectedCameraOpacity: number;
  showImagePlanes: boolean;
  imageFrameIndexMap: Map<number, number>;
  pendingDeletions?: Set<number>;
}

const tempColor = new THREE.Color();
const tempBaseColor = new THREE.Color();

function applyFrustumLineColor(
  color: THREE.Color,
  source: FrustumLineColorSource,
  {
    baseColor,
    rainbowHue,
    selectionColor,
    matchesColor,
  }: {
    baseColor: THREE.ColorRepresentation;
    rainbowHue: number;
    selectionColor: string;
    matchesColor: string;
  }
): void {
  switch (source) {
    case 'deleted':
      color.set(VIZ_COLORS.frustum.deleted ?? '#ff4444');
      break;
    case 'hover':
      color.set(VIZ_COLORS.frustum.hover);
      break;
    case 'selectionRainbow':
      setRainbowColor(color, rainbowHue);
      break;
    case 'selection':
      color.set(selectionColor);
      break;
    case 'matches':
      color.set(matchesColor);
      break;
    case 'base':
      color.set(baseColor);
      break;
  }
}

export function BatchedFrustumLines({
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
  showImagePlanes,
  imageFrameIndexMap,
  pendingDeletions,
}: BatchedFrustumLinesProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const rainbowHueRef = useRef(0);
  const matchesBlinkPhaseRef = useRef(0);
  const prevStateRef = useRef<FrustumLineRenderState | null>(null);

  const { positions, baseColors, baseAlphas } = useMemo(() => {
    return buildFrustumLineGeometryData(frustums, cameraScale, {
      frustumColorMode,
      frustumSingleColor,
      imageFrameIndexMap,
    });
  }, [frustums, cameraScale, frustumColorMode, frustumSingleColor, imageFrameIndexMap]);

  useFrame((state, delta) => {
    if (!geometryRef.current) return;

    const colorAttr = getFloat32BufferAttribute(geometryRef.current, 'color');
    const alphaAttr = getFloat32BufferAttribute(geometryRef.current, 'alpha');
    if (!colorAttr || !alphaAttr) return;

    const isSelectionAnimated = (selectionColorMode === 'blink' || selectionColorMode === 'rainbow') && selectedImageId !== null;
    const isMatchesAnimated = matchesDisplayMode === 'blink' && matchedImageIds.size > 0;
    const isAnimated = isSelectionAnimated || isMatchesAnimated;

    const currentState: FrustumLineRenderState = {
      selectedImageId,
      hoveredImageId,
      matchedImageIds,
      matchedImageCount: matchedImageIds.size,
      pendingDeletions,
      pendingDeletionCount: pendingDeletions?.size ?? 0,
      unselectedCameraOpacity,
      matchesOpacity,
      matchesDisplayMode,
      matchesColor,
      showImagePlanes,
      frustumStandbyOpacity,
      selectionColorMode,
      selectionColor,
      selectionAnimationSpeed,
      baseColorData: baseColors,
    };
    const stateChanged = hasFrustumLineRenderStateChanged(prevStateRef.current, currentState);

    if (!isAnimated && !stateChanged) return;

    prevStateRef.current = currentState;

    const colors = colorAttr.array;
    const alphas = alphaAttr.array;

    if (isSelectionAnimated && selectionColorMode === 'rainbow') {
      rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
    }
    if (isMatchesAnimated) {
      matchesBlinkPhaseRef.current = (matchesBlinkPhaseRef.current + delta) % 2;
    }
    const blinkPhase = state.clock.elapsedTime * selectionAnimationSpeed * 2;

    frustums.forEach((frustum, index) => {
      const offset = index * 48;
      const alphaOffset = index * 16;
      const isSelected = frustum.image.imageId === selectedImageId;
      const isHovered = frustum.image.imageId === hoveredImageId;
      const isMatched = matchedImageIds.has(frustum.image.imageId);
      const isPendingDeletion = pendingDeletions?.has(frustum.image.imageId) ?? false;

      const style = getFrustumLineStyle({
        isSelected,
        isHovered,
        isMatched,
        isPendingDeletion,
        hasSelectedImage: selectedImageId !== null,
        showImagePlanes,
        frustumStandbyOpacity,
        matchesOpacity,
        unselectedCameraOpacity,
        selectionColorMode,
        matchesDisplayMode,
        selectionBlinkFactor: (Math.sin(blinkPhase) + 1) / 2,
        matchesBlinkFactor: getMatchesBlinkFactor(matchesBlinkPhaseRef.current),
      });

      tempBaseColor.setRGB(baseColors[offset], baseColors[offset + 1], baseColors[offset + 2]);
      applyFrustumLineColor(tempColor, style.colorSource, {
        baseColor: tempBaseColor,
        rainbowHue: rainbowHueRef.current,
        selectionColor,
        matchesColor,
      });

      for (let vertex = 0; vertex < 16; vertex++) {
        colors[offset + vertex * 3 + 0] = tempColor.r;
        colors[offset + vertex * 3 + 1] = tempColor.g;
        colors[offset + vertex * 3 + 2] = tempColor.b;
        alphas[alphaOffset + vertex] = style.opacity;
      }
    });

    colorAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  });

  const initialColors = useMemo(() => {
    return new Float32Array(baseColors);
  }, [baseColors]);

  const initialAlphas = useMemo(() => {
    const alphas = new Float32Array(baseAlphas.length);
    const opacity = selectedImageId === null ? frustumStandbyOpacity : unselectedCameraOpacity;
    for (let i = 0; i < baseAlphas.length; i++) {
      alphas[i] = opacity;
    }
    return alphas;
  }, [baseAlphas.length, frustumStandbyOpacity, unselectedCameraOpacity, selectedImageId]);

  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  }, []);

  if (frustums.length === 0) return null;

  return (
    <lineSegments material={shaderMaterial} renderOrder={2}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[initialColors, 3]}
        />
        <bufferAttribute
          attach="attributes-alpha"
          args={[initialAlphas, 1]}
        />
      </bufferGeometry>
    </lineSegments>
  );
}
