import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useReconstructionStore, useRigStore, useCameraStore } from '../../store';
import { getImageWorldPosition } from '../../utils/colmapTransforms';
import { getCameraColor } from '../../theme';
import { lineVertexShader, lineFragmentShader } from './shaders';
import type { Image } from '../../types/colmap';

// Temp color object for per-frame coloring
const tempColor = new THREE.Color();

/**
 * Helper to calculate blink factor (0-1) from phase (0-2 seconds)
 * Matches the pattern used in CameraMatches for visual consistency
 */
function getBlinkFactor(phase: number): number {
  if (phase < 0.3) return phase / 0.3;        // Fade in
  if (phase < 0.6) return 1;                   // Full
  if (phase < 1.0) return 1 - (phase - 0.6) / 0.4;  // Fade out
  return 0;                                    // Hidden
}

/**
 * Extract frame identifier from image name.
 * Supports patterns like:
 * - "cam_1/00.png" → "00.png" (directory/filename)
 * - "cam1_frame00.jpg" → "frame00.jpg" (prefix_frame)
 * - "image_001.png" → "001.png" (fallback: filename only)
 */
function extractFrameId(imageName: string): string {
  // Handle path separators (both / and \)
  const parts = imageName.split(/[/\\]/);
  if (parts.length >= 2) {
    // Return the filename part (last component)
    return parts[parts.length - 1];
  }
  // Fallback: return the whole name
  return imageName;
}

/**
 * RigConnections component renders visual connections between cameras
 * that belong to the same frame in a multi-camera rig.
 *
 * It infers rig connections from image names - images with the same
 * frame identifier (e.g., "cam_1/00.png" and "cam_2/00.png" share frame "00.png")
 * are connected with lines.
 */
export function RigConnections() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const showRig = useRigStore((s) => s.showRig);
  const rigDisplayMode = useRigStore((s) => s.rigDisplayMode);
  const rigColorMode = useRigStore((s) => s.rigColorMode);
  const rigLineColor = useRigStore((s) => s.rigLineColor);
  const rigLineOpacity = useRigStore((s) => s.rigLineOpacity);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const unselectedCameraOpacity = useCameraStore((s) => s.unselectedCameraOpacity);

  // Refs for geometry and animation
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const blinkPhaseRef = useRef(0);

  // Track previous state to avoid unnecessary GPU uploads
  const prevStateRef = useRef<{
    selectedImageId: number | null;
    rigLineOpacity: number;
    unselectedCameraOpacity: number;
  } | null>(null);

  // Build geometry data with positions, colors, and frame membership for selection
  const geometryData = useMemo(() => {
    // Render when rig is shown
    if (!showRig || !reconstruction) return null;

    // Group images by frame identifier (extracted from image name)
    const frameGroups = new Map<string, Image[]>();
    for (const image of reconstruction.images.values()) {
      const frameId = extractFrameId(image.name);
      const group = frameGroups.get(frameId);
      if (group) {
        group.push(image);
      } else {
        frameGroups.set(frameId, [image]);
      }
    }

    // Build flat arrays
    const positions: number[] = [];
    const colors: number[] = [];
    const alphas: number[] = [];
    // Track which image IDs are in each line segment's frame (for selection highlighting)
    const lineFrameImageIds: Set<number>[] = [];

    // Assign frame indices for consistent coloring
    let frameIndex = 0;
    for (const images of frameGroups.values()) {
      // Need at least 2 cameras to draw connections
      if (images.length < 2) continue;

      // Get positions of all cameras in this frame group
      const cameraPositions = images.map(img => getImageWorldPosition(img));

      // Collect all image IDs in this frame
      const frameImageIds = new Set(images.map(img => img.imageId));

      // Get color for this frame
      tempColor.set(getCameraColor(frameIndex));
      frameIndex++;

      // Draw lines connecting first camera to all others (star pattern)
      const firstPos = cameraPositions[0];
      for (let i = 1; i < cameraPositions.length; i++) {
        const pos = cameraPositions[i];
        // Start point
        positions.push(firstPos.x, firstPos.y, firstPos.z);
        colors.push(tempColor.r, tempColor.g, tempColor.b);
        alphas.push(1.0);
        // End point
        positions.push(pos.x, pos.y, pos.z);
        colors.push(tempColor.r, tempColor.g, tempColor.b);
        alphas.push(1.0);
        // Track frame membership for both vertices of this line segment
        lineFrameImageIds.push(frameImageIds);
        lineFrameImageIds.push(frameImageIds);
      }
    }

    if (positions.length === 0) return null;

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      alphas: new Float32Array(alphas),
      lineFrameImageIds,
    };
  }, [reconstruction, showRig, rigColorMode]);

  // Create shader material for per-vertex alpha support
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
  }, []);

  // Update colors and alphas based on selection, color mode, and blink animation
  useFrame((_, delta) => {
    if (!geometryRef.current || !geometryData) return;

    const colorAttr = geometryRef.current.getAttribute('color') as THREE.BufferAttribute;
    const alphaAttr = geometryRef.current.getAttribute('alpha') as THREE.BufferAttribute;
    if (!colorAttr || !alphaAttr) return;

    // Check if blink animation is active
    const isBlinkAnimated = rigDisplayMode === 'blink';
    if (isBlinkAnimated) {
      blinkPhaseRef.current = (blinkPhaseRef.current + delta) % 2;
    }

    // Check if state changed - skip update if static and unchanged
    const prev = prevStateRef.current;
    const stateChanged = !prev ||
      prev.selectedImageId !== selectedImageId ||
      prev.rigLineOpacity !== rigLineOpacity ||
      prev.unselectedCameraOpacity !== unselectedCameraOpacity;

    // Skip update if static and unchanged
    if (!isBlinkAnimated && !stateChanged) return;

    // Update alpha values
    const blinkFactor = isBlinkAnimated ? (0.1 + 0.9 * getBlinkFactor(blinkPhaseRef.current)) : 1;
    const { lineFrameImageIds } = geometryData;

    for (let i = 0; i < alphaAttr.count; i++) {
      const frameImageIds = lineFrameImageIds[i];
      const isInSelectedFrame = selectedImageId !== null && frameImageIds.has(selectedImageId);

      // When a camera is selected: selected frame gets full opacity, others get dimmed
      // When no camera is selected: all lines get full opacity
      let alpha: number;
      if (selectedImageId === null) {
        alpha = rigLineOpacity * blinkFactor;
      } else if (isInSelectedFrame) {
        alpha = rigLineOpacity * blinkFactor;
      } else {
        alpha = rigLineOpacity * unselectedCameraOpacity * blinkFactor;
      }

      alphaAttr.setX(i, alpha);
    }

    // Update colors based on color mode
    if (rigColorMode === 'single') {
      tempColor.set(rigLineColor);
      for (let i = 0; i < colorAttr.count; i++) {
        colorAttr.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);
      }
      colorAttr.needsUpdate = true;
    }

    alphaAttr.needsUpdate = true;

    // Update previous state
    prevStateRef.current = {
      selectedImageId,
      rigLineOpacity,
      unselectedCameraOpacity,
    };
  });

  // Don't render when off or no geometry data
  if (!showRig || !geometryData) return null;

  return (
    <lineSegments material={shaderMaterial} renderOrder={998}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[geometryData.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[geometryData.colors, 3]}
        />
        <bufferAttribute
          attach="attributes-alpha"
          args={[geometryData.alphas, 1]}
        />
      </bufferGeometry>
    </lineSegments>
  );
}
