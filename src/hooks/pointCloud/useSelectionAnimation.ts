/**
 * Hook for selection overlay animation (rainbow/blink effects).
 */

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { SelectionColorMode } from '../../store/types';
import { RAINBOW } from '../../theme';
import { rainbowColor } from '../../utils/colorUtils';

export interface UseSelectionAnimationParams {
  selectedImageId: number | null;
  selectionColorMode: SelectionColorMode;
  selectionAnimationSpeed: number;
  selectionColor: string;
}

export interface UseSelectionAnimationResult {
  selectedMaterialRef: React.RefObject<THREE.PointsMaterial | null>;
}

/**
 * Hook that manages selection overlay material animation.
 *
 * Supports three animation modes:
 * - rainbow: Cycles through hues at configured speed
 * - blink: Pulses brightness using sine wave
 * - static: Solid selection color
 *
 * @param params - Configuration parameters
 * @returns Ref to the animated material
 */
export function useSelectionAnimation(
  params: UseSelectionAnimationParams
): UseSelectionAnimationResult {
  const { selectedImageId, selectionColorMode, selectionAnimationSpeed, selectionColor } = params;

  const selectedMaterialRef = useRef<THREE.PointsMaterial>(null);
  // Use ref instead of state to avoid re-renders on every frame
  const rainbowHueRef = useRef(0);
  const tempColorRef = useRef(new THREE.Color());

  // Update selection color directly in useFrame without triggering re-renders
  useFrame((state, delta) => {
    if (selectedImageId !== null && selectedMaterialRef.current) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current =
          (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
        selectedMaterialRef.current.color.copy(rainbowColor(rainbowHueRef.current));
        selectedMaterialRef.current.opacity = 1;
      } else if (selectionColorMode === 'blink') {
        // Blink: smooth sine wave pulse using intensity (0.2 to 1.0) for strong effect
        // Use clock.elapsedTime to stay in sync with frustum blink animation
        const blinkFactor = (Math.sin(state.clock.elapsedTime * selectionAnimationSpeed * 2) + 1) / 2;
        const intensity = 0.1 + 0.9 * blinkFactor;
        tempColorRef.current.set(selectionColor);
        selectedMaterialRef.current.color.setRGB(
          tempColorRef.current.r * intensity,
          tempColorRef.current.g * intensity,
          tempColorRef.current.b * intensity
        );
      } else if (selectionColorMode === 'static') {
        tempColorRef.current.set(selectionColor);
        selectedMaterialRef.current.color.copy(tempColorRef.current);
        selectedMaterialRef.current.opacity = 1;
      }
    }
  });

  // Handle selection color mode change (only runs when selectionColorMode or selectionColor changes)
  useEffect(() => {
    if (!selectedMaterialRef.current) return;

    if (selectionColorMode === 'rainbow') {
      selectedMaterialRef.current.vertexColors = false;
      selectedMaterialRef.current.color.copy(rainbowColor(rainbowHueRef.current));
      selectedMaterialRef.current.opacity = 1;
      selectedMaterialRef.current.needsUpdate = true;
    } else if (selectionColorMode === 'blink') {
      selectedMaterialRef.current.vertexColors = false;
      selectedMaterialRef.current.color.set(selectionColor);
      selectedMaterialRef.current.transparent = true;
      selectedMaterialRef.current.needsUpdate = true;
    } else {
      // off or static: solid selection color
      selectedMaterialRef.current.vertexColors = false;
      selectedMaterialRef.current.color.set(selectionColor);
      selectedMaterialRef.current.opacity = 1;
      selectedMaterialRef.current.needsUpdate = true;
    }
  }, [selectionColorMode, selectionColor]);

  return {
    selectedMaterialRef,
  };
}
