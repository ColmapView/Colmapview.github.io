import { useMemo, useRef, useEffect, useState, useCallback, memo } from 'react';
import * as THREE from 'three';
import { Text, Billboard, Html } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { VIZ_COLORS, contextMenuStyles, hoverCardStyles, ICON_SIZES } from '../../theme';
import { useUIStore } from '../../store';
import type { AxesCoordinateSystem, AxisLabelMode, AxesDisplayMode } from '../../store/types';
import { CheckIcon, HideIcon } from '../../icons';
import { COORDINATE_SYSTEMS } from '../../utils/coordinateSystems';

// Helper to calculate rotation quaternion from default cylinder (Y-axis) to target direction
function getAxisRotation(direction: [number, number, number]): THREE.Euler {
  const dir = new THREE.Vector3(...direction).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  // Handle case where direction is parallel to up vector
  if (Math.abs(dir.y) > 0.999) {
    // Direction is along Y axis (up or down)
    return new THREE.Euler(0, 0, dir.y > 0 ? 0 : Math.PI);
  }

  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(up, dir);
  return new THREE.Euler().setFromQuaternion(quaternion);
}

// Helper to calculate position (center of cylinder) from direction
function getAxisPosition(direction: [number, number, number], length: number): [number, number, number] {
  return [
    direction[0] * length / 2,
    direction[1] * length / 2,
    direction[2] * length / 2,
  ];
}

interface OriginAxesProps {
  size: number;
  scale?: number;
  coordinateSystem?: AxesCoordinateSystem;
  labelMode?: AxisLabelMode;
}

// Gray color for negative axis lines
const NEGATIVE_AXIS_COLOR = 0x666666;

// Display names for coordinate systems
const COORDINATE_SYSTEM_NAMES: Record<AxesCoordinateSystem, string> = {
  colmap: 'COLMAP',
  opencv: 'OpenCV',
  threejs: 'Three.js',
  opengl: 'OpenGL',
  vulkan: 'Vulkan',
  blender: 'Blender',
  houdini: 'Houdini',
  unity: 'Unity',
  unreal: 'Unreal',
};

// Screen position for context menus (like gizmo)
interface MenuPosition {
  x: number;
  y: number;
}

// All coordinate systems for menu
const ALL_COORDINATE_SYSTEMS: AxesCoordinateSystem[] = [
  'colmap', 'opencv', 'threejs', 'opengl', 'vulkan', 'blender', 'houdini', 'unity', 'unreal'
];

// All label modes for menu
const ALL_LABEL_MODES: { value: AxisLabelMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'xyz', label: 'XYZ' },
  { value: 'extra', label: 'Extra' },
];

// Style for checkmark icon in menus
const checkIconClass = "w-4 h-4 text-ds-accent";

// Labels menu (left-click) - shows label options and hide axes
interface LabelsMenuProps {
  position: MenuPosition;
  currentLabelMode: AxisLabelMode;
  axesDisplayMode: AxesDisplayMode;
  onClose: () => void;
}

const LabelsMenu = memo(function LabelsMenu({
  position,
  currentLabelMode,
  axesDisplayMode,
  onClose,
}: LabelsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const setAxisLabelMode = useUIStore((s) => s.setAxisLabelMode);
  const setAxesDisplayMode = useUIStore((s) => s.setAxesDisplayMode);

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

  const handleLabelChange = useCallback((mode: AxisLabelMode) => {
    setAxisLabelMode(mode);
    onClose();
  }, [setAxisLabelMode, onClose]);

  const handleHideAxes = useCallback(() => {
    if (axesDisplayMode === 'axes') {
      setAxesDisplayMode('off');
    } else if (axesDisplayMode === 'both') {
      setAxesDisplayMode('grid');
    }
    onClose();
  }, [axesDisplayMode, setAxesDisplayMode, onClose]);

  return (
    <Html
      style={{ position: 'fixed', left: position.x, top: position.y, pointerEvents: 'auto' }}
      calculatePosition={() => [0, 0]}
    >
      <div ref={menuRef} className={contextMenuStyles.container}>
        {ALL_LABEL_MODES.map((mode) => (
          <button
            key={mode.value}
            className={contextMenuStyles.button}
            onClick={() => handleLabelChange(mode.value)}
          >
            {currentLabelMode === mode.value ? <CheckIcon className={checkIconClass} /> : <span className="w-4" />}
            {mode.label}
          </button>
        ))}
        <div className="border-t border-ds my-1" />
        <button className={contextMenuStyles.button} onClick={handleHideAxes}>
          <HideIcon className={contextMenuStyles.icon} />
          Hide
        </button>
      </div>
    </Html>
  );
});

