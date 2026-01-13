import { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useReconstructionStore, useViewerStore } from '../../store';

// Cycle through dark saturated colors (no white transition)
function rainbowColor(t: number): THREE.Color {
  // Use HSL with full saturation and reduced lightness for darker colors
  const hue = t % 1;
  const saturation = 1.0;
  const lightness = 0.4; // Darker than default 0.5
  return new THREE.Color().setHSL(hue, saturation, lightness);
}

function jetColormap(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.25) {
    return [0, t * 4, 1];
  } else if (t < 0.5) {
    return [0, 1, 1 - (t - 0.25) * 4];
  } else if (t < 0.75) {
    return [(t - 0.5) * 4, 1, 0];
  } else {
    return [1, 1 - (t - 0.75) * 4, 0];
  }
}

// Convert sRGB to linear color space (Three.js expects linear vertex colors)
function sRGBToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function PointCloud() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const colorMode = useViewerStore((s) => s.colorMode);
  const pointSize = useViewerStore((s) => s.pointSize);
  const minTrackLength = useViewerStore((s) => s.minTrackLength);
  const selectedImageId = useViewerStore((s) => s.selectedImageId);
  const rainbowMode = useViewerStore((s) => s.rainbowMode);
  const rainbowSpeed = useViewerStore((s) => s.rainbowSpeed);
  const selectedMaterialRef = useRef<THREE.PointsMaterial>(null);
  const [rainbowHue, setRainbowHue] = useState(0);

  useFrame((_, delta) => {
    if (rainbowMode && selectedImageId !== null) {
      setRainbowHue((h) => (h + delta * rainbowSpeed * 0.5) % 1);
    }
  });

  // Update selected points color when rainbow mode is active
  useEffect(() => {
    if (!selectedMaterialRef.current) return;
    if (rainbowMode) {
      selectedMaterialRef.current.vertexColors = false;
      selectedMaterialRef.current.color = rainbowColor(rainbowHue);
      selectedMaterialRef.current.needsUpdate = true;
    } else {
      selectedMaterialRef.current.vertexColors = true;
      selectedMaterialRef.current.needsUpdate = true;
    }
  }, [rainbowMode, rainbowHue]);

  const { positions, colors, selectedPositions, selectedColors } = useMemo(() => {
    if (!reconstruction) return { positions: null, colors: null, selectedPositions: null, selectedColors: null };

    const allPoints = Array.from(reconstruction.points3D.values())
      .filter(p => p.track.length >= minTrackLength);

    if (allPoints.length === 0) return { positions: null, colors: null, selectedPositions: null, selectedColors: null };

    const selectedImagePointIds = new Set<bigint>();
    if (selectedImageId !== null) {
      const selectedImage = reconstruction.images.get(selectedImageId);
      if (selectedImage) {
        for (const p2d of selectedImage.points2D) {
          if (p2d.point3DId !== BigInt(-1)) {
            selectedImagePointIds.add(p2d.point3DId);
          }
        }
      }
    }

    const regularPoints = allPoints.filter(p => !selectedImagePointIds.has(p.point3DId));
    const highlightedPoints = allPoints.filter(p => selectedImagePointIds.has(p.point3DId));

    let minError = Infinity, maxError = -Infinity;
    let minTrack = Infinity, maxTrack = -Infinity;

    for (const p of allPoints) {
      if (p.error >= 0) {
        minError = Math.min(minError, p.error);
        maxError = Math.max(maxError, p.error);
      }
      minTrack = Math.min(minTrack, p.track.length);
      maxTrack = Math.max(maxTrack, p.track.length);
    }

    if (minError === maxError) maxError = minError + 1;
    if (minTrack === maxTrack) maxTrack = minTrack + 1;

    const HIGHLIGHT_COLOR: [number, number, number] = [1, 0, 1];

    const computeColor = (point: typeof allPoints[0], mode: string): [number, number, number] => {
      if (mode === 'error') {
        const errorNorm = point.error >= 0 ? (point.error - minError) / (maxError - minError) : 0;
        return jetColormap(errorNorm);
      } else if (mode === 'trackLength') {
        const trackNorm = (point.track.length - minTrack) / (maxTrack - minTrack);
        return [0.1 + trackNorm * 0.1, 0.1 + trackNorm * 0.9, 0.5 - trackNorm * 0.2];
      }
      // Convert sRGB colors from COLMAP to linear space for proper rendering
      return [
        sRGBToLinear(point.rgb[0] / 255),
        sRGBToLinear(point.rgb[1] / 255),
        sRGBToLinear(point.rgb[2] / 255),
      ];
    };

    // Regular points
    const positions = new Float32Array(regularPoints.length * 3);
    const colors = new Float32Array(regularPoints.length * 3);
    regularPoints.forEach((point, i) => {
      const i3 = i * 3;
      positions[i3] = point.xyz[0];
      positions[i3 + 1] = point.xyz[1];
      positions[i3 + 2] = point.xyz[2];
      const c = computeColor(point, colorMode);
      colors.set(c, i3);
    });

    // Selected/highlighted points
    const selectedPositions = new Float32Array(highlightedPoints.length * 3);
    const selectedColors = new Float32Array(highlightedPoints.length * 3);
    highlightedPoints.forEach((point, i) => {
      const i3 = i * 3;
      selectedPositions[i3] = point.xyz[0];
      selectedPositions[i3 + 1] = point.xyz[1];
      selectedPositions[i3 + 2] = point.xyz[2];
      selectedColors.set(HIGHLIGHT_COLOR, i3);
    });

    return { positions, colors, selectedPositions, selectedColors };
  }, [reconstruction, colorMode, minTrackLength, selectedImageId]);

  // Create geometry objects in useMemo to ensure proper updates when reconstruction changes
  const geometry = useMemo(() => {
    if (!positions || !colors) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    return geo;
  }, [positions, colors]);

  const selectedGeometry = useMemo(() => {
    if (!selectedPositions || !selectedColors || selectedPositions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(selectedPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(selectedColors, 3));
    geo.computeBoundingSphere();
    return geo;
  }, [selectedPositions, selectedColors]);

  if (!geometry) return null;

  return (
    <>
      <points matrixAutoUpdate={false} geometry={geometry}>
        <pointsMaterial size={pointSize} vertexColors sizeAttenuation={false} />
      </points>
      {selectedGeometry && (
        <points matrixAutoUpdate={false} geometry={selectedGeometry}>
          <pointsMaterial
            ref={selectedMaterialRef}
            size={pointSize + 1}
            vertexColors={!rainbowMode}
            color={rainbowMode ? rainbowColor(rainbowHue) : undefined}
            sizeAttenuation={false}
          />
        </points>
      )}
    </>
  );
}
