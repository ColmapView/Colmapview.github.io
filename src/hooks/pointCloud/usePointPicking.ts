/**
 * Hook for point cloud picking (raycasting and click handling).
 */

import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { PointPickingMode } from '../../store/stores/pointPickingStore';
import type { NearestPointResult, SelectedPointData, ScreenPosition } from './types';

export interface UsePointPickingParams {
  pickingMode: PointPickingMode;
  selectedPointsLength: number;
  pointSize: number;
  indexToPoint3DIdRef: React.RefObject<Map<number, bigint>>;
  addSelectedPoint: (point: SelectedPointData, screenPosition?: ScreenPosition) => void;
  setHoveredPoint: (position: THREE.Vector3 | null) => void;
}

export interface UsePointPickingResult {
  pointsRef: React.RefObject<THREE.Points | null>;
  handlePointClick: (event: ThreeEvent<MouseEvent>) => void;
  needsMorePoints: boolean;
}

/**
 * Hook that handles point cloud picking via raycasting.
 *
 * Features:
 * - Manual raycasting throttled to ~12fps for performance
 * - Click handling with nearest point selection
 * - Hover state management
 *
 * @param params - Configuration parameters
 * @returns Refs and handlers for point picking
 */
export function usePointPicking(params: UsePointPickingParams): UsePointPickingResult {
  const {
    pickingMode,
    selectedPointsLength,
    pointSize,
    indexToPoint3DIdRef,
    addSelectedPoint,
    setHoveredPoint,
  } = params;

  const { camera, gl, raycaster } = useThree();
  const pointsRef = useRef<THREE.Points>(null);

  // Manual raycasting state (avoids Three.js auto-raycasting on every pointer move)
  const mouseRef = useRef(new THREE.Vector2());
  const lastHoverTimeRef = useRef(0);
  const hoverDirtyRef = useRef(false);

  // Reusable ref for result (avoid allocations in hot path)
  const resultWorldPosRef = useRef(new THREE.Vector3());
  const lastHoverPosRef = useRef<THREE.Vector3 | null>(null);

  // Calculate max points based on picking mode
  const maxPoints = getMaxPointsForMode(pickingMode);
  const needsMorePoints = pickingMode !== 'off' && selectedPointsLength < maxPoints;

  // Find nearest point from intersections using pre-computed distanceToRay
  const findNearestPoint = useCallback(
    (intersections: THREE.Intersection[]): NearestPointResult | null => {
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
    },
    []
  );

  // DOM event listener for mouse tracking (no raycasting - just stores position)
  useEffect(() => {
    if (pickingMode === 'off') return;

    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();

    function onMouseMove(e: MouseEvent): void {
      // Convert to NDC and mark dirty
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      hoverDirtyRef.current = true;
    }

    function onMouseLeave(): void {
      hoverDirtyRef.current = false;
      if (lastHoverPosRef.current !== null) {
        lastHoverPosRef.current = null;
        setHoveredPoint(null);
      }
    }

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
  const handlePointClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (pickingMode === 'off') return;
      if (!pointsRef.current) return;

      if (selectedPointsLength >= maxPoints) return;

      event.stopPropagation();

      const result = findNearestPoint(event.intersections);
      if (!result) return;

      const point3DId = indexToPoint3DIdRef.current?.get(result.index);
      if (point3DId === undefined) return;

      const nativeEvent = event.nativeEvent;
      addSelectedPoint(
        {
          position: result.worldPos.clone(),
          point3DId,
        },
        { x: nativeEvent.clientX, y: nativeEvent.clientY }
      );
    },
    [pickingMode, selectedPointsLength, maxPoints, addSelectedPoint, findNearestPoint, indexToPoint3DIdRef]
  );

  // Set raycaster threshold - use tighter threshold for better performance
  useEffect(() => {
    if (pickingMode !== 'off') {
      // Tighter threshold = fewer points to check = faster raycasting
      // eslint-disable-next-line react-hooks/immutability -- raycaster params are mutable by design
      raycaster.params.Points.threshold = pointSize * 0.3;
    }
  }, [pickingMode, pointSize, raycaster]);

  // Clear hovered point when picking mode turns off
  useEffect(() => {
    if (pickingMode === 'off') {
      setHoveredPoint(null);
    }
  }, [pickingMode, setHoveredPoint]);

  return {
    pointsRef,
    handlePointClick,
    needsMorePoints,
  };
}

/**
 * Get the maximum number of points allowed for a picking mode.
 */
function getMaxPointsForMode(mode: PointPickingMode): number {
  switch (mode) {
    case 'origin-1pt':
      return 1;
    case 'distance-2pt':
      return 2;
    case 'normal-3pt':
      return 3;
    default:
      return 0;
  }
}
