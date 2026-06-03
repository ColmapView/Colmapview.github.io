import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { type ThreeEvent } from '@react-three/fiber';
import { INTERACTION_AXIS_COLORS, INTERACTION_HOVER_COLOR, MARKER_COLORS_INT, VIZ_COLORS, OPACITY } from '../../theme';
import { HoverCard3D } from './HoverCard3D';
import {
  getNormalArrowData,
  getScreenPoint,
  getSelectedPointLinePositions,
  getSelectedPointMarkerScale,
  needsMoreSelectedPoints,
  shouldInitializeNormalTargetAxis,
  shouldShowSelectedPointMarkers,
} from './selectedPointMarkersViewModel';
import {
  markSceneContextMenuHandled,
  markSceneContextMenuHandledForSecondaryButton,
} from './sceneContextMenuGuard';
import { markSceneObjectTouchDownForTouchPointer } from './frustumTouchGuards';
import { useSelectedPointMarkersStoreFacade } from './useSelectedPointMarkersStoreFacade';

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
  const {
    data: {
      selectedPoints,
      pickingMode,
      normalFlipped,
      targetAxis,
      hoveredPoint,
      pointSize,
      axesCoordinateSystem,
      defaultTargetAxis,
    },
    actions: {
      removePointAt,
      toggleNormalFlipped,
      cycleTargetAxis,
      setTargetAxis,
    },
  } = useSelectedPointMarkersStoreFacade();

  // Set default target axis when entering 3-point mode (based on coordinate system)
  const prevPickingModeRef = useRef(pickingMode);
  useEffect(() => {
    if (shouldInitializeNormalTargetAxis(prevPickingModeRef.current, pickingMode)) {
      setTargetAxis(defaultTargetAxis);
    }
    prevPickingModeRef.current = pickingMode;
  }, [pickingMode, defaultTargetAxis, setTargetAxis]);

  // Get axis color
  const axisColor = INTERACTION_AXIS_COLORS[targetAxis];

  // Calculate if we need more points before subscribing to hoveredPoint
  const needsMorePoints = needsMoreSelectedPoints(selectedPoints.length, pickingMode);

  // Hover state for tooltips
  const [hoveredMarker, setHoveredMarker] = useState<number | null>(null);
  const [hoveredNormal, setHoveredNormal] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Compute marker size based on distance between points
  const markerSize = useMemo(() => {
    return getSelectedPointMarkerScale(selectedPoints);
  }, [selectedPoints]);

  // Compute triangle normal for 3-point mode visualization
  const normalArrow = useMemo(() => {
    return getNormalArrowData(selectedPoints, pickingMode, normalFlipped);
  }, [selectedPoints, pickingMode, normalFlipped]);

  const connectingLinePositions = useMemo(() => {
    return getSelectedPointLinePositions(selectedPoints, pickingMode);
  }, [selectedPoints, pickingMode]);

  // Memoize line object for connecting points
  const connectingLine = useMemo(() => {
    if (!connectingLinePositions) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(connectingLinePositions, 3));
    const mat = new THREE.LineBasicMaterial({ color: INTERACTION_HOVER_COLOR, transparent: true, opacity: OPACITY.interaction.markerHighlight, depthTest: false });
    return new THREE.Line(geo, mat);
  }, [connectingLinePositions]);

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

  const handleContextPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    markSceneObjectTouchDownForTouchPointer(e.nativeEvent.pointerType);
    markSceneContextMenuHandledForSecondaryButton(e.nativeEvent.button);
  }, []);

  const handleMarkerContextMenu = useCallback((index: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    markSceneContextMenuHandled();
    e.nativeEvent.stopPropagation();
    e.nativeEvent.preventDefault();
    removePointAt(index);
  }, [removePointAt]);

  const handleNormalContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    markSceneContextMenuHandled();
    e.nativeEvent.stopPropagation();
    e.nativeEvent.preventDefault();
    cycleTargetAxis(axesCoordinateSystem);
  }, [axesCoordinateSystem, cycleTargetAxis]);

  if (!shouldShowSelectedPointMarkers(selectedPoints.length, hoveredPoint)) return null;

  return (
    <group>
      {/* Marker spheres - using shared geometry */}
      {selectedPoints.map((point, index) => (
        <mesh
          key={index}
          position={point.position}
          scale={markerSize}
          geometry={sphereGeometry}
          onPointerDown={handleContextPointerDown}
          onContextMenu={handleMarkerContextMenu(index)}
          onPointerOver={(e) => { setHoveredMarker(index); setMousePos(getScreenPoint(e.nativeEvent.clientX, e.nativeEvent.clientY)); }}
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
            onPointerDown={handleContextPointerDown}
            onContextMenu={handleNormalContextMenu}
            onPointerOver={(e) => { setHoveredNormal(true); setMousePos(getScreenPoint(e.nativeEvent.clientX, e.nativeEvent.clientY)); }}
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
            onPointerDown={handleContextPointerDown}
            onContextMenu={handleNormalContextMenu}
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
