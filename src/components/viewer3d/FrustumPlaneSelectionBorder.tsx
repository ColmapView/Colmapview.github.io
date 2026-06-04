import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SelectionColorMode } from '../../store/types';
import { RAINBOW, VIZ_COLORS } from '../../theme';
import { rainbowColor } from '../../utils/colorUtils';
import type { FrustumPlaneSize } from './cameraFrustumViewModel';
import {
  getNextSelectionRainbowHue,
  getSelectionBlinkFactor,
  getSelectionBlinkOpacity,
} from './frustumPlaneSelectionBorderPolicy';
import {
  disposeMaterial,
  syncMaterialColor,
  syncMaterialOpacity,
} from './threeMaterialMutations';

interface FrustumPlaneSelectionBorderProps {
  color: string;
  planeSize: FrustumPlaneSize;
  selectionAnimationSpeed: number;
  selectionColorMode: SelectionColorMode;
}

export function FrustumPlaneSelectionBorder({
  color,
  planeSize,
  selectionAnimationSpeed,
  selectionColorMode,
}: FrustumPlaneSelectionBorderProps) {
  const rainbowHueRef = useRef(0);
  const borderLine = useMemo(() => {
    const halfWidth = planeSize.width / 2;
    const halfHeight = planeSize.height / 2;
    const points = [
      new THREE.Vector3(-halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, halfHeight, 0),
      new THREE.Vector3(-halfWidth, halfHeight, 0),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: VIZ_COLORS.frustum.selected, transparent: true });
    const line: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial> = new THREE.LineLoop(geometry, material);
    line.position.set(planeSize.offsetX, planeSize.offsetY, planeSize.depth);
    return line;
  }, [planeSize.width, planeSize.height, planeSize.depth, planeSize.offsetX, planeSize.offsetY]);

  useEffect(() => {
    return () => {
      borderLine.geometry.dispose();
      disposeMaterial(borderLine.material);
    };
  }, [borderLine]);

  useFrame((state, delta) => {
    const { material } = borderLine;
    if (selectionColorMode === 'rainbow') {
      rainbowHueRef.current = getNextSelectionRainbowHue({
        hue: rainbowHueRef.current,
        delta,
        animationSpeed: selectionAnimationSpeed,
        speedMultiplier: RAINBOW.speedMultiplier,
      });
      syncMaterialColor(material, rainbowColor(rainbowHueRef.current));
      return;
    }

    if (selectionColorMode === 'blink') {
      const blinkFactor = getSelectionBlinkFactor({
        elapsedTime: state.clock.elapsedTime,
        animationSpeed: selectionAnimationSpeed,
      });
      syncMaterialOpacity(material, getSelectionBlinkOpacity(blinkFactor));
      syncMaterialColor(material, color);
      return;
    }

    syncMaterialOpacity(material, 1);
    syncMaterialColor(material, color);
  });

  return <primitive object={borderLine} />;
}
