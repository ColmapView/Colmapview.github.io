import type { AxesCoordinateSystem } from '../store/types';

// Coordinate system axis directions (as unit vectors in Three.js world space)
// In Three.js: +X=right, +Y=up, +Z=toward viewer (backward), -Z=into scene (forward)
// Each system defines where X, Y, Z axes point
export const COORDINATE_SYSTEMS: Record<AxesCoordinateSystem, { x: [number, number, number]; y: [number, number, number]; z: [number, number, number] }> = {
  colmap: {   // Raw COLMAP data rendered directly in Three.js (numerical ground truth)
    x: [1, 0, 0],     // +X data at Three.js +X
    y: [0, 1, 0],     // +Y data at Three.js +Y
    z: [0, 0, 1],     // +Z data at Three.js +Z
  },
  opencv: {   // Same as COLMAP (data loaded without transform)
    x: [1, 0, 0],     // +X data at Three.js +X
    y: [0, 1, 0],     // +Y data at Three.js +Y
    z: [0, 0, 1],     // +Z data at Three.js +Z
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
  // Y-vertical systems (most common): use Y direction [0, 1, 0]
  return system.y;
}
