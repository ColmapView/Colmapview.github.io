import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { hoverCardStyles, ICON_SIZES, INTERACTION_AXIS_COLORS, INTERACTION_HOVER_COLOR, OPACITY } from '../../theme';
import { AXIS_SEMANTIC } from '../../utils/coordinateSystems';
import { HoverCard3D } from './HoverCard3D';
import { BillboardLabel } from './BillboardLabel';
import { markSceneContextMenuHandled } from './sceneContextMenuGuard';
import { markSceneObjectTouchDownForTouchPointer } from './frustumTouchGuards';
import {
  FLOOR_PLANE_ARROW_RENDER_ORDER,
  FLOOR_PLANE_DISK_RENDER_ORDER,
  FLOOR_PLANE_RENDER_ORDER,
  getFloorPlaneBlinkOpacity,
  getFloorPlaneDiskOpacity,
  getFloorPlaneWidgetData,
  getScreenPoint,
  shouldClaimFloorPlaneContextPointer,
  shouldOpenFloorModalOnHover,
} from './floorPlaneWidgetViewModel';
import { syncMaterialOpacity } from './threeMaterialMutations';
import { useFloorPlaneWidgetStoreFacade } from './useFloorPlaneWidgetStoreFacade';

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
  const {
    floor: {
      detectedPlane,
      normalFlipped,
      toggleNormalFlipped,
      targetAxis,
      cycleTargetAxis,
      setShowFloorModal,
      setModalPosition,
      showFloorModal,
    },
    ui: {
      axesScale,
      axesCoordinateSystem,
    },
  } = useFloorPlaneWidgetStoreFacade();

  // Hover state for tooltip
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const diskMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Get axis color
  const axisColor = INTERACTION_AXIS_COLORS[targetAxis];
  const ringOpacity = hovered ? OPACITY.interaction.ringHovered : OPACITY.interaction.ringDefault;
  const diskOpacity = getFloorPlaneDiskOpacity(
    hovered ? OPACITY.interaction.circleHovered : OPACITY.interaction.circleDefault
  );

  // Compute plane geometry data
  const planeData = useMemo(() => {
    return getFloorPlaneWidgetData({
      boundsRadius,
      detectedPlane,
      normalFlipped,
      axesScale,
    });
  }, [detectedPlane, normalFlipped, boundsRadius, axesScale]);

  useFrame((state) => {
    if (ringMaterialRef.current) {
      syncMaterialOpacity(ringMaterialRef.current, getFloorPlaneBlinkOpacity({
        baseOpacity: ringOpacity,
        elapsedTime: state.clock.elapsedTime,
      }));
    }
    if (diskMaterialRef.current) {
      syncMaterialOpacity(diskMaterialRef.current, getFloorPlaneBlinkOpacity({
        baseOpacity: diskOpacity,
        elapsedTime: state.clock.elapsedTime,
      }));
    }
  });

  if (!detectedPlane || !planeData) return null;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    toggleNormalFlipped();
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    markSceneContextMenuHandled();
    // Also stop native DOM event to prevent global context menu from opening
    e.nativeEvent.stopPropagation();
    e.nativeEvent.preventDefault();
    cycleTargetAxis();
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    markSceneObjectTouchDownForTouchPointer(e.nativeEvent.pointerType);

    if (shouldClaimFloorPlaneContextPointer(e.nativeEvent.button)) {
      markSceneContextMenuHandled();
    }
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    const point = getScreenPoint(e.nativeEvent.clientX, e.nativeEvent.clientY);
    setHovered(true);
    setMousePos(point);
    if (shouldOpenFloorModalOnHover(showFloorModal)) {
      setShowFloorModal(true);
      setModalPosition(point);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    setMousePos(getScreenPoint(e.nativeEvent.clientX, e.nativeEvent.clientY));
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
        renderOrder={FLOOR_PLANE_RENDER_ORDER}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerOver={handlePointerOver}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <ringGeometry args={[planeData.radius * 0.95, planeData.radius, 64]} />
        <meshBasicMaterial
          ref={ringMaterialRef}
          color={hovered ? INTERACTION_HOVER_COLOR : axisColor.hex}
          transparent
          opacity={ringOpacity}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Filled circle center */}
      <mesh
        position={planeData.position}
        quaternion={planeData.quaternion}
        renderOrder={FLOOR_PLANE_DISK_RENDER_ORDER}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerOver={handlePointerOver}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <circleGeometry args={[planeData.radius * 0.3, 32]} />
        <meshBasicMaterial
          ref={diskMaterialRef}
          color={hovered ? INTERACTION_HOVER_COLOR : axisColor.hex}
          transparent
          opacity={diskOpacity}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Normal arrow shaft (cylinder matching axes style) */}
      <mesh
        position={planeData.shaftCenter}
        quaternion={planeData.shaftQuaternion}
        renderOrder={FLOOR_PLANE_ARROW_RENDER_ORDER}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
      >
        <cylinderGeometry args={[planeData.arrowRadius, planeData.arrowRadius, planeData.shaftLength, 8]} />
        <meshBasicMaterial color={axisColor.hex} depthTest={false} depthWrite={false} />
      </mesh>

      {/* Arrowhead cone */}
      <mesh
        position={planeData.conePosition}
        quaternion={planeData.coneQuaternion}
        renderOrder={FLOOR_PLANE_ARROW_RENDER_ORDER}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
      >
        <coneGeometry args={[planeData.coneRadius, planeData.coneHeight, 8]} />
        <meshBasicMaterial color={axisColor.hex} depthTest={false} depthWrite={false} />
      </mesh>

      {/* Axis label (billboard text matching origin axes style) */}
      <BillboardLabel
        label={targetAxis}
        suffix={AXIS_SEMANTIC[axesCoordinateSystem][targetAxis]}
        fontSize={planeData.fontSize}
        color={axisColor.hex}
        position={planeData.labelPosition.toArray() as [number, number, number]}
      />

      {/* Tooltip */}
      {hovered && mousePos && (
        <HoverCard3D mousePos={mousePos} title={`${targetAxis}-axis`} titleStyle={{ color: axisColor.css }}>
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
        </HoverCard3D>
      )}
    </group>
  );
}
