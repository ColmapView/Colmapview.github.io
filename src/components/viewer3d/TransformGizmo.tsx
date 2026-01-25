import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useTransformStore, useReconstructionStore, useUIStore, applyTransformToData } from '../../store';
import { useFileDropzone } from '../../hooks/useFileDropzone';
import { VIZ_COLORS, contextMenuStyles, hoverCardStyles, ICON_SIZES } from '../../theme';
import { ResetIcon, ReloadIcon, CheckIcon, OffIcon } from '../../icons';

// Type for controls registered by TrackballControls
interface ControlsWithEnabled {
  enabled: React.MutableRefObject<boolean>;
}

// Gizmo colors matching axis colors
const GIZMO_COLORS = {
  x: VIZ_COLORS.axis.x,
  y: VIZ_COLORS.axis.y,
  z: VIZ_COLORS.axis.z,
  hover: 0xffff00,
};

// Opacity values
const OPACITY = {
  arc: 0.6,
  arcHover: 0.9,
  axis: 0.8,
  axisHover: 1.0,
};

interface TransformGizmoProps {
  center: [number, number, number];
  size: number;
}

type GizmoAxis = 'x' | 'y' | 'z' | null;
type GizmoMode = 'translate' | 'rotate' | null;

// Arc geometry for rotation handles
function RotationArc({
  axis,
  color,
  radius,
  isHovered,
  onPointerDown,
  onPointerOver,
  onPointerMove,
  onPointerOut,
  onContextMenu,
}: {
  axis: 'x' | 'y' | 'z';
  color: number;
  radius: number;
  isHovered: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const rotation = useMemo(() => {
    switch (axis) {
      case 'x':
        return new THREE.Euler(0, Math.PI / 2, 0);
      case 'y':
        return new THREE.Euler(Math.PI / 2, 0, 0);
      case 'z':
        return new THREE.Euler(0, 0, 0);
    }
  }, [axis]);

  const tubeRadius = radius * 0.02;
  const displayColor = isHovered ? GIZMO_COLORS.hover : color;
  const opacity = isHovered ? OPACITY.arcHover : OPACITY.arc;

  return (
    <mesh
      rotation={rotation}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      onContextMenu={onContextMenu}
    >
      <torusGeometry args={[radius, tubeRadius, 8, 64]} />
      <meshBasicMaterial
        color={displayColor}
        transparent
        opacity={opacity}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// Arrow for translation handles
function TranslationArrow({
  axis,
  color,
  length,
  isHovered,
  onPointerDown,
  onPointerOver,
  onPointerMove,
  onPointerOut,
  onContextMenu,
}: {
  axis: 'x' | 'y' | 'z';
  color: number;
  length: number;
  isHovered: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const direction = useMemo(() => {
    switch (axis) {
      case 'x':
        return new THREE.Vector3(1, 0, 0);
      case 'y':
        return new THREE.Vector3(0, 1, 0);
      case 'z':
        return new THREE.Vector3(0, 0, 1);
    }
  }, [axis]);

  const rotation = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(direction.dot(up)) > 0.999) {
      return new THREE.Euler(direction.y > 0 ? 0 : Math.PI, 0, 0);
    }
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, direction);
    return new THREE.Euler().setFromQuaternion(quaternion);
  }, [direction]);

  const shaftLength = length * 0.8;
  const shaftRadius = length * 0.015;
  const coneLength = length * 0.2;
  const coneRadius = length * 0.035;

  const shaftPosition: [number, number, number] = [
    direction.x * shaftLength / 2,
    direction.y * shaftLength / 2,
    direction.z * shaftLength / 2,
  ];

  const conePosition: [number, number, number] = [
    direction.x * (shaftLength + coneLength / 2),
    direction.y * (shaftLength + coneLength / 2),
    direction.z * (shaftLength + coneLength / 2),
  ];

  const displayColor = isHovered ? GIZMO_COLORS.hover : color;
  const opacity = isHovered ? OPACITY.axisHover : OPACITY.axis;

  return (
    <group>
      {/* Shaft */}
      <mesh
        position={shaftPosition}
        rotation={rotation}
        onPointerDown={onPointerDown}
        onPointerOver={onPointerOver}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onContextMenu={onContextMenu}
      >
        <cylinderGeometry args={[shaftRadius, shaftRadius, shaftLength, 8]} />
        <meshBasicMaterial color={displayColor} transparent opacity={opacity} depthTest={false} />
      </mesh>
      {/* Cone (arrow head) */}
      <mesh
        position={conePosition}
        rotation={rotation}
        onPointerDown={onPointerDown}
        onPointerOver={onPointerOver}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onContextMenu={onContextMenu}
      >
        <coneGeometry args={[coneRadius, coneLength, 12]} />
        <meshBasicMaterial color={displayColor} transparent opacity={opacity} depthTest={false} />
      </mesh>
    </group>
  );
}

