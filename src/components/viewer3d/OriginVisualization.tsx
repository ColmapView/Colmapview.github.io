import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Text, Billboard } from '@react-three/drei';
import { VIZ_COLORS } from '../../theme';
import type { AxesCoordinateSystem, AxisLabelMode } from '../../store/types';

// Coordinate system axis directions (as unit vectors in Three.js world space)
// In Three.js: +X=right, +Y=up, +Z=toward viewer (backward), -Z=into scene (forward)
// Each system defines where X, Y, Z axes point
export const COORDINATE_SYSTEMS: Record<AxesCoordinateSystem, { x: [number, number, number]; y: [number, number, number]; z: [number, number, number] }> = {
  colmap: {   // X-right, Y-down, Z-forward (same as OpenCV)
    x: [1, 0, 0],     // Right
    y: [0, -1, 0],    // Down
    z: [0, 0, -1],    // Forward (into scene)
  },
  opencv: {   // X-right, Y-down, Z-forward (same as COLMAP)
    x: [1, 0, 0],     // Right
    y: [0, -1, 0],    // Down
    z: [0, 0, -1],    // Forward (into scene)
  },
  threejs: {  // X-right, Y-up, Z-backward (same as OpenGL)
    x: [1, 0, 0],     // Right
    y: [0, 1, 0],     // Up
    z: [0, 0, 1],     // Backward (toward viewer)
  },
  opengl: {   // X-right, Y-up, Z-backward (same as Three.js)
    x: [1, 0, 0],     // Right
    y: [0, 1, 0],     // Up
    z: [0, 0, 1],     // Backward (toward viewer)
  },
  vulkan: {   // X-right, Y-up, Z-backward (same as OpenGL in world space)
    x: [1, 0, 0],     // Right
    y: [0, 1, 0],     // Up
    z: [0, 0, 1],     // Backward (toward viewer)
  },
  blender: {  // X-right, Y-forward, Z-up (right-handed, Z-up convention)
    x: [1, 0, 0],     // Right
    y: [0, 0, -1],    // Forward (into scene) - Blender Y is depth axis
    z: [0, 1, 0],     // Up
  },
  houdini: {  // X-right, Y-up, Z-backward (right-handed, same as OpenGL)
    x: [1, 0, 0],     // Right
    y: [0, 1, 0],     // Up
    z: [0, 0, 1],     // Backward (toward viewer)
  },
  unity: {    // X-right, Y-up, Z-forward (LEFT-handed, Y-up)
    x: [1, 0, 0],     // Right
    y: [0, 1, 0],     // Up
    z: [0, 0, -1],    // Forward (into scene)
  },
  unreal: {   // X-forward, Y-right, Z-up (LEFT-handed, Z-up)
    x: [0, 0, -1],    // Forward (into scene) - Unreal X is forward axis
    y: [1, 0, 0],     // Right
    z: [0, 1, 0],     // Up
  },
};

// Get the "world up" direction for a coordinate system (used for horizon lock)
// For Y-vertical systems, this is the Y direction; for Z-up systems, this is the Z direction
export function getWorldUp(coordinateSystem: AxesCoordinateSystem): [number, number, number] {
  const system = COORDINATE_SYSTEMS[coordinateSystem];
  // Z-up systems: Blender, Unreal
  if (coordinateSystem === 'blender' || coordinateSystem === 'unreal') {
    return system.z;
  }
  // Y-vertical systems (most common): use Y direction
  // For COLMAP/OpenCV this is [0, -1, 0], for Three.js/OpenGL this is [0, 1, 0]
  return system.y;
}

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

export function OriginAxes({ size, scale = 1, coordinateSystem = 'colmap', labelMode = 'extra' }: OriginAxesProps) {
  const axisLength = size * 0.5;
  const axisRadius = size * 0.005;
  const negativeAxisLength = axisLength * 0.4; // Shorter negative lines

  const system = COORDINATE_SYSTEMS[coordinateSystem];

  // Derive display flags from labelMode
  const showLabels = labelMode !== 'off';
  const showExtra = labelMode === 'extra';

  // Format scale for display (3 significant digits)
  const scaleStr = scale.toPrecision(3);

  const axes = useMemo(() => [
    { direction: system.x, color: VIZ_COLORS.axis.x, label: 'X' },
    { direction: system.y, color: VIZ_COLORS.axis.y, label: 'Y', suffix: `(${COORDINATE_SYSTEM_NAMES[coordinateSystem]})` },
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
        const rotation = getAxisRotation(axis.direction);
        const position = getAxisPosition(axis.direction, axisLength);
        return (
          <mesh key={`pos-${i}`} position={position} rotation={rotation}>
            <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 8]} />
            <meshBasicMaterial color={axis.color} />
          </mesh>
        );
      })}
      {/* Negative axis lines (gray, opaque) */}
      {negativeAxes.map((axis, i) => {
        const rotation = getAxisRotation(axis.direction);
        const position = getAxisPosition(axis.direction, negativeAxisLength);
        return (
          <mesh key={`neg-${i}`} position={position} rotation={rotation}>
            <cylinderGeometry args={[axisRadius * 0.7, axisRadius * 0.7, negativeAxisLength, 8]} />
            <meshBasicMaterial color={NEGATIVE_AXIS_COLOR} />
          </mesh>
        );
      })}
      {/* Axis labels (billboard text) */}
      {showLabels && axes.map((axis, i) => {
        const labelPosition: [number, number, number] = [
          axis.direction[0] * labelOffset,
          axis.direction[1] * labelOffset,
          axis.direction[2] * labelOffset,
        ];
        const isXAxis = i === 0;
        const hasSuffix = showExtra && 'suffix' in axis && axis.suffix;
        return (
          <Billboard key={`label-${i}`} position={labelPosition} follow={true}>
            <Text
              fontSize={fontSize}
              color={axis.color}
              anchorX={((isXAxis && showExtra) || hasSuffix) ? 'right' : 'center'}
              anchorY="middle"
              outlineWidth={fontSize * 0.08}
              outlineColor="#000000"
              outlineOpacity={0.5}
            >
              {axis.label}
            </Text>
            {isXAxis && showExtra && (
              <Text
                fontSize={fontSize * 0.6}
                color={axis.color}
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
                color={axis.color}
                anchorX="left"
                anchorY="middle"
                position={[fontSize * 0.15, 0, 0]}
                outlineWidth={fontSize * 0.05}
                outlineColor="#000000"
                outlineOpacity={0.5}
              >
                {axis.suffix}
              </Text>
            )}
          </Billboard>
        );
      })}
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
    material.uniforms.uGridScale.value = gridScale;
  }, [material, gridScale]);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[10000, 10000]} />
    </mesh>
  );
}
