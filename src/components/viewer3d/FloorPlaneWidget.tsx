import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import { useFloorPlaneStore } from '../../store/stores/floorPlaneStore';
import { hoverCardStyles } from '../../theme';
import { flipPlaneNormal } from '../../utils/ransac';

// Axis colors: X=red, Y=green, Z=blue (same as SelectedPointMarkers)
const AXIS_COLORS: Record<string, { hex: number; css: string }> = {
  X: { hex: 0xff4444, css: '#ff4444' },
  Y: { hex: 0x44ff44, css: '#44ff44' },
  Z: { hex: 0x4444ff, css: '#4444ff' },
};

const HOVER_COLOR = 0xffff00; // Yellow highlight on hover

/**
 * 3D widget showing the detected floor plane.
 * - Circle/ring at floor level (positioned at centroid, oriented by normal)
 * - Normal arrow pointing in the "up" direction
 * - Interactions: left-click to flip, right-click to cycle axis
 */
export function FloorPlaneWidget() {
  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);
  const normalFlipped = useFloorPlaneStore((s) => s.normalFlipped);
  const toggleNormalFlipped = useFloorPlaneStore((s) => s.toggleNormalFlipped);
  const targetAxis = useFloorPlaneStore((s) => s.targetAxis);
  const cycleTargetAxis = useFloorPlaneStore((s) => s.cycleTargetAxis);
  const setShowFloorModal = useFloorPlaneStore((s) => s.setShowFloorModal);
  const setModalPosition = useFloorPlaneStore((s) => s.setModalPosition);
  const showFloorModal = useFloorPlaneStore((s) => s.showFloorModal);

  // Hover state for tooltip
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Get axis color
  const axisColor = AXIS_COLORS[targetAxis];

  // Compute plane geometry data
  const planeData = useMemo(() => {
    if (!detectedPlane) return null;

    // Apply normal flip if needed
    const plane = normalFlipped ? flipPlaneNormal(detectedPlane) : detectedPlane;
    const { normal, centroid, radius } = plane;

    // Create position vector
    const position = new THREE.Vector3(centroid[0], centroid[1], centroid[2]);

    // Create normal vector
    const normalVec = new THREE.Vector3(normal[0], normal[1], normal[2]);

    // Compute rotation to align circle with plane (circle lies in XY, normal is Z)
    // We need to rotate from Z-up to our normal direction
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalVec);

    // Arrow end position (arrow points in normal direction from centroid)
    const arrowLength = radius * 0.5;
    const arrowEnd = position.clone().add(normalVec.clone().multiplyScalar(arrowLength));

    // Arrowhead size proportional to arrow length
    const coneHeight = arrowLength * 0.2;
    const coneRadius = arrowLength * 0.06;

    // Rotation for cone (cone tip is at +Y in local space, align +Y with normal)
    const coneQuaternion = new THREE.Quaternion();
    coneQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalVec);

    return {
      position,
      normalVec,
      quaternion,
      radius,
      arrowEnd,
      arrowLength,
      coneHeight,
      coneRadius,
      coneQuaternion,
    };
  }, [detectedPlane, normalFlipped]);

  // Create arrow line geometry
  const arrowLine = useMemo(() => {
    if (!planeData) return null;

    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array([
      planeData.position.x, planeData.position.y, planeData.position.z,
      planeData.arrowEnd.x, planeData.arrowEnd.y, planeData.arrowEnd.z,
    ]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: axisColor.hex, depthTest: false });
    return new THREE.Line(geo, mat);
  }, [planeData, axisColor.hex]);

  if (!detectedPlane || !planeData) return null;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggleNormalFlipped();
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    e.nativeEvent.preventDefault();
    cycleTargetAxis();
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    setHovered(true);
    setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    // Show modal when hovering if not already shown
    if (!showFloorModal) {
      setShowFloorModal(true);
      setModalPosition({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    }
  };

  const handlePointerOut = () => {
    setHovered(false);
    setMousePos(null);
  };

  return (
    <group>
      {/* Circle/ring at floor level */}
      <mesh
        position={planeData.position}
        quaternion={planeData.quaternion}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <ringGeometry args={[planeData.radius * 0.95, planeData.radius, 64]} />
        <meshBasicMaterial
          color={hovered ? HOVER_COLOR : axisColor.hex}
          transparent
          opacity={hovered ? 0.4 : 0.2}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>

      {/* Filled circle center (more visible) */}
      <mesh
        position={planeData.position}
        quaternion={planeData.quaternion}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <circleGeometry args={[planeData.radius * 0.3, 32]} />
        <meshBasicMaterial
          color={hovered ? HOVER_COLOR : axisColor.hex}
          transparent
          opacity={hovered ? 0.5 : 0.3}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>

      {/* Normal arrow line */}
      {arrowLine && <primitive object={arrowLine} />}

      {/* Arrowhead cone */}
      <mesh
        position={planeData.arrowEnd}
        quaternion={planeData.coneQuaternion}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <coneGeometry args={[planeData.coneRadius, planeData.coneHeight, 8]} />
        <meshBasicMaterial color={axisColor.hex} depthTest={false} />
      </mesh>

      {/* Tooltip */}
      {hovered && mousePos && (
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
            <div className={hoverCardStyles.title} style={{ color: axisColor.css }}>
              {targetAxis}-axis
            </div>
            <div className={hoverCardStyles.subtitle}>
              Left: flip · Right: X/Y/Z
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