export function TransformGizmo({ center, size }: TransformGizmoProps) {
  const { camera, gl } = useThree();
  const controls = useThree((state) => state.controls) as unknown as ControlsWithEnabled | undefined;
  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);
  const resetTransform = useTransformStore((s) => s.resetTransform);
  const droppedFiles = useReconstructionStore((s) => s.droppedFiles);
  const setShowGizmo = useUIStore((s) => s.setShowGizmo);
  const { processFiles } = useFileDropzone();

  // Drag state
  const [hoveredAxis, setHoveredAxis] = useState<GizmoAxis>(null);
  const [hoveredMode, setHoveredMode] = useState<GizmoMode>(null);
  const [dragging, setDragging] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    axis: GizmoAxis;
    mode: GizmoMode;
    startPoint: THREE.Vector3;
    startCenter: THREE.Vector3;  // Gizmo position at drag start (pivot point for rotation)
    startTransform: {
      translationX: number;
      translationY: number;
      translationZ: number;
      rotationX: number;
      rotationY: number;
      rotationZ: number;
    };
    startRotation: THREE.Quaternion;  // Rotation at drag start for axis alignment
    plane: THREE.Plane;
  } | null>(null);

  const groupRef = useRef<THREE.Group>(null);

  // Compute local rotation quaternion from current transform
  const localRotation = useMemo(() => {
    const euler = new THREE.Euler(transform.rotationX, transform.rotationY, transform.rotationZ, 'XYZ');
    return new THREE.Quaternion().setFromEuler(euler);
  }, [transform.rotationX, transform.rotationY, transform.rotationZ]);

  // Get drag plane for the axis (always uses global/world coordinates)
  const getDragPlane = useCallback(
    (axis: GizmoAxis, mode: GizmoMode): THREE.Plane => {
      const gizmoCenter = new THREE.Vector3(...center);

      if (mode === 'translate') {
        // For translation, use plane perpendicular to camera but passing through gizmo center
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);

        // For axis-aligned translation, use plane containing the axis and most perpendicular to camera
        let planeNormal: THREE.Vector3;
        const axisDir = axis === 'x' ? new THREE.Vector3(1, 0, 0)
                     : axis === 'y' ? new THREE.Vector3(0, 1, 0)
                     : new THREE.Vector3(0, 0, 1);

        // Find the plane that contains the axis and is most perpendicular to camera
        planeNormal = axisDir.clone().cross(cameraDir).cross(axisDir).normalize();
        if (planeNormal.lengthSq() < 0.001) {
          // Camera is looking along the axis, use camera up as fallback
          const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
          planeNormal = axisDir.clone().cross(cameraUp).cross(axisDir).normalize();
        }

        return new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, gizmoCenter);
      } else {
        // For rotation, use plane perpendicular to rotation axis
        let planeNormal: THREE.Vector3;
        switch (axis) {
          case 'x':
            planeNormal = new THREE.Vector3(1, 0, 0);
            break;
          case 'y':
            planeNormal = new THREE.Vector3(0, 1, 0);
            break;
          case 'z':
          default:
            planeNormal = new THREE.Vector3(0, 0, 1);
            break;
        }
        return new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, gizmoCenter);
      }
    },
    [camera, center]
  );

  // Get world position from pointer (accepts clientX/clientY directly)
  const getWorldPosition = useCallback(
    (clientX: number, clientY: number, plane: THREE.Plane): THREE.Vector3 | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        return intersection;
      }
      return null;
    },
    [camera, gl]
  );

  // Handle drag start
  const handlePointerDown = useCallback(
    (axis: GizmoAxis, mode: GizmoMode) => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();

      // Disable camera controls immediately to block orbit
      if (controls?.enabled) {

        controls.enabled.current = false;
      }

      const plane = getDragPlane(axis, mode);
      const startPoint = getWorldPosition(e.nativeEvent.clientX, e.nativeEvent.clientY, plane);

      if (!startPoint) {
        // Re-enable if we can't start drag
        if (controls?.enabled) {

          controls.enabled.current = true;
        }
        return;
      }

      // Capture full transform state at drag start
      const startTransform = {
        translationX: transform.translationX,
        translationY: transform.translationY,
        translationZ: transform.translationZ,
        rotationX: transform.rotationX,
        rotationY: transform.rotationY,
        rotationZ: transform.rotationZ,
      };

      // Capture rotation quaternion at drag start for consistent axis alignment
      const startRotation = localRotation.clone();

      // Capture gizmo position at drag start (pivot point for rotation)
      const startCenter = new THREE.Vector3(...center);

      dragRef.current = {
        axis,
        mode,
        startPoint,
        startCenter,
        startTransform,
        startRotation,
        plane,
      };

      setDragging(true);
      gl.domElement.setPointerCapture(e.pointerId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- center is captured at drag start, shouldn't cause re-bind mid-drag
    [getDragPlane, getWorldPosition, transform, gl, controls, localRotation]
  );

  // Add global pointer event listeners for dragging
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || !dragRef.current) return;

      const { axis, mode, startPoint, startTransform, startRotation, plane } = dragRef.current;
      const currentPoint = getWorldPosition(e.clientX, e.clientY, plane);

      if (!currentPoint || !axis) return;

      if (mode === 'translate') {
        // Get axis direction (always world/global)
        const axisDir = axis === 'x' ? new THREE.Vector3(1, 0, 0)
                      : axis === 'y' ? new THREE.Vector3(0, 1, 0)
                      : new THREE.Vector3(0, 0, 1);

        // Project movement onto axis (in world space)
        const delta = currentPoint.clone().sub(startPoint);
        const movement = delta.dot(axisDir);

        // Movement vector in world space
        const worldMovement = axisDir.clone().multiplyScalar(movement);

        // Update all translation components (world-space movement)
        setTransform({
          translationX: startTransform.translationX + worldMovement.x,
          translationY: startTransform.translationY + worldMovement.y,
          translationZ: startTransform.translationZ + worldMovement.z,
        });
      } else if (mode === 'rotate') {
        // Use the captured start center as the pivot point for rotation calculations
        const pivotPoint = dragRef.current!.startCenter;

        // Calculate rotation angle from mouse movement around the pivot
        const startDir = startPoint.clone().sub(pivotPoint).normalize();
        const currentDir = currentPoint.clone().sub(pivotPoint).normalize();

        // Get rotation axis (always world/global)
        const worldAxis = axis === 'x' ? new THREE.Vector3(1, 0, 0)
                        : axis === 'y' ? new THREE.Vector3(0, 1, 0)
                        : new THREE.Vector3(0, 0, 1);

        // Calculate signed angle
        const cross = startDir.clone().cross(currentDir);
        const dot = startDir.dot(currentDir);
        let angle = Math.atan2(cross.length(), dot);

        // Determine sign based on rotation axis
        if (cross.dot(worldAxis) < 0) {
          angle = -angle;
        }

        // Create rotation quaternion for the angle around the WORLD axis
        const deltaRotationWorld = new THREE.Quaternion().setFromAxisAngle(worldAxis, angle);

        // To rotate around the pivot point (not the origin), we need to:
        // 1. Compute new rotation: newRotation = deltaRotation * startRotation (world-space delta applied first)
        // 2. Adjust translation so the pivot point stays fixed

        // New rotation = deltaRotation (world) * startRotation
        const newRotation = deltaRotationWorld.clone().multiply(startRotation);

        // The pivot point should stay at the same world position.
        // newTranslation = pivotPoint - deltaRotationWorld * (pivotPoint - startTranslation)

        const startTranslation = new THREE.Vector3(
          startTransform.translationX,
          startTransform.translationY,
          startTransform.translationZ
        );

        // Vector from translation origin to pivot
        const pivotOffset = pivotPoint.clone().sub(startTranslation);

        // Rotate this offset by the delta rotation
        const rotatedOffset = pivotOffset.clone().applyQuaternion(deltaRotationWorld);

        // New translation keeps the pivot at the same world position
        const newTranslation = pivotPoint.clone().sub(rotatedOffset);

        // Convert rotation to Euler angles
        const euler = new THREE.Euler().setFromQuaternion(newRotation, 'XYZ');

        setTransform({
          translationX: newTranslation.x,
          translationY: newTranslation.y,
          translationZ: newTranslation.z,
          rotationX: euler.x,
          rotationY: euler.y,
          rotationZ: euler.z,
        });
      }
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
        if (controls?.enabled) {
           
          controls.enabled.current = true;
        }
        dragRef.current = null;
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

  // Common context menu handler for all gizmo elements
  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Also stop native DOM event to prevent global context menu from opening
    e.nativeEvent.stopPropagation();
    e.nativeEvent.preventDefault();
    setContextMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, []);

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
        isHovered={(hoveredAxis === 'x' && hoveredMode === 'translate') || (dragging && dragRef.current?.axis === 'x' && dragRef.current?.mode === 'translate')}
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
        isHovered={(hoveredAxis === 'y' && hoveredMode === 'translate') || (dragging && dragRef.current?.axis === 'y' && dragRef.current?.mode === 'translate')}
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
        isHovered={(hoveredAxis === 'z' && hoveredMode === 'translate') || (dragging && dragRef.current?.axis === 'z' && dragRef.current?.mode === 'translate')}
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
        isHovered={(hoveredAxis === 'x' && hoveredMode === 'rotate') || (dragging && dragRef.current?.axis === 'x' && dragRef.current?.mode === 'rotate')}
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
        isHovered={(hoveredAxis === 'y' && hoveredMode === 'rotate') || (dragging && dragRef.current?.axis === 'y' && dragRef.current?.mode === 'rotate')}
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
        isHovered={(hoveredAxis === 'z' && hoveredMode === 'rotate') || (dragging && dragRef.current?.axis === 'z' && dragRef.current?.mode === 'rotate')}
        onPointerDown={handlePointerDown('z', 'rotate')}
        onPointerOver={handleGizmoPointerOver('z', 'rotate')}
        onPointerMove={handleGizmoPointerMove}
        onPointerOut={handleGizmoPointerOut}
        onContextMenu={handleContextMenu}
      />

      {/* Center sphere - right-click for context menu */}
      <mesh onContextMenu={handleContextMenu} renderOrder={999}>
        <sphereGeometry args={[size * 0.02, 16, 16]} />
        <meshBasicMaterial color={0xffffff} depthTest={false} transparent opacity={1} />
      </mesh>

      {/* Hover hint - shown when hovering over gizmo elements */}
      {hoveredAxis && mousePos && !contextMenu && (
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
            <div className={hoverCardStyles.title}>Transform Gizmo</div>
            <div className={hoverCardStyles.subtitle}>
              {hoveredAxis.toUpperCase()}-axis • {hoveredMode}
            </div>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Drag: {hoveredMode}
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Right: options
              </div>
            </div>
          </div>
        </Html>
      )}

      {/* Context menu - rendered at cursor position */}
      {contextMenu && (
        <GizmoContextMenu
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onReset={() => { resetTransform(); setContextMenu(null); }}
          onReload={() => { if (droppedFiles) { resetTransform(); processFiles(droppedFiles); } setContextMenu(null); }}
          onApply={() => { applyTransformToData(); setContextMenu(null); }}
          onOff={() => { setShowGizmo(false); setContextMenu(null); }}
        />
      )}
    </group>
  );
}

// Extracted context menu component with click-outside behavior
interface GizmoContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onReset: () => void;
  onReload: () => void;
  onApply: () => void;
  onOff: () => void;
}

function GizmoContextMenu({ position, onClose, onReset, onReload, onApply, onOff }: GizmoContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Delay to avoid immediate close from triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <Html
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        pointerEvents: 'auto',
      }}
      calculatePosition={() => [0, 0]}
    >
      <div
        ref={menuRef}
        className={contextMenuStyles.container}
      >
        <button className={contextMenuStyles.button} onClick={onReset}>
          <ResetIcon className={contextMenuStyles.icon} />
          Reset
        </button>
        <button className={contextMenuStyles.button} onClick={onReload}>
          <ReloadIcon className={contextMenuStyles.icon} />
          Reload
        </button>
        <button className={contextMenuStyles.button} onClick={onApply}>
          <CheckIcon className={contextMenuStyles.icon} />
          Apply
        </button>
        <button className={contextMenuStyles.button} onClick={onOff}>
          <OffIcon className={contextMenuStyles.icon} />
          Off
        </button>
      </div>
    </Html>
  );
}