// System menu (right-click) - shows coordinate system options
interface SystemMenuProps {
  position: MenuPosition;
  currentSystem: AxesCoordinateSystem;
  onClose: () => void;
}

const SystemMenu = memo(function SystemMenu({
  position,
  currentSystem,
  onClose,
}: SystemMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const setAxesCoordinateSystem = useUIStore((s) => s.setAxesCoordinateSystem);

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

  const handleSystemChange = useCallback((system: AxesCoordinateSystem) => {
    setAxesCoordinateSystem(system);
    onClose();
  }, [setAxesCoordinateSystem, onClose]);

  return (
    <Html
      style={{ position: 'fixed', left: position.x, top: position.y, pointerEvents: 'auto' }}
      calculatePosition={() => [0, 0]}
    >
      <div ref={menuRef} className={contextMenuStyles.container}>
        {ALL_COORDINATE_SYSTEMS.map((sys) => (
          <button
            key={sys}
            className={contextMenuStyles.button}
            onClick={() => handleSystemChange(sys)}
          >
            {currentSystem === sys ? <CheckIcon className={checkIconClass} /> : <span className="w-4" />}
            {COORDINATE_SYSTEM_NAMES[sys]}
          </button>
        ))}
      </div>
    </Html>
  );
});

// Extended props for OriginAxes with context menu support
interface OriginAxesWithMenuProps extends OriginAxesProps {
  axesDisplayMode?: AxesDisplayMode;
}

// Hover color matching TransformGizmo
const AXIS_HOVER_COLOR = 0xffff00;

// Interactive axis cylinder with hover highlight
interface AxisCylinderProps {
  position: [number, number, number];
  rotation: THREE.Euler;
  radius: number;
  length: number;
  color: number;
  isHovered: boolean;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

const AxisCylinder = memo(function AxisCylinder({
  position,
  rotation,
  radius,
  length,
  color,
  isHovered,
  onPointerOver,
  onPointerMove,
  onPointerOut,
  onClick,
  onContextMenu,
}: AxisCylinderProps) {
  // Scale up on hover for visual feedback (matching gizmo behavior)
  const hoverScale = isHovered ? 1.5 : 1.0;

  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={[hoverScale, 1, hoverScale]}
      onPointerOver={onPointerOver}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshBasicMaterial color={isHovered ? AXIS_HOVER_COLOR : color} />
    </mesh>
  );
});

// Interactive label group with hover and click
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
  onPointerOut: () => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

const AxisLabel = memo(function AxisLabel({
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
  onPointerOut,
  onClick,
  onContextMenu,
}: AxisLabelProps) {
  const hasSuffix = showExtra && suffix;
  const displayColor = isHovered ? AXIS_HOVER_COLOR : color;
  const hoverScale = isHovered ? 1.2 : 1.0;

  return (
    <Billboard position={position} follow={true}>
      <group
        scale={[hoverScale, hoverScale, hoverScale]}
        onPointerOver={onPointerOver}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <Text
          fontSize={fontSize}
          color={displayColor}
          anchorX={((isXAxis && showExtra) || hasSuffix) ? 'right' : 'center'}
          anchorY="middle"
          outlineWidth={fontSize * 0.08}
          outlineColor="#000000"
          outlineOpacity={0.5}
        >
          {label}
        </Text>
        {isXAxis && showExtra && (
          <Text
            fontSize={fontSize * 0.6}
            color={displayColor}
            anchorX="left"
            anchorY="middle"
            position={[fontSize * 0.15, 0, 0]}
            outlineWidth={fontSize * 0.05}
            outlineColor="#000000"
            outlineOpacity={0.5}
          >
            ({scaleStr})
          </Text>
        )}
        {hasSuffix && (
          <Text
            fontSize={fontSize * 0.6}
            color={displayColor}
            anchorX="left"
            anchorY="middle"
            position={[fontSize * 0.15, 0, 0]}
            outlineWidth={fontSize * 0.05}
            outlineColor="#000000"
            outlineOpacity={0.5}
          >
            {suffix}
          </Text>
        )}
      </group>
    </Billboard>
  );
});

// Hovered element type: 'pos-0', 'pos-1', 'pos-2', 'neg-0', 'neg-1', 'neg-2', 'label-0', 'label-1', 'label-2'
type HoveredElement = string | null;

