import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useTransformStore } from '../../store';
import { VIZ_COLORS } from '../../theme';

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
  coordinateMode: 'local' | 'global';
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
  onPointerOut,
}: {
  axis: 'x' | 'y' | 'z';
  color: number;
  radius: number;
  isHovered: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
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

  const tubeRadius = radius * 0.04;
  const displayColor = isHovered ? GIZMO_COLORS.hover : color;
  const opacity = isHovered ? OPACITY.arcHover : OPACITY.arc;

  return (
    <mesh
      rotation={rotation}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
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
  onPointerOut,
}: {
  axis: 'x' | 'y' | 'z';
  color: number;
  length: number;
  isHovered: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
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
  const shaftRadius = length * 0.03;
  const coneLength = length * 0.2;
  const coneRadius = length * 0.07;

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
        onPointerOut={onPointerOut}
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
        onPointerOut={onPointerOut}
      >
        <coneGeometry args={[coneRadius, coneLength, 12]} />
        <meshBasicMaterial color={displayColor} transparent opacity={opacity} depthTest={false} />
      </mesh>
    </group>
  );
}

export function TransformGizmo({ center, size, coordinateMode }: TransformGizmoProps) {
  const { camera, gl } = useThree();
  const controls = useThree((state) => state.controls) as unknown as ControlsWithEnabled | undefined;
  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);

  // Drag state
  const [hoveredAxis, setHoveredAxis] = useState<GizmoAxis>(null);
  const [hoveredMode, setHoveredMode] = useState<GizmoMode>(null);
  const [dragging, setDragging] = useState(false);
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
    coordinateMode: 'local' | 'global';  // Coordinate mode at drag start
  } | null>(null);

  const groupRef = useRef<THREE.Group>(null);

  // Compute local rotation quaternion from current transform
  const localRotation = useMemo(() => {
    const euler = new THREE.Euler(transform.rotationX, transform.rotationY, transform.rotationZ, 'XYZ');
    return new THREE.Quaternion().setFromEuler(euler);
  }, [transform.rotationX, transform.rotationY, transform.rotationZ]);

  // Get drag plane for the axis
  const getDragPlane = useCallback(
    (axis: GizmoAxis, mode: GizmoMode, coordMode: 'local' | 'global'): THREE.Plane => {
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

        // Apply local rotation to axis only in local mode
        if (coordMode === 'local') {
          axisDir.applyQuaternion(localRotation);
        }

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
        // Apply local rotation only in local mode
        if (coordMode === 'local') {
          planeNormal.applyQuaternion(localRotation);
        }
        return new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, gizmoCenter);
      }
    },
    [camera, center, localRotation]
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

      const plane = getDragPlane(axis, mode, coordinateMode);
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
        coordinateMode,
      };

      setDragging(true);
      gl.domElement.setPointerCapture(e.pointerId);
    },
    [getDragPlane, getWorldPosition, transform, gl, controls, localRotation, coordinateMode]
  );

  // Add global pointer event listeners for dragging
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || !dragRef.current) return;

      const { axis, mode, startPoint, startTransform, startRotation, plane, coordinateMode: coordMode } = dragRef.current;
      const currentPoint = getWorldPosition(e.clientX, e.clientY, plane);

      if (!currentPoint || !axis) return;

      if (mode === 'translate') {
        // Get axis direction
        let axisDir: THREE.Vector3;
        switch (axis) {
          case 'x':
            axisDir = new THREE.Vector3(1, 0, 0);
            break;
          case 'y':
            axisDir = new THREE.Vector3(0, 1, 0);
            break;
          case 'z':
          default:
            axisDir = new THREE.Vector3(0, 0, 1);
            break;
        }
        // In local mode, transform to world space using rotation at drag start
        // In global mode, use world axis directly
        if (coordMode === 'local') {
          axisDir.applyQuaternion(startRotation);
        }

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

        // Get rotation axis
        let worldAxis: THREE.Vector3;
        switch (axis) {
          case 'x':
            worldAxis = new THREE.Vector3(1, 0, 0);
            break;
          case 'y':
            worldAxis = new THREE.Vector3(0, 1, 0);
            break;
          case 'z':
          default:
            worldAxis = new THREE.Vector3(0, 0, 1);
            break;
        }
        // In local mode, transform to world space using rotation at drag start
        // In global mode, use world axis directly
        if (coordMode === 'local') {
          worldAxis.applyQuaternion(startRotation);
        }

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


  const arrowLength = size * 0.4;
  const arcRadius = size * 0.35;

  return (
    <group ref={groupRef} position={center} quaternion={coordinateMode === 'local' ? localRotation : undefined}>
      {/* Translation arrows */}
      <TranslationArrow
        axis="x"
        color={GIZMO_COLORS.x}
        length={arrowLength}
        isHovered={hoveredAxis === 'x' && hoveredMode === 'translate'}
        onPointerDown={handlePointerDown('x', 'translate')}
        onPointerOver={() => { setHoveredAxis('x'); setHoveredMode('translate'); }}
        onPointerOut={() => { setHoveredAxis(null); setHoveredMode(null); }}
      />
      <TranslationArrow
        axis="y"
        color={GIZMO_COLORS.y}
        length={arrowLength}
        isHovered={hoveredAxis === 'y' && hoveredMode === 'translate'}
        onPointerDown={handlePointerDown('y', 'translate')}
        onPointerOver={() => { setHoveredAxis('y'); setHoveredMode('translate'); }}
        onPointerOut={() => { setHoveredAxis(null); setHoveredMode(null); }}
      />
      <TranslationArrow
        axis="z"
        color={GIZMO_COLORS.z}
        length={arrowLength}
        isHovered={hoveredAxis === 'z' && hoveredMode === 'translate'}
        onPointerDown={handlePointerDown('z', 'translate')}
        onPointerOver={() => { setHoveredAxis('z'); setHoveredMode('translate'); }}
        onPointerOut={() => { setHoveredAxis(null); setHoveredMode(null); }}
      />

      {/* Rotation arcs */}
      <RotationArc
        axis="x"
        color={GIZMO_COLORS.x}
        radius={arcRadius}
        isHovered={hoveredAxis === 'x' && hoveredMode === 'rotate'}
        onPointerDown={handlePointerDown('x', 'rotate')}
        onPointerOver={() => { setHoveredAxis('x'); setHoveredMode('rotate'); }}
        onPointerOut={() => { setHoveredAxis(null); setHoveredMode(null); }}
      />
      <RotationArc
        axis="y"
        color={GIZMO_COLORS.y}
        radius={arcRadius}
        isHovered={hoveredAxis === 'y' && hoveredMode === 'rotate'}
        onPointerDown={handlePointerDown('y', 'rotate')}
        onPointerOver={() => { setHoveredAxis('y'); setHoveredMode('rotate'); }}
        onPointerOut={() => { setHoveredAxis(null); setHoveredMode(null); }}
      />
      <RotationArc
        axis="z"
        color={GIZMO_COLORS.z}
        radius={arcRadius}
        isHovered={hoveredAxis === 'z' && hoveredMode === 'rotate'}
        onPointerDown={handlePointerDown('z', 'rotate')}
        onPointerOver={() => { setHoveredAxis('z'); setHoveredMode('rotate'); }}
        onPointerOut={() => { setHoveredAxis(null); setHoveredMode(null); }}
      />

      {/* Center sphere */}
      <mesh>
        <sphereGeometry args={[size * 0.05, 16, 16]} />
        <meshBasicMaterial color={0xffffff} transparent opacity={0.8} depthTest={false} />
      </mesh>
    </group>
  );
}
