import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useReconstructionStore, usePointCloudStore, useCameraStore } from '../../store';
import type { Point3D } from '../../types/colmap';
import { VIZ_COLORS, BRIGHTNESS, RAINBOW, COLORMAP } from '../../theme';
import { sRGBToLinear, rainbowColor, jetColormap } from '../../utils/colorUtils';

export function PointCloud() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const colorMode = usePointCloudStore((s) => s.colorMode);
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const minTrackLength = usePointCloudStore((s) => s.minTrackLength);
  const maxReprojectionError = usePointCloudStore((s) => s.maxReprojectionError);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);
  const selectedMaterialRef = useRef<THREE.PointsMaterial>(null);
  // Use ref instead of state to avoid re-renders on every frame
  const rainbowHueRef = useRef(0);
  const blinkPhaseRef = useRef(0);

  // Update selection color directly in useFrame without triggering re-renders
  useFrame((_, delta) => {
    if (selectedImageId !== null && selectedMaterialRef.current) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
        selectedMaterialRef.current.color.copy(rainbowColor(rainbowHueRef.current));
      } else if (selectionColorMode === 'blink') {
        // Blink: smooth sine wave pulse between dim (0.1) and full brightness
        blinkPhaseRef.current += delta * selectionAnimationSpeed * 2; // radians for sine wave
        const blinkFactor = (Math.sin(blinkPhaseRef.current) + 1) / 2; // 0 to 1
        const intensity = 0.1 + 0.9 * blinkFactor;
        selectedMaterialRef.current.color.setRGB(
          VIZ_COLORS.highlight[0] * intensity,
          VIZ_COLORS.highlight[1] * intensity,
          VIZ_COLORS.highlight[2] * intensity
        );
      }
    }
  });

  // Handle selection color mode change (only runs when selectionColorMode changes)
  useEffect(() => {
    if (!selectedMaterialRef.current) return;
    if (selectionColorMode === 'rainbow') {
      selectedMaterialRef.current.vertexColors = false;
      selectedMaterialRef.current.color.copy(rainbowColor(rainbowHueRef.current));
      selectedMaterialRef.current.needsUpdate = true;
    } else if (selectionColorMode === 'blink') {
      selectedMaterialRef.current.vertexColors = false;
      selectedMaterialRef.current.color.setRGB(VIZ_COLORS.highlight[0], VIZ_COLORS.highlight[1], VIZ_COLORS.highlight[2]);
      selectedMaterialRef.current.needsUpdate = true;
    } else {
      // off or static: solid magenta
      selectedMaterialRef.current.vertexColors = false;
      selectedMaterialRef.current.color.setRGB(VIZ_COLORS.highlight[0], VIZ_COLORS.highlight[1], VIZ_COLORS.highlight[2]);
      selectedMaterialRef.current.needsUpdate = true;
    }
  }, [selectionColorMode]);

  const { positions, colors, selectedPositions, selectedColors } = useMemo(() => {
    if (!reconstruction) return { positions: null, colors: null, selectedPositions: null, selectedColors: null };

    // Build set of selected image point IDs
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

    // SINGLE PASS: filter, compute stats, and categorize simultaneously
    let minError = Infinity, maxError = -Infinity;
    let minTrack = Infinity, maxTrack = -Infinity;
    const regularPoints: Point3D[] = [];
    const highlightedPoints: Point3D[] = [];

    for (const point of reconstruction.points3D.values()) {
      // Filter by track length
      if (point.track.length < minTrackLength) continue;
      // Filter by reprojection error
      if (point.error > maxReprojectionError) continue;

      // Update stats
      if (point.error >= 0) {
        minError = Math.min(minError, point.error);
        maxError = Math.max(maxError, point.error);
      }
      minTrack = Math.min(minTrack, point.track.length);
      maxTrack = Math.max(maxTrack, point.track.length);

      // Categorize into regular vs highlighted (only highlight when selectionColorMode is not 'off')
      if (selectionColorMode !== 'off' && selectedImagePointIds.has(point.point3DId)) {
        highlightedPoints.push(point);
      } else {
        regularPoints.push(point);
      }
    }

    if (regularPoints.length === 0 && highlightedPoints.length === 0) {
      return { positions: null, colors: null, selectedPositions: null, selectedColors: null };
    }

    if (minError === maxError) maxError = minError + 1;
    if (minTrack === maxTrack) maxTrack = minTrack + 1;

    const HIGHLIGHT_COLOR = VIZ_COLORS.highlight;

    const computeColor = (point: Point3D, mode: string): [number, number, number] => {
      if (mode === 'error') {
        const errorNorm = point.error >= 0 ? (point.error - minError) / (maxError - minError) : 0;
        return jetColormap(errorNorm);
      } else if (mode === 'trackLength') {
        const { baseR, rangeR, baseG, rangeG, baseB, rangeB } = COLORMAP.trackLength;
        const trackNorm = (point.track.length - minTrack) / (maxTrack - minTrack);
        return [baseR + trackNorm * rangeR, baseG + trackNorm * rangeG, baseB - trackNorm * rangeB];
      }
      // Convert sRGB colors from COLMAP to linear space for proper rendering
      return [
        sRGBToLinear(point.rgb[0] / BRIGHTNESS.max),
        sRGBToLinear(point.rgb[1] / BRIGHTNESS.max),
        sRGBToLinear(point.rgb[2] / BRIGHTNESS.max),
      ];
    };

    // Regular points - use direct indexing instead of .set() for small arrays
    const positions = new Float32Array(regularPoints.length * 3);
    const colors = new Float32Array(regularPoints.length * 3);
    for (let i = 0; i < regularPoints.length; i++) {
      const point = regularPoints[i];
      const i3 = i * 3;
      positions[i3] = point.xyz[0];
      positions[i3 + 1] = point.xyz[1];
      positions[i3 + 2] = point.xyz[2];
      const c = computeColor(point, colorMode);
      colors[i3] = c[0];
      colors[i3 + 1] = c[1];
      colors[i3 + 2] = c[2];
    }

    // Selected/highlighted points
    const selectedPositions = new Float32Array(highlightedPoints.length * 3);
    const selectedColors = new Float32Array(highlightedPoints.length * 3);
    for (let i = 0; i < highlightedPoints.length; i++) {
      const point = highlightedPoints[i];
      const i3 = i * 3;
      selectedPositions[i3] = point.xyz[0];
      selectedPositions[i3 + 1] = point.xyz[1];
      selectedPositions[i3 + 2] = point.xyz[2];
      selectedColors[i3] = HIGHLIGHT_COLOR[0];
      selectedColors[i3 + 1] = HIGHLIGHT_COLOR[1];
      selectedColors[i3 + 2] = HIGHLIGHT_COLOR[2];
    }

    return { positions, colors, selectedPositions, selectedColors };
  }, [reconstruction, colorMode, minTrackLength, maxReprojectionError, selectedImageId, selectionColorMode]);

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

  // Dispose geometries when they change to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      selectedGeometry?.dispose();
    };
  }, [selectedGeometry]);

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
            vertexColors={false}
            color={VIZ_COLORS.frustum.selected}
            sizeAttenuation={false}
          />
        </points>
      )}
    </>
  );
}
