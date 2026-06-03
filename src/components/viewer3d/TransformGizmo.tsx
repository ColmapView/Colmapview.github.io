import { useRef, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { VIZ_COLORS } from '../../theme';
import {
  RotationArc,
  TranslationArrow,
  type GizmoAxis,
  type GizmoMode,
} from './TransformGizmoHandles';
import { GizmoContextMenu, TransformGizmoHoverHint } from './TransformGizmoOverlays';
import { GIZMO_COLORS } from './transformGizmoConstants';
import {
  markSceneContextMenuHandled,
  markSceneContextMenuHandledForSecondaryButton,
} from './sceneContextMenuGuard';
import { markSceneObjectTouchDownForTouchPointer } from './frustumTouchGuards';
import {
  createTransformDragState,
  getGizmoDragPlane,
  getGizmoDragTransform,
  getPointerWorldPosition,
  isTransformGizmoHandleHighlighted,
  type ActiveGizmoAxis,
  type ActiveGizmoMode,
  type ActiveTransformGizmoHandle,
  type TransformDragState,
} from './transformGizmoDragPolicy';
import {
  executeTransformGizmoContextMenuAction,
  type TransformGizmoContextMenuAction,
} from './transformGizmoContextMenuExecutor';
import { setTrackballControlsEnabled, useTrackballControlsApi } from './trackballControlsApi';
import { useTransformGizmoStoreFacade } from './useTransformGizmoStoreFacade';

interface TransformGizmoProps {
  center: [number, number, number];
  size: number;
}

export function TransformGizmo({ center, size }: TransformGizmoProps) {
  const { camera, gl } = useThree();
  const controls = useTrackballControlsApi();
  const {
    data: {
      transform,
      droppedFiles,
    },
    actions: {
      setTransform,
      resetTransform,
      setShowGizmo,
      applyTransformToData,
      confirmReload,
      processFiles,
    },
  } = useTransformGizmoStoreFacade();

  // Drag state
  const [hoveredAxis, setHoveredAxis] = useState<GizmoAxis>(null);
  const [hoveredMode, setHoveredMode] = useState<GizmoMode>(null);
  const [dragging, setDragging] = useState(false);
  const [activeDragHandle, setActiveDragHandle] = useState<ActiveTransformGizmoHandle | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<TransformDragState | null>(null);

  const groupRef = useRef<THREE.Group>(null);

  // Get drag plane for the axis (always uses global/world coordinates)
  const getDragPlane = useCallback(
    (axis: ActiveGizmoAxis, mode: ActiveGizmoMode): THREE.Plane => {
      return getGizmoDragPlane(axis, mode, center, camera);
    },
    [camera, center]
  );

  // Get world position from pointer (accepts clientX/clientY directly)
  const getWorldPosition = useCallback(
    (clientX: number, clientY: number, plane: THREE.Plane): THREE.Vector3 | null => {
      return getPointerWorldPosition({
        clientX,
        clientY,
        rect: gl.domElement.getBoundingClientRect(),
        camera,
        plane,
      });
    },
    [camera, gl]
  );

  // Handle drag start
  const handlePointerDown = useCallback(
    (axis: ActiveGizmoAxis, mode: ActiveGizmoMode) => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      markSceneObjectTouchDownForTouchPointer(e.nativeEvent.pointerType);

      if (e.nativeEvent.button === 2) {
        markSceneContextMenuHandled();
        e.nativeEvent.preventDefault();
        return;
      }

      // Disable camera controls immediately to block orbit
      setTrackballControlsEnabled(controls, false);

      const plane = getDragPlane(axis, mode);
      const startPoint = getWorldPosition(e.nativeEvent.clientX, e.nativeEvent.clientY, plane);

      if (!startPoint) {
        // Re-enable if we can't start drag
        setTrackballControlsEnabled(controls, true);
        return;
      }

      dragRef.current = createTransformDragState({
        axis,
        mode,
        startPoint,
        center,
        transform,
        plane,
      });

      setDragging(true);
      setActiveDragHandle({ axis, mode });
      gl.domElement.setPointerCapture(e.pointerId);
    },
    [getDragPlane, getWorldPosition, center, transform, gl, controls]
  );

  // Add global pointer event listeners for dragging
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || !dragRef.current) return;

      const { plane } = dragRef.current;
      const currentPoint = getWorldPosition(e.clientX, e.clientY, plane);

      if (!currentPoint) return;

      setTransform(getGizmoDragTransform(dragRef.current, currentPoint));
    },
    [dragging, getWorldPosition, setTransform]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (dragging) {
        setDragging(false);
        // Clear hover state since onPointerOut may not fire if pointer is still over the element
        setHoveredAxis(null);
        setHoveredMode(null);
        // Re-enable camera controls
        setTrackballControlsEnabled(controls, true);
        dragRef.current = null;
        setActiveDragHandle(null);
        gl.domElement.releasePointerCapture(e.pointerId);
      }
    },
    [dragging, gl, controls]
  );

  // Proper event listener management with useEffect
  useEffect(() => {
    if (!dragging) return;

    const canvas = gl.domElement;
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragging, gl, handlePointerMove, handlePointerUp]);


  const arcRadius = size * 0.35;
  const arrowLength = arcRadius;  // Arrow tip touches the ring
  const isHandleHighlighted = (axis: ActiveGizmoAxis, mode: ActiveGizmoMode) => isTransformGizmoHandleHighlighted({
    axis,
    mode,
    hoveredAxis,
    hoveredMode,
    activeDragHandle,
  });

  // Common context menu handler for all gizmo elements
  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    markSceneContextMenuHandled();
    // Also stop native DOM event to prevent global context menu from opening
    e.nativeEvent.stopPropagation();
    e.nativeEvent.preventDefault();
    setContextMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, []);

  const handleContextPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    markSceneObjectTouchDownForTouchPointer(e.nativeEvent.pointerType);
    markSceneContextMenuHandledForSecondaryButton(e.nativeEvent.button);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const executeContextMenuAction = useCallback((action: TransformGizmoContextMenuAction) => {
    return executeTransformGizmoContextMenuAction(action, {
      resetTransform,
      applyTransformToData,
      setShowGizmo,
      droppedFiles,
      confirmReload,
      processFiles,
      closeContextMenu,
    });
  }, [
    applyTransformToData,
    closeContextMenu,
    confirmReload,
    droppedFiles,
    processFiles,
    resetTransform,
    setShowGizmo,
  ]);

  // Hover handlers for gizmo elements (like OriginVisualization)
  const handleGizmoPointerOver = useCallback((axis: GizmoAxis, mode: GizmoMode) => (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) {
      // Always update hover state - don't block when moving between elements
      setHoveredAxis(axis);
      setHoveredMode(mode);
      setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    }
  }, [dragging]);

  const handleGizmoPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    setHoveredAxis((current) => {
      if (current) {
        setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      }
      return current;
    });
  }, []);

  // Unconditionally clear hover state on pointer out
  const handleGizmoPointerOut = useCallback(() => {
    if (!dragging) {
      setHoveredAxis(null);
      setHoveredMode(null);
      setMousePos(null);
    }
  }, [dragging]);

  return (
    <group ref={groupRef} position={center}>
      {/* Translation arrows */}
      <TranslationArrow
        axis="x"
        color={GIZMO_COLORS.x}
        length={arrowLength}
        isHovered={isHandleHighlighted('x', 'translate')}
        onPointerDown={handlePointerDown('x', 'translate')}
        onPointerOver={handleGizmoPointerOver('x', 'translate')}
        onPointerMove={handleGizmoPointerMove}
        onPointerOut={handleGizmoPointerOut}
        onContextMenu={handleContextMenu}
      />
      <TranslationArrow
        axis="y"
        color={GIZMO_COLORS.y}
        length={arrowLength}
        isHovered={isHandleHighlighted('y', 'translate')}
        onPointerDown={handlePointerDown('y', 'translate')}
        onPointerOver={handleGizmoPointerOver('y', 'translate')}
        onPointerMove={handleGizmoPointerMove}
        onPointerOut={handleGizmoPointerOut}
        onContextMenu={handleContextMenu}
      />
      <TranslationArrow
        axis="z"
        color={GIZMO_COLORS.z}
        length={arrowLength}
        isHovered={isHandleHighlighted('z', 'translate')}
        onPointerDown={handlePointerDown('z', 'translate')}
        onPointerOver={handleGizmoPointerOver('z', 'translate')}
        onPointerMove={handleGizmoPointerMove}
        onPointerOut={handleGizmoPointerOut}
        onContextMenu={handleContextMenu}
      />

      {/* Rotation arcs */}
      <RotationArc
        axis="x"
        color={GIZMO_COLORS.x}
        radius={arcRadius}
        isHovered={isHandleHighlighted('x', 'rotate')}
        onPointerDown={handlePointerDown('x', 'rotate')}
        onPointerOver={handleGizmoPointerOver('x', 'rotate')}
        onPointerMove={handleGizmoPointerMove}
        onPointerOut={handleGizmoPointerOut}
        onContextMenu={handleContextMenu}
      />
      <RotationArc
        axis="y"
        color={GIZMO_COLORS.y}
        radius={arcRadius}
        isHovered={isHandleHighlighted('y', 'rotate')}
        onPointerDown={handlePointerDown('y', 'rotate')}
        onPointerOver={handleGizmoPointerOver('y', 'rotate')}
        onPointerMove={handleGizmoPointerMove}
        onPointerOut={handleGizmoPointerOut}
        onContextMenu={handleContextMenu}
      />
      <RotationArc
        axis="z"
        color={GIZMO_COLORS.z}
        radius={arcRadius}
        isHovered={isHandleHighlighted('z', 'rotate')}
        onPointerDown={handlePointerDown('z', 'rotate')}
        onPointerOver={handleGizmoPointerOver('z', 'rotate')}
        onPointerMove={handleGizmoPointerMove}
        onPointerOut={handleGizmoPointerOut}
        onContextMenu={handleContextMenu}
      />

      {/* Center sphere - right-click for context menu */}
      <mesh
        onPointerDown={handleContextPointerDown}
        onContextMenu={handleContextMenu}
        renderOrder={999}
      >
        <sphereGeometry args={[size * 0.02, 16, 16]} />
        <meshBasicMaterial color={VIZ_COLORS.material.white} depthTest={false} transparent opacity={1} />
      </mesh>

      {hoveredAxis && hoveredMode && mousePos && !contextMenu && (
        <TransformGizmoHoverHint axis={hoveredAxis} mode={hoveredMode} mousePos={mousePos} />
      )}

      {/* Context menu - rendered at cursor position */}
      {contextMenu && (
        <GizmoContextMenu
          position={contextMenu}
          onClose={closeContextMenu}
          onReset={() => executeContextMenuAction('reset')}
          onReload={() => executeContextMenuAction('reload')}
          onApply={() => executeContextMenuAction('apply')}
          onOff={() => executeContextMenuAction('off')}
        />
      )}
    </group>
  );
}
