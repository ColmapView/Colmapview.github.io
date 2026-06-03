import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { GIZMO_COLORS } from './transformGizmoConstants';

export type GizmoAxis = 'x' | 'y' | 'z' | null;
export type GizmoMode = 'translate' | 'rotate' | null;

const OPACITY = {
  arc: 0.6,
  arcHover: 0.9,
  axis: 0.8,
  axisHover: 1.0,
};

interface GizmoHandlePointerProps {
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

interface RotationArcProps extends GizmoHandlePointerProps {
  axis: 'x' | 'y' | 'z';
  color: number;
  radius: number;
  isHovered: boolean;
}

export function RotationArc({
  axis,
  color,
  radius,
  isHovered,
  onPointerDown,
  onPointerOver,
  onPointerMove,
  onPointerOut,
  onContextMenu,
}: RotationArcProps) {
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

interface TranslationArrowProps extends GizmoHandlePointerProps {
  axis: 'x' | 'y' | 'z';
  color: number;
  length: number;
  isHovered: boolean;
}

export function TranslationArrow({
  axis,
  color,
  length,
  isHovered,
  onPointerDown,
  onPointerOver,
  onPointerMove,
  onPointerOut,
  onContextMenu,
}: TranslationArrowProps) {
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