export function OriginAxes({ size, scale = 1, coordinateSystem = 'colmap', labelMode = 'extra', axesDisplayMode = 'axes' }: OriginAxesWithMenuProps) {
  const axisLength = size * 0.5;
  const axisRadius = size * 0.005;
  const negativeAxisLength = axisLength * 0.4; // Shorter negative lines

  const system = COORDINATE_SYSTEMS[coordinateSystem];

  // Access controls to check if camera is being dragged (like frustum)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { controls } = useThree() as any;

  // Check if camera controls are dragging (orbit/pan in progress)
  const isDragging = () => controls?.dragging?.current ?? false;

  // Hover state (managed at parent level like TransformGizmo)
  const [hoveredElement, setHoveredElement] = useState<HoveredElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Menu state - separate for left-click (labels) and right-click (system)
  const [labelsMenu, setLabelsMenu] = useState<MenuPosition | null>(null);
  const [systemMenu, setSystemMenu] = useState<MenuPosition | null>(null);

  // Pointer handlers for hover tracking (same pattern as frustum)
  const handlePointerOver = useCallback((id: string) => (e: ThreeEvent<PointerEvent>) => {
    // Ignore hover during camera orbit/pan
    if (isDragging()) return;
    if (!hoveredElement) {
      setHoveredElement(id);
      setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      document.body.style.cursor = 'pointer';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isDragging is called dynamically to get latest drag state
  }, [hoveredElement]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    // Clear hover state if dragging started while hovering
    if (isDragging()) {
      if (hoveredElement) {
        setHoveredElement(null);
        setMousePos(null);
        document.body.style.cursor = '';
      }
      return;
    }
    if (hoveredElement) {
      setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isDragging is called dynamically to get latest drag state
  }, [hoveredElement]);

  const handlePointerOut = useCallback((id: string) => () => {
    if (hoveredElement === id) {
      setHoveredElement(null);
      setMousePos(null);
      document.body.style.cursor = '';
    }
  }, [hoveredElement]);

  // Left-click: show labels menu
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setSystemMenu(null);
    setLabelsMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, []);

  // Right-click: show system menu
  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Also stop native DOM event to prevent global context menu from opening
    e.nativeEvent.stopPropagation();
    e.nativeEvent.preventDefault();
    setLabelsMenu(null);
    setSystemMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, []);

  const handleCloseLabelsMenu = useCallback(() => {
    setLabelsMenu(null);
  }, []);

  const handleCloseSystemMenu = useCallback(() => {
    setSystemMenu(null);
  }, []);

  // Derive display flags from labelMode
  const showLabels = labelMode !== 'off';
  const showExtra = labelMode === 'extra';

  // Format scale for display (3 significant digits)
  const scaleStr = scale.toPrecision(3);

  // Order axes Y, X, Z to match typical "up" axis priority
  const axes = useMemo(() => [
    { direction: system.y, color: VIZ_COLORS.axis.y, label: 'Y', suffix: `(${COORDINATE_SYSTEM_NAMES[coordinateSystem]})` },
    { direction: system.x, color: VIZ_COLORS.axis.x, label: 'X' },
    { direction: system.z, color: VIZ_COLORS.axis.z, label: 'Z' },
  ], [system, coordinateSystem]);

  // Calculate negative directions (opposite of positive)
  const negativeAxes = useMemo(() => axes.map(axis => ({
    direction: [
      -axis.direction[0],
      -axis.direction[1],
      -axis.direction[2],
    ] as [number, number, number],
  })), [axes]);

  const labelOffset = axisLength * 1.15; // Position labels with gap from axis end
  const fontSize = size * 0.08;

  return (
    <group>
      {/* Positive axis lines (colored) */}
      {axes.map((axis, i) => {
        const id = `pos-${i}`;
        const rotation = getAxisRotation(axis.direction);
        const position = getAxisPosition(axis.direction, axisLength);
        return (
          <AxisCylinder
            key={id}
            position={position}
            rotation={rotation}
            radius={axisRadius}
            length={axisLength}
            color={axis.color}
            isHovered={hoveredElement === id}
            onPointerOver={handlePointerOver(id)}
            onPointerMove={handlePointerMove}
            onPointerOut={handlePointerOut(id)}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
          />
        );
      })}
      {/* Negative axis lines (gray, opaque) */}
      {negativeAxes.map((_, i) => {
        const id = `neg-${i}`;
        const axis = negativeAxes[i];
        const rotation = getAxisRotation(axis.direction);
        const position = getAxisPosition(axis.direction, negativeAxisLength);
        return (
          <AxisCylinder
            key={id}
            position={position}
            rotation={rotation}
            radius={axisRadius * 0.7}
            length={negativeAxisLength}
            color={NEGATIVE_AXIS_COLOR}
            isHovered={hoveredElement === id}
            onPointerOver={handlePointerOver(id)}
            onPointerMove={handlePointerMove}
            onPointerOut={handlePointerOut(id)}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
          />
        );
      })}
      {/* Axis labels (billboard text) */}
      {showLabels && axes.map((axis, i) => {
        const id = `label-${i}`;
        const labelPosition: [number, number, number] = [
          axis.direction[0] * labelOffset,
          axis.direction[1] * labelOffset,
          axis.direction[2] * labelOffset,
        ];
        return (
          <AxisLabel
            key={id}
            position={labelPosition}
            label={axis.label}
            suffix={'suffix' in axis ? axis.suffix : undefined}
            scaleStr={scaleStr}
            showExtra={showExtra}
            isXAxis={i === 1}
            color={axis.color}
            fontSize={fontSize}
            isHovered={hoveredElement === id}
            onPointerOver={handlePointerOver(id)}
            onPointerMove={handlePointerMove}
            onPointerOut={handlePointerOut(id)}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
          />
        );
      })}
      {/* Hover card popup */}
      {hoveredElement && mousePos && !labelsMenu && !systemMenu && (
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
            <div className={hoverCardStyles.title}>Origin Axes</div>
            <div className={hoverCardStyles.subtitle}>{COORDINATE_SYSTEM_NAMES[coordinateSystem]}</div>
            <div className={hoverCardStyles.hint}>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Left: labels
              </div>
              <div className={hoverCardStyles.hintRow}>
                <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="6"/>
                  <path d="M12 2v8"/>
                  <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
                </svg>
                Right: coord system
              </div>
            </div>
          </div>
        </Html>
      )}
      {/* Labels menu (left-click) */}
      {labelsMenu && (
        <LabelsMenu
          position={labelsMenu}
          currentLabelMode={labelMode}
          axesDisplayMode={axesDisplayMode}
          onClose={handleCloseLabelsMenu}
        />
      )}
      {/* System menu (right-click) */}
      {systemMenu && (
        <SystemMenu
          position={systemMenu}
          currentSystem={coordinateSystem}
          onClose={handleCloseSystemMenu}
        />
      )}
    </group>
  );
}

