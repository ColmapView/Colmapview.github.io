import { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useReconstructionStore, useViewerStore } from '../../store';

// Convert hue (0-1) to THREE.Color
function hueToColor(hue: number): THREE.Color {
  const h = hue * 6;
  const c = 1;
  const x = 1 - Math.abs(h % 2 - 1);
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; }
  else if (h < 2) { r = x; g = c; }
  else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; }
  else if (h < 5) { r = x; b = c; }
  else { r = c; b = x; }
  return new THREE.Color(r, g, b);
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

export function PointCloud() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const colorMode = useViewerStore((s) => s.colorMode);
  const pointSize = useViewerStore((s) => s.pointSize);
  const minTrackLength = useViewerStore((s) => s.minTrackLength);
  const selectedImageId = useViewerStore((s) => s.selectedImageId);
  const rainbowMode = useViewerStore((s) => s.rainbowMode);
  const rainbowSpeed = useViewerStore((s) => s.rainbowSpeed);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const selectedGeometryRef = useRef<THREE.BufferGeometry>(null);
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
      selectedMaterialRef.current.color = hueToColor(rainbowHue);
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
      return [point.rgb[0] / 255, point.rgb[1] / 255, point.rgb[2] / 255];
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

  useEffect(() => {
    if (!geometryRef.current || !positions || !colors) return;
    const geometry = geometryRef.current;
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
  }, [positions, colors]);

  useEffect(() => {
    if (!selectedGeometryRef.current || !selectedPositions || !selectedColors) return;
    const geometry = selectedGeometryRef.current;
    geometry.setAttribute('position', new THREE.BufferAttribute(selectedPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(selectedColors, 3));
    geometry.computeBoundingSphere();
  }, [selectedPositions, selectedColors]);

  if (!positions || !colors) return null;

  return (
    <>
      <points matrixAutoUpdate={false}>
        <bufferGeometry ref={geometryRef} />
        <pointsMaterial size={pointSize} vertexColors sizeAttenuation={false} />
      </points>
      {selectedPositions && selectedPositions.length > 0 && (
        <points matrixAutoUpdate={false}>
          <bufferGeometry ref={selectedGeometryRef} />
          <pointsMaterial
            ref={selectedMaterialRef}
            size={pointSize + 1}
            vertexColors={!rainbowMode}
            color={rainbowMode ? hueToColor(rainbowHue) : undefined}
            sizeAttenuation={false}
          />
        </points>
      )}
    </>
  );
}
