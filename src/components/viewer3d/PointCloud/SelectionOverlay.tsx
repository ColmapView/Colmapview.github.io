/**
 * Selection overlay component for highlighted points.
 * Renders points that are visible in the selected camera.
 */

import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useSelectionAnimation } from '../../../hooks/pointCloud/useSelectionAnimation';
import type { SelectionColorMode } from '../../../store/types';

export interface SelectionOverlayProps {
  selectedPositions: Float32Array;
  selectedColors: Float32Array;
  pointSize: number;
  selectedImageId: number | null;
  selectionColorMode: SelectionColorMode;
  selectionAnimationSpeed: number;
  selectionColor: string;
}

/**
 * Component that renders the selection overlay for highlighted points.
 * Supports animated color modes (rainbow, blink, static).
 */
export function SelectionOverlay(props: SelectionOverlayProps): React.JSX.Element {
  const {
    selectedPositions,
    selectedColors,
    pointSize,
    selectedImageId,
    selectionColorMode,
    selectionAnimationSpeed,
    selectionColor,
  } = props;

  const { selectedMaterialRef } = useSelectionAnimation({
    selectedImageId,
    selectionColorMode,
    selectionAnimationSpeed,
    selectionColor,
  });

  const geometry = useMemo(() => {
    if (!selectedPositions || !selectedColors || selectedPositions.length === 0) return null;

    // Validate positions for NaN values before creating geometry
    // NaN positions cause computeBoundingSphere to fail and points to disappear
    let hasNaN = false;
    for (let i = 0; i < selectedPositions.length; i++) {
      if (!Number.isFinite(selectedPositions[i])) {
        hasNaN = true;
        break;
      }
    }

    if (hasNaN) {
      console.warn('[SelectionOverlay] Positions contain NaN/Infinity values, skipping geometry creation');
      return null;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(selectedPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(selectedColors, 3));
    geo.computeBoundingSphere();
    return geo;
  }, [selectedPositions, selectedColors]);

  // Dispose geometry when it changes to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) return <></>;

  return (
    <points
      matrixAutoUpdate={false}
      geometry={geometry}
      renderOrder={2}
      raycast={() => {
        // Disable raycasting for overlay
      }}
    >
      <pointsMaterial
        ref={selectedMaterialRef}
        size={pointSize + 1}
        vertexColors={false}
        color={selectionColor}
        transparent
        sizeAttenuation={false}
        depthTest={false}
      />
    </points>
  );
}