interface OriginGridProps {
  size: number;
  scale?: number;
}

export function OriginGrid({ size, scale = 1 }: OriginGridProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const gridScale = size * 0.1 * scale; // Scale factor for grid spacing

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false, // Prevent z-fighting with background
      uniforms: {
        uGridScale: { value: gridScale },
        uColor1: { value: new THREE.Color(0xffcc88) }, // Light orange for major grid lines
        uColor2: { value: new THREE.Color(0x888888) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uGridScale;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying vec3 vWorldPos;

        // Robust grid line calculation that avoids fwidth discontinuities
        float getGrid(vec2 pos, float scale, float lineWidth) {
          vec2 coord = pos / scale;
          vec2 grid = abs(fract(coord - 0.5) - 0.5);
          // Use analytical derivative based on scale for stability
          vec2 deriv = fwidth(coord);
          // Clamp derivatives to avoid precision issues at grazing angles and orthographic view
          // Higher minimum prevents grid from becoming solid in ortho view
          deriv = clamp(deriv, vec2(0.001), vec2(0.5));
          vec2 lines = smoothstep(deriv * lineWidth, vec2(0.0), grid);
          return max(lines.x, lines.y);
        }

        void main() {
          // Major grid lines (every 10 units)
          float majorGrid = getGrid(vWorldPos.xz, uGridScale * 10.0, 1.5);
          // Minor grid lines (every 1 unit)
          float minorGrid = getGrid(vWorldPos.xz, uGridScale, 1.0);

          // Fade based on distance from origin
          float dist = length(vWorldPos.xz);
          float fade = 1.0 - smoothstep(uGridScale * 50.0, uGridScale * 100.0, dist);

          // Combine grids - only show actual grid lines, no fill
          vec3 color = mix(uColor2, uColor1, majorGrid);
          float alpha = max(majorGrid * 0.8, minorGrid * 0.3) * fade;

          // Discard pixels that aren't on grid lines
          if (alpha < 0.05) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
  }, [gridScale]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- THREE.js shader uniform requires direct mutation
    material.uniforms.uGridScale.value = gridScale;
  }, [material, gridScale]);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[10000, 10000]} />
    </mesh>
  );
}
