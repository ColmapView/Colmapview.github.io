import { memo } from 'react';
import * as THREE from 'three';
import { Billboard } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { CANVAS_COLORS, INTERACTION_HOVER_COLOR } from '../../theme';
import { CanvasTextSprite } from './CanvasTextSprite';

interface AxisCylinderProps {
  position: [number, number, number];
  rotation: THREE.Euler;
  radius: number;
  length: number;
  color: number;
  isHovered: boolean;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

export const AxisCylinder = memo(function AxisCylinder({
  position,
  rotation,
  radius,
  length,
  color,
  isHovered,
  onPointerOver,
  onPointerMove,
  onPointerDown,
  onPointerOut,
  onClick,
  onContextMenu,
}: AxisCylinderProps) {
  const hoverScale = isHovered ? 1.5 : 1.0;

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={[hoverScale, 1, hoverScale]}
      onPointerOver={onPointerOver}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshBasicMaterial color={isHovered ? INTERACTION_HOVER_COLOR : color} />
    </mesh>
  );
});

interface AxisLabelProps {
  position: [number, number, number];
  label: string;
  suffix?: string;
  scaleStr: string;
  showExtra: boolean;
  isXAxis: boolean;
  color: number;
  fontSize: number;
  isHovered: boolean;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

export const AxisLabel = memo(function AxisLabel({
  position,
  label,
  suffix,
  scaleStr,
  showExtra,
  isXAxis,
  color,
  fontSize,
  isHovered,
  onPointerOver,
  onPointerMove,
  onPointerDown,
  onPointerOut,
  onClick,
  onContextMenu,
}: AxisLabelProps) {
  const hasSuffix = showExtra && suffix;
  const displayColor = isHovered ? INTERACTION_HOVER_COLOR : color;
  const hoverScale = isHovered ? 1.2 : 1.0;

  return (
    <Billboard position={position} follow={true}>
      <group
        scale={[hoverScale, hoverScale, hoverScale]}
        onPointerOver={onPointerOver}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerOut={onPointerOut}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <CanvasTextSprite
          text={label}
          fontSize={fontSize}
          color={displayColor}
          anchorX={((isXAxis && showExtra) || hasSuffix) ? 'right' : 'center'}
          outlineWidth={fontSize * 0.08}
          outlineColor={CANVAS_COLORS.outline}
          outlineOpacity={0.5}
        />
        {isXAxis && showExtra && (
          <CanvasTextSprite
            text={`(${scaleStr})`}
            fontSize={fontSize * 0.6}
            color={displayColor}
            anchorX="left"
            position={[fontSize * 0.15, 0, 0]}
            outlineWidth={fontSize * 0.05}
            outlineColor={CANVAS_COLORS.outline}
            outlineOpacity={0.5}
          />
        )}
        {hasSuffix && (
          <CanvasTextSprite
            text={`(${suffix})`}
            fontSize={fontSize * 0.6}
            color={displayColor}
            anchorX="left"
            position={[fontSize * 0.15, 0, 0]}
            outlineWidth={fontSize * 0.05}
            outlineColor={CANVAS_COLORS.outline}
            outlineOpacity={0.5}
          />
        )}
      </group>
    </Billboard>
  );
});
