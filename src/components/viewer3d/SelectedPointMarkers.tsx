import { useMemo, useCallback, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import { usePointPickingStore, usePointCloudStore, useUIStore } from '../../store';
import { hoverCardStyles, ICON_SIZES } from '../../theme';
import type { AxesCoordinateSystem } from '../../store/types';

// Get the axis label for the "up" direction based on coordinate system
function getUpAxisLabel(coordinateSystem: AxesCoordinateSystem): string {
  // Z-up systems: Blender, Unreal
  if (coordinateSystem === 'blender' || coordinateSystem === 'unreal') {
    return 'Z';
  }
  // Y-vertical systems (most common)
  return 'Y';
}

// Colors for markers: P1=red, P2=green, P3=blue
const MARKER_COLORS = [0xff4444, 0x44ff44, 0x4444ff];
const MARKER_COLOR_STRINGS = ['#ff4444', '#44ff44', '#4444ff']; // For Text component
const HOVER_COLOR = 0xffff00; // Yellow highlight on hover (matches gizmo)
const HOVER_COLOR_STRING = '#ffff00';
const NORMAL_COLOR = 0x00ff00; // Green for normal arrow
const NORMAL_COLOR_STRING = '#00ff00';
const MARKER_SIZE = 0.012; // Relative to scene (smaller for cleaner look)

/** Single point highlight for hover preview - simple static marker */
function HoverHighlight({ position, baseSize }: { position: THREE.Vector3; baseSize: number }) {
  // Memoize the position array to avoid allocations every render
  const posArray = useMemo(
    () => new Float32Array([position.x, position.y, position.z]),
    [position.x, position.y, position.z]
  );

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[posArray, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffff00"
        size={baseSize + 3}
        sizeAttenuation={false}
        depthTest={false}
        transparent
        opacity={0.8}
      />
    </points>
  );
}

export function SelectedPointMarkers() {
  const selectedPoints = usePointPickingStore((s) => s.selectedPoints);
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const hoveredPoint = usePointPickingStore((s) => s.hoveredPoint);
  const removePointAt = usePointPickingStore((s) => s.removePointAt);
  const normalFlipped = usePointPickingStore((s) => s.normalFlipped);
  const toggleNormalFlipped = usePointPickingStore((s) => s.toggleNormalFlipped);
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  // Get axis label for the "up" direction based on selected coordinate system
  const upAxisLabel = getUpAxisLabel(axesCoordinateSystem);

  // Hover state for tooltips
  const [hoveredMarker, setHoveredMarker] = useState<number | null>(null);
  const [hoveredNormal, setHoveredNormal] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Right-click on a marker to remove that point
  const handleMarkerRightClick = useCallback((index: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    removePointAt(index);
  }, [removePointAt]);

  // Click on normal arrow to flip direction
  const handleNormalClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggleNormalFlipped();
  }, [toggleNormalFlipped]);

  // Marker hover handlers
  const handleMarkerPointerOver = useCallback((index: number) => (e: ThreeEvent<PointerEvent>) => {
    setHoveredMarker(index);
    setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, []);

  const handleMarkerPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (hoveredMarker !== null) {
      setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    }
  }, [hoveredMarker]);

  const handleMarkerPointerOut = useCallback(() => {
    setHoveredMarker(null);
    setMousePos(null);
  }, []);

  // Normal arrow hover handlers
  const handleNormalPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    setHoveredNormal(true);
    setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, []);

  const handleNormalPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (hoveredNormal) {
      setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    }
  }, [hoveredNormal]);

  const handleNormalPointerOut = useCallback(() => {
    setHoveredNormal(false);
    setMousePos(null);
  }, []);

  // Compute marker size based on bounding box of selected points
  const markerSize = useMemo(() => {
    if (selectedPoints.length < 2) {
      // For single point, use a larger visible size so P1 shows immediately
      // Use 0.05 as a reasonable default that's visible in most scenes
      return 0.05;
    }

    // Use distance between first two points to scale markers
    const dist = selectedPoints[0].position.distanceTo(selectedPoints[1].position);
    return Math.max(MARKER_SIZE, dist * 0.02);
  }, [selectedPoints]);

  // Compute triangle normal for 3-point mode visualization
  const normalArrow = useMemo(() => {
    if (pickingMode !== 'normal-3pt' || selectedPoints.length !== 3) return null;

    const p1 = selectedPoints[0].position;
    const p2 = selectedPoints[1].position;
    const p3 = selectedPoints[2].position;

    const v1 = new THREE.Vector3().subVectors(p2, p1);
    const v2 = new THREE.Vector3().subVectors(p3, p1);
    const normal = new THREE.Vector3().crossVectors(v1, v2);

    if (normal.lengthSq() < 1e-10) return null;

    normal.normalize();

    // Flip normal if requested
    if (normalFlipped) {
      normal.negate();
    }

    // Centroid of triangle
    const centroid = new THREE.Vector3()
      .add(p1)
      .add(p2)
      .add(p3)
      .divideScalar(3);

    // Arrow length based on triangle size
    const size = Math.max(v1.length(), v2.length()) * 0.5;
    const arrowEnd = centroid.clone().add(normal.clone().multiplyScalar(size));

    // Compute rotation quaternion to align cone with normal direction
    // Cone tip is at +Y in local space, so align +Y with normal for tip to point outward
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

    // Arrowhead size proportional to arrow length
    const coneHeight = size * 0.2;
    const coneRadius = size * 0.04;

    // Memoize triangle positions for hit area
    const trianglePositions = new Float32Array([
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z,
    ]);

    return { start: centroid, end: arrowEnd, quaternion, coneHeight, coneRadius, normal, trianglePositions };
  }, [selectedPoints, pickingMode, normalFlipped]);

  // Get index of the next point to be selected
  const nextPointIndex = selectedPoints.length;

  // Check if we still need more points
  const requiredPoints = pickingMode === 'origin-1pt' ? 1 : pickingMode === 'distance-2pt' ? 2 : pickingMode === 'normal-3pt' ? 3 : 0;
  const needsMorePoints = nextPointIndex < requiredPoints;

  if (selectedPoints.length === 0 && !hoveredPoint) return null;

  // Build line points for connecting selected points
  const linePoints = selectedPoints.map(p => p.position);

  // For 3-point mode, close the triangle
  const trianglePoints = pickingMode === 'normal-3pt' && selectedPoints.length === 3
    ? [...linePoints, linePoints[0]]
    : linePoints;

  return (
    <group>
      {/* Marker spheres at each selected point */}
      {selectedPoints.map((point, index) => (
        <group key={index} position={point.position}>
          {/* Sphere marker - right-click to remove, hover for tooltip */}
          <mesh
            onContextMenu={handleMarkerRightClick(index)}
            onPointerOver={handleMarkerPointerOver(index)}
            onPointerMove={handleMarkerPointerMove}
            onPointerOut={handleMarkerPointerOut}
          >
            <sphereGeometry args={[markerSize, 8, 8]} />
            <meshBasicMaterial
              color={hoveredMarker === index ? HOVER_COLOR : MARKER_COLORS[index]}
              transparent
              opacity={hoveredMarker === index ? 1 : 0.9}
              depthTest={false}
            />
          </mesh>
          {/* Simple Html label - much lighter than Text/Billboard */}
          <Html
            position={[0, markerSize * 1.5, 0]}
            center
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="text-xs font-bold select-none"
              style={{
                color: hoveredMarker === index ? HOVER_COLOR_STRING : MARKER_COLOR_STRINGS[index],
                textShadow: '0 0 3px black, 0 0 3px black',
              }}
            >
              P{index + 1}
            </div>
          </Html>
        </group>
      ))}

      {/* Line connecting points */}
      {selectedPoints.length >= 2 && (
        <Line
          points={trianglePoints}
          color="#ffff00"
          lineWidth={2}
          transparent
          opacity={0.8}
          depthTest={false}
        />
      )}

      {/* Normal arrow for 3-point mode - click to flip direction */}
      {normalArrow && (
        <>
          {/* Invisible triangle hit area for the plane */}
          <mesh
            onClick={handleNormalClick}
            onPointerOver={handleNormalPointerOver}
            onPointerMove={handleNormalPointerMove}
            onPointerOut={handleNormalPointerOut}
          >
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[normalArrow.trianglePositions, 3]}
              />
            </bufferGeometry>
            <meshBasicMaterial color={hoveredNormal ? HOVER_COLOR : NORMAL_COLOR} transparent opacity={0.2} side={THREE.DoubleSide} depthTest={false} />
          </mesh>
          <Line
            points={[normalArrow.start, normalArrow.end]}
            color={hoveredNormal ? HOVER_COLOR : NORMAL_COLOR}
            lineWidth={hoveredNormal ? 4 : 3}
            depthTest={false}
          />
          {/* Arrowhead cone - visual only, click handled by invisible hit area */}
          <mesh
            position={normalArrow.end}
            quaternion={normalArrow.quaternion}
          >
            <coneGeometry args={[normalArrow.coneRadius, normalArrow.coneHeight, 12]} />
            <meshBasicMaterial
              color={hoveredNormal ? HOVER_COLOR : NORMAL_COLOR}
              depthTest={false}
            />
          </mesh>
          {/* Invisible hit area along the arrow shaft */}
          <mesh
            position={[
              (normalArrow.start.x + normalArrow.end.x) / 2,
              (normalArrow.start.y + normalArrow.end.y) / 2,
              (normalArrow.start.z + normalArrow.end.z) / 2,
            ]}
            quaternion={normalArrow.quaternion}
            onClick={handleNormalClick}
            onPointerOver={handleNormalPointerOver}
            onPointerMove={handleNormalPointerMove}
            onPointerOut={handleNormalPointerOut}
          >
            <cylinderGeometry args={[normalArrow.coneRadius * 3, normalArrow.coneRadius * 3, normalArrow.start.distanceTo(normalArrow.end) * 1.2, 8]} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} />
          </mesh>
          {/* Axis label above arrowhead - simple Html label */}
          <Html
            position={[
              normalArrow.end.x + normalArrow.normal.x * normalArrow.coneHeight * 1.5,
              normalArrow.end.y + normalArrow.normal.y * normalArrow.coneHeight * 1.5,
              normalArrow.end.z + normalArrow.normal.z * normalArrow.coneHeight * 1.5,
            ]}
            center
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="text-sm font-bold select-none"
              style={{
                color: hoveredNormal ? HOVER_COLOR_STRING : NORMAL_COLOR_STRING,
                textShadow: '0 0 3px black, 0 0 3px black',
              }}
            >
              {upAxisLabel}
            </div>
          </Html>
        </>
      )}

      {/* Hover highlight - shows preview of next point to be selected */}
      {hoveredPoint && needsMorePoints && (
        <HoverHighlight
          position={hoveredPoint}
          baseSize={pointSize}
        />
      )}

      {/* Hover tooltip for markers */}
      {hoveredMarker !== null && mousePos && (
        <Html
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            transform: 'none',
          }}
          calculatePosition={() => [0, 0]}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.title}>P{hoveredMarker + 1}</div>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Right: remove
              </div>
            </div>
          </div>
        </Html>
      )}

      {/* Hover tooltip for normal arrow */}
      {hoveredNormal && mousePos && (
        <Html
          style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            pointerEvents: 'none',
            transform: 'none',
          }}
          calculatePosition={() => [0, 0]}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.title}>Normal (Y-axis)</div>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Left: flip direction
              </div>
            </div>
          </div>
        </Html>
      )}

      {/* Confirmation popup is rendered by DistanceInputModal outside the canvas for better performance */}
    </group>
  );
}
