import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html, Text, Billboard } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import { useFloorPlaneStore } from '../../store/stores/floorPlaneStore';
import { useUIStore } from '../../store';
import { hoverCardStyles, ICON_SIZES, INTERACTION_AXIS_COLORS, INTERACTION_HOVER_COLOR, OPACITY, MODAL_POSITION } from '../../theme';
import { flipPlaneNormal } from '../../utils/ransac';
import { AXIS_SEMANTIC } from '../../utils/coordinateSystems';

/**
 * 3D widget showing the detected floor plane.
 * - Circle/ring at floor level (positioned at centroid, oriented by normal)
 * - Normal arrow pointing in the "up" direction
 * - Interactions: left-click to flip, right-click to cycle axis
 */
interface FloorPlaneWidgetProps {
  boundsRadius: number;
}

export function FloorPlaneWidget({ boundsRadius }: FloorPlaneWidgetProps) {
  const detectedPlane = useFloorPlaneStore((s) => s.detectedPlane);
  const normalFlipped = useFloorPlaneStore((s) => s.normalFlipped);
  const toggleNormalFlipped = useFloorPlaneStore((s) => s.toggleNormalFlipped);
  const targetAxis = useFloorPlaneStore((s) => s.targetAxis);
  const cycleTargetAxis = useFloorPlaneStore((s) => s.cycleTargetAxis);
  const setShowFloorModal = useFloorPlaneStore((s) => s.setShowFloorModal);
  const setModalPosition = useFloorPlaneStore((s) => s.setModalPosition);
  const showFloorModal = useFloorPlaneStore((s) => s.showFloorModal);

  // Get axes scale and coordinate system to match arrow dimensions and labels with origin axes
  const axesScale = useUIStore((s) => s.axesScale);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  // Hover state for tooltip
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Get axis color
  const axisColor = INTERACTION_AXIS_COLORS[targetAxis];

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

    // Arrow dimensions match origin axes (size = boundsRadius * axesScale)
    // Origin axes use: axisLength = size * 0.5, axisRadius = size * 0.005
    const axisSize = boundsRadius * axesScale;
    const arrowLength = axisSize * 0.5;
    const arrowRadius = axisSize * 0.005;

    // Arrowhead size proportional to axis radius (similar to axes cone tips)
    const coneHeight = arrowRadius * 8;
    const coneRadius = arrowRadius * 3;

    // Arrow shaft length (total arrow minus cone)
    const shaftLength = arrowLength - coneHeight;

    // Shaft center (midpoint of shaft from centroid)
    const shaftCenter = position.clone().add(normalVec.clone().multiplyScalar(shaftLength / 2));

    // Cone position: base connects to shaft end
    // Three.js cone is centered at its geometric middle, so offset by coneHeight/2
    const conePosition = position.clone().add(normalVec.clone().multiplyScalar(shaftLength + coneHeight / 2));

    // Rotation for cone (cone tip is at +Y in local space, align +Y with normal)
    const coneQuaternion = new THREE.Quaternion();
    coneQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalVec);

    // Rotation for shaft cylinder (cylinder is Y-axis aligned, rotate to normal)
    const shaftQuaternion = new THREE.Quaternion();
    shaftQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalVec);

    // Label position: beyond the arrow tip (matching origin axes label offset)
    const labelOffset = arrowLength * 1.15;
    const labelPosition = position.clone().add(normalVec.clone().multiplyScalar(labelOffset));

    // Font size matching origin axes (size * 0.08)
    const fontSize = axisSize * 0.08;

    return {
      position,
      normalVec,
      quaternion,
      radius,
      arrowRadius,
      shaftLength,
      shaftCenter,
      shaftQuaternion,
      conePosition,
      coneHeight,
      coneRadius,
      coneQuaternion,
      labelPosition,
      fontSize,
    };
  }, [detectedPlane, normalFlipped, boundsRadius, axesScale]);

  if (!detectedPlane || !planeData) return null;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggleNormalFlipped();
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Also stop native DOM event to prevent global context menu from opening
    e.nativeEvent.stopPropagation();
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

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
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
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <ringGeometry args={[planeData.radius * 0.95, planeData.radius, 64]} />
        <meshBasicMaterial
          color={hovered ? INTERACTION_HOVER_COLOR : axisColor.hex}
          transparent
          opacity={hovered ? OPACITY.interaction.ringHovered : OPACITY.interaction.ringDefault}
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
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <circleGeometry args={[planeData.radius * 0.3, 32]} />
        <meshBasicMaterial
          color={hovered ? INTERACTION_HOVER_COLOR : axisColor.hex}
          transparent
          opacity={hovered ? OPACITY.interaction.circleHovered : OPACITY.interaction.circleDefault}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>

      {/* Normal arrow shaft (cylinder matching axes style) */}
      <mesh
        position={planeData.shaftCenter}
        quaternion={planeData.shaftQuaternion}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <cylinderGeometry args={[planeData.arrowRadius, planeData.arrowRadius, planeData.shaftLength, 8]} />
        <meshBasicMaterial color={axisColor.hex} depthTest={false} />
      </mesh>

      {/* Arrowhead cone */}
      <mesh
        position={planeData.conePosition}
        quaternion={planeData.coneQuaternion}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <coneGeometry args={[planeData.coneRadius, planeData.coneHeight, 8]} />
        <meshBasicMaterial color={axisColor.hex} depthTest={false} />
      </mesh>

      {/* Axis label (billboard text matching origin axes style) */}
      <Billboard position={planeData.labelPosition} follow={true}>
        <group>
          <Text
            fontSize={planeData.fontSize}
            color={axisColor.hex}
            anchorX="right"
            anchorY="middle"
            outlineWidth={planeData.fontSize * 0.08}
            outlineColor="#000000"
            outlineOpacity={0.5}
          >
            {targetAxis}
          </Text>
          <Text
            fontSize={planeData.fontSize * 0.6}
            color={axisColor.hex}
            anchorX="left"
            anchorY="middle"
            position={[planeData.fontSize * 0.15, 0, 0]}
            outlineWidth={planeData.fontSize * 0.05}
            outlineColor="#000000"
            outlineOpacity={0.5}
          >
            ({AXIS_SEMANTIC[axesCoordinateSystem][targetAxis]})
          </Text>
        </group>
      </Billboard>

      {/* Tooltip */}
      {hovered && mousePos && (
        <Html
          style={{
            position: 'fixed',
            left: mousePos.x + MODAL_POSITION.cursorOffset,
            top: mousePos.y + MODAL_POSITION.cursorOffset,
            pointerEvents: 'none',
            transform: 'none',
          }}
          calculatePosition={() => [0, 0]}
        >
          <div className={hoverCardStyles.container}>
            <div className={hoverCardStyles.title} style={{ color: axisColor.css }}>
              {targetAxis}-axis
            </div>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Flip normal
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Cycle X/Y/Z
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
