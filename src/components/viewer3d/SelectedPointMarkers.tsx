import { useMemo, useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { usePointPickingStore, usePointCloudStore, useUIStore } from '../../store';
import { INTERACTION_AXIS_COLORS, INTERACTION_HOVER_COLOR, MARKER_COLORS_INT, VIZ_COLORS, OPACITY } from '../../theme';
import { HoverCard3D } from './HoverCard3D';
import { getDefaultUpAxis } from '../../store/stores/pointPickingStore';

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
        color={VIZ_COLORS.interaction.hover}
        size={baseSize + 3}
        sizeAttenuation={false}
        depthTest={false}
        transparent
        opacity={OPACITY.interaction.markerHighlight}
      />
    </points>
  );
}

export function SelectedPointMarkers() {
  const selectedPoints = usePointPickingStore((s) => s.selectedPoints);
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const removePointAt = usePointPickingStore((s) => s.removePointAt);
  const normalFlipped = usePointPickingStore((s) => s.normalFlipped);
  const toggleNormalFlipped = usePointPickingStore((s) => s.toggleNormalFlipped);
  const targetAxis = usePointPickingStore((s) => s.targetAxis);
  const cycleTargetAxis = usePointPickingStore((s) => s.cycleTargetAxis);
  const setTargetAxis = usePointPickingStore((s) => s.setTargetAxis);
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  // Set default target axis when entering 3-point mode (based on coordinate system)
  const prevPickingModeRef = useRef(pickingMode);
  useEffect(() => {
    // Only set default when first entering 3-point mode, not on coordinate system changes
    if (pickingMode === 'normal-3pt' && prevPickingModeRef.current !== 'normal-3pt') {
      const defaultAxis = getDefaultUpAxis(axesCoordinateSystem);
      setTargetAxis(defaultAxis);
    }
    prevPickingModeRef.current = pickingMode;
  }, [pickingMode, axesCoordinateSystem, setTargetAxis]);

  // Get axis color
  const axisColor = INTERACTION_AXIS_COLORS[targetAxis];

  // Calculate if we need more points before subscribing to hoveredPoint
  const requiredPoints = pickingMode === 'origin-1pt' ? 1 : pickingMode === 'distance-2pt' ? 2 : pickingMode === 'normal-3pt' ? 3 : 0;
  const needsMorePoints = selectedPoints.length < requiredPoints;

  // Only subscribe to hoveredPoint when we actually need it (reduces re-renders)
  const hoveredPoint = usePointPickingStore((s) => needsMorePoints ? s.hoveredPoint : null);

  // Hover state for tooltips
  const [hoveredMarker, setHoveredMarker] = useState<number | null>(null);
  const [hoveredNormal, setHoveredNormal] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);


  // Compute marker size based on distance between points
  const markerSize = useMemo(() => {
    if (selectedPoints.length < 2) {
      // For single point, use a small consistent size
      return 0.015;
    }

    // Use distance between first two points to scale markers
    const dist = selectedPoints[0].position.distanceTo(selectedPoints[1].position);
    return Math.max(MARKER_SIZE, dist * 0.015);
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

  // Memoize line object for connecting points
  const connectingLine = useMemo(() => {
    if (selectedPoints.length < 2) return null;

    const positions: number[] = [];
    for (const p of selectedPoints) {
      positions.push(p.position.x, p.position.y, p.position.z);
    }
    // Close triangle for 3-point mode
    if (pickingMode === 'normal-3pt' && selectedPoints.length === 3) {
      positions.push(selectedPoints[0].position.x, selectedPoints[0].position.y, selectedPoints[0].position.z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: INTERACTION_HOVER_COLOR, transparent: true, opacity: OPACITY.interaction.markerHighlight, depthTest: false });
    return new THREE.Line(geo, mat);
  }, [selectedPoints, pickingMode]);

  // Memoize normal arrow line object (uses axis color)
  const normalLine = useMemo(() => {
    if (!normalArrow) return null;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array([
      normalArrow.start.x, normalArrow.start.y, normalArrow.start.z,
      normalArrow.end.x, normalArrow.end.y, normalArrow.end.z,
    ]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: axisColor.hex, depthTest: false });
    return new THREE.Line(geo, mat);
  }, [normalArrow, axisColor.hex]);

  // Shared sphere geometry for markers (created once via useMemo to avoid impure render-time initialization)
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
  useEffect(() => () => { sphereGeometry.dispose(); }, [sphereGeometry]);

  if (selectedPoints.length === 0 && !hoveredPoint) return null;

  return (
    <group>
      {/* Marker spheres - using shared geometry */}
      {selectedPoints.map((point, index) => (
        <mesh
          key={index}
          position={point.position}
          scale={markerSize}
          geometry={sphereGeometry}
          onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.stopPropagation(); e.nativeEvent.preventDefault(); removePointAt(index); }}
          onPointerOver={(e) => { setHoveredMarker(index); setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }}
          onPointerOut={() => { setHoveredMarker(null); setMousePos(null); }}
        >
          <meshBasicMaterial
            color={hoveredMarker === index ? INTERACTION_HOVER_COLOR : MARKER_COLORS_INT[index]}
            transparent
            opacity={OPACITY.interaction.marker}
            depthTest={false}
          />
        </mesh>
      ))}

      {/* Line connecting points - native Three.js line */}
      {connectingLine && <primitive object={connectingLine} />}

      {/* Normal arrow for 3-point mode */}
      {normalArrow && normalLine && (
        <>
          {/* Triangle fill */}
          <mesh
            onClick={(e) => { e.stopPropagation(); toggleNormalFlipped(); }}
            onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); cycleTargetAxis(axesCoordinateSystem); }}
            onPointerOver={(e) => { setHoveredNormal(true); setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }); }}
            onPointerOut={() => { setHoveredNormal(false); setMousePos(null); }}
          >
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[normalArrow.trianglePositions, 3]} />
            </bufferGeometry>
            <meshBasicMaterial color={hoveredNormal ? INTERACTION_HOVER_COLOR : axisColor.hex} transparent opacity={hoveredNormal ? OPACITY.interaction.triangleHovered : OPACITY.interaction.triangleDefault} side={THREE.DoubleSide} depthTest={false} />
          </mesh>

          {/* Normal line */}
          <primitive object={normalLine} />

          {/* Arrowhead cone */}
          <mesh
            position={normalArrow.end}
            quaternion={normalArrow.quaternion}
            onClick={(e) => { e.stopPropagation(); toggleNormalFlipped(); }}
            onContextMenu={(e) => { e.stopPropagation(); e.nativeEvent.preventDefault(); cycleTargetAxis(axesCoordinateSystem); }}
          >
            <coneGeometry args={[normalArrow.coneRadius, normalArrow.coneHeight, 8]} />
            <meshBasicMaterial color={axisColor.hex} depthTest={false} />
          </mesh>
        </>
      )}

      {/* Hover highlight */}
      {hoveredPoint && needsMorePoints && (
        <HoverHighlight position={hoveredPoint} baseSize={pointSize} />
      )}

      {/* Tooltip for marker hover */}
      {hoveredMarker !== null && mousePos && (
        <HoverCard3D mousePos={mousePos} title={`P${hoveredMarker + 1}`} subtitle="Right-click to remove" />
      )}

      {/* Tooltip for triangle hover */}
      {hoveredNormal && mousePos && (
        <HoverCard3D mousePos={mousePos} title={`${targetAxis}-axis`} titleStyle={{ color: axisColor.css }} subtitle="Left: flip · Right: X/Y/Z" />
      )}

    </group>
  );
}
