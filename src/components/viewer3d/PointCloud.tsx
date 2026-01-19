import { useMemo, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useReconstructionStore, usePointCloudStore, useCameraStore, usePointPickingStore } from '../../store';
import type { Point3D } from '../../types/colmap';
import { BRIGHTNESS, RAINBOW, COLORMAP } from '../../theme';
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
  const selectionColor = useCameraStore((s) => s.selectionColor);
  const selectedMaterialRef = useRef<THREE.PointsMaterial>(null);
  // Use ref instead of state to avoid re-renders on every frame
  const rainbowHueRef = useRef(0);
  const tempColorRef = useRef(new THREE.Color());

  // Point picking state - only subscribe to length to avoid re-renders when points change
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const selectedPointsLength = usePointPickingStore((s) => s.selectedPoints.length);
  const addSelectedPoint = usePointPickingStore((s) => s.addSelectedPoint);
  const setHoveredPoint = usePointPickingStore((s) => s.setHoveredPoint);
  const { camera, gl, raycaster } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  const indexToPoint3DIdRef = useRef<Map<number, bigint>>(new Map());

  // Manual raycasting state (avoids Three.js auto-raycasting on every pointer move)
  const mouseRef = useRef(new THREE.Vector2());
  const lastHoverTimeRef = useRef(0);
  const hoverDirtyRef = useRef(false);

  // Update selection color directly in useFrame without triggering re-renders
  useFrame((state, delta) => {
    if (selectedImageId !== null && selectedMaterialRef.current) {
      if (selectionColorMode === 'rainbow') {
        rainbowHueRef.current = (rainbowHueRef.current + delta * selectionAnimationSpeed * RAINBOW.speedMultiplier) % 1;
        selectedMaterialRef.current.color.copy(rainbowColor(rainbowHueRef.current));
        selectedMaterialRef.current.opacity = 1;
      } else if (selectionColorMode === 'blink') {
        // Blink: smooth sine wave pulse using intensity (0.2 to 1.0) for strong effect
        // Use clock.elapsedTime to stay in sync with frustum blink animation
        const blinkFactor = (Math.sin(state.clock.elapsedTime * selectionAnimationSpeed * 2) + 1) / 2; // 0 to 1
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

  const { positions, colors, selectedPositions, selectedColors } = useMemo(() => {
    if (!reconstruction) {
      indexToPoint3DIdRef.current = new Map();
      return { positions: null, colors: null, selectedPositions: null, selectedColors: null };
    }

    // Build set of selected image point IDs (use pre-computed mapping for memory efficiency)
    let selectedImagePointIds: Set<bigint>;
    if (selectedImageId !== null) {
      // Use pre-computed imageToPoint3DIds mapping (works with lite parser too)
      selectedImagePointIds = reconstruction.imageToPoint3DIds.get(selectedImageId) ?? new Set();
    } else {
      selectedImagePointIds = new Set();
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
      indexToPoint3DIdRef.current = new Map();
      return { positions: null, colors: null, selectedPositions: null, selectedColors: null };
    }

    if (minError === maxError) maxError = minError + 1;
    if (minTrack === maxTrack) maxTrack = minTrack + 1;

    // Convert hex selection color to RGB values
    const tempColor = new THREE.Color(selectionColor);
    const HIGHLIGHT_COLOR: [number, number, number] = [tempColor.r, tempColor.g, tempColor.b];

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

    // Build index-to-point3DId mapping for point picking
    const indexToPoint3DId = new Map<number, bigint>();

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
      // Store mapping for point picking
      indexToPoint3DId.set(i, point.point3DId);
    }

    // Update ref with new mapping
    indexToPoint3DIdRef.current = indexToPoint3DId;

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
  }, [reconstruction, colorMode, minTrackLength, maxReprojectionError, selectedImageId, selectionColorMode, selectionColor]);

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

  // Reusable ref for result (avoid allocations in hot path)
  const resultWorldPosRef = useRef(new THREE.Vector3());
  const lastHoverPosRef = useRef<THREE.Vector3 | null>(null);

  // Find nearest point from intersections using pre-computed distanceToRay
  const findNearestPoint = useCallback((
    intersections: THREE.Intersection[]
  ): { index: number; worldPos: THREE.Vector3 } | null => {
    const points = pointsRef.current;
    if (!points || intersections.length === 0) return null;

    let closestIdx = -1;
    let closestDist = Infinity;
    let closestWorldPos: THREE.Vector3 | null = null;

    // Must check all intersections - they're sorted by camera distance, not by distanceToRay
    for (let i = 0; i < intersections.length; i++) {
      const hit = intersections[i];
      if (hit.object !== points || hit.index === undefined) continue;

      const dist = hit.distanceToRay ?? Infinity;
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = hit.index;
        closestWorldPos = hit.point;
      }
    }

    if (closestIdx === -1 || !closestWorldPos) return null;
    resultWorldPosRef.current.copy(closestWorldPos);
    return { index: closestIdx, worldPos: resultWorldPosRef.current };
  }, []);

  // DOM event listener for mouse tracking (no raycasting - just stores position)
  useEffect(() => {
    if (pickingMode === 'off') return;

    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();

    const onMouseMove = (e: MouseEvent) => {
      // Convert to NDC and mark dirty
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      hoverDirtyRef.current = true;
    };

    const onMouseLeave = () => {
      hoverDirtyRef.current = false;
      if (lastHoverPosRef.current !== null) {
        lastHoverPosRef.current = null;
        setHoveredPoint(null);
      }
    };

    canvas.addEventListener('mousemove', onMouseMove, { passive: true });
    canvas.addEventListener('mouseleave', onMouseLeave);

    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [pickingMode, gl, setHoveredPoint]);

  // Manual raycasting in useFrame - only when dirty and throttled
  useFrame(() => {
    if (pickingMode === 'off' || !hoverDirtyRef.current || !pointsRef.current) return;

    // Check if we need more points
    const maxPoints = pickingMode === 'origin-1pt' ? 1 : pickingMode === 'distance-2pt' ? 2 : 3;
    if (selectedPointsLength >= maxPoints) return;

    // Throttle to ~12fps (80ms) - manual raycasting is expensive
    const now = performance.now();
    if (now - lastHoverTimeRef.current < 80) return;
    lastHoverTimeRef.current = now;
    hoverDirtyRef.current = false;

    // Manual raycast - only happens when throttle allows
    raycaster.setFromCamera(mouseRef.current, camera);
    const intersections = raycaster.intersectObject(pointsRef.current);

    const result = findNearestPoint(intersections);

    if (result) {
      const lastPos = lastHoverPosRef.current;
      if (lastPos && lastPos.distanceToSquared(result.worldPos) < 0.00000001) return;
      lastHoverPosRef.current = result.worldPos.clone();
      setHoveredPoint(lastHoverPosRef.current);
    } else if (lastHoverPosRef.current !== null) {
      lastHoverPosRef.current = null;
      setHoveredPoint(null);
    }
  });

  // Handle point picking click
  const handlePointClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    if (pickingMode === 'off') return;
    if (!pointsRef.current) return;

    const maxPoints = pickingMode === 'origin-1pt' ? 1 : pickingMode === 'distance-2pt' ? 2 : 3;
    if (selectedPointsLength >= maxPoints) return;

    event.stopPropagation();

    const result = findNearestPoint(event.intersections);
    if (!result) return;

    const point3DId = indexToPoint3DIdRef.current.get(result.index);
    if (point3DId === undefined) return;

    const nativeEvent = event.nativeEvent;
    addSelectedPoint({
      position: result.worldPos.clone(),
      point3DId,
    }, { x: nativeEvent.clientX, y: nativeEvent.clientY });
  }, [pickingMode, selectedPointsLength, addSelectedPoint, findNearestPoint]);

  // Set raycaster threshold - use tighter threshold for better performance
  useEffect(() => {
    if (pickingMode !== 'off') {
      // Tighter threshold = fewer points to check = faster raycasting
      raycaster.params.Points.threshold = pointSize * 0.3;
    }
  }, [pickingMode, pointSize, raycaster]);

  // Clear hovered point when picking mode turns off
  useEffect(() => {
    if (pickingMode === 'off') {
      setHoveredPoint(null);
    }
  }, [pickingMode, setHoveredPoint]);

  if (!geometry) return null;

  // Only enable point picking when we need more points
  const maxPoints = pickingMode === 'origin-1pt' ? 1 : pickingMode === 'distance-2pt' ? 2 : pickingMode === 'normal-3pt' ? 3 : 0;
  const needsMorePoints = pickingMode !== 'off' && selectedPointsLength < maxPoints;

  return (
    <>
      <points
        ref={pointsRef}
        matrixAutoUpdate={false}
        geometry={geometry}
        onClick={needsMorePoints ? handlePointClick : undefined}
      >
        <pointsMaterial size={pointSize} vertexColors sizeAttenuation={false} />
      </points>
      {selectedGeometry && (
        <points matrixAutoUpdate={false} geometry={selectedGeometry} raycast={() => {}}>
          <pointsMaterial
            ref={selectedMaterialRef}
            size={pointSize + 1}
            vertexColors={false}
            color={selectionColor}
            transparent
            sizeAttenuation={false}
          />
        </points>
      )}
    </>
  );
}
