import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useReconstructionStore, useRigStore } from '../../store';
import { getImageWorldPosition } from '../../utils/colmapTransforms';
import type { Image } from '../../types/colmap';

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
  const rigDisplayMode = useRigStore((s) => s.rigDisplayMode);
  const rigLineColor = useRigStore((s) => s.rigLineColor);
  const rigLineOpacity = useRigStore((s) => s.rigLineOpacity);

  // Build geometry with all line segments connecting cameras within frames
  const geometry = useMemo(() => {
    // Only render when in lines mode
    if (rigDisplayMode !== 'lines' || !reconstruction) return null;

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

    // Build flat array of positions: [start1, end1, start2, end2, ...]
    const positions: number[] = [];

    for (const images of frameGroups.values()) {
      // Need at least 2 cameras to draw connections
      if (images.length < 2) continue;

      // Get positions of all cameras in this frame group
      const cameraPositions = images.map(img => getImageWorldPosition(img));

      // Draw lines connecting first camera to all others (star pattern)
      const firstPos = cameraPositions[0];
      for (let i = 1; i < cameraPositions.length; i++) {
        const pos = cameraPositions[i];
        // Start point
        positions.push(firstPos.x, firstPos.y, firstPos.z);
        // End point
        positions.push(pos.x, pos.y, pos.z);
      }
    }

    if (positions.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [reconstruction, rigDisplayMode]);

  // Dispose geometry when it changes to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  // Don't render when off, no geometry, or in hull mode (not implemented yet)
  if (rigDisplayMode === 'off' || rigDisplayMode === 'hull' || !geometry) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={998}>
      <lineBasicMaterial
        color={rigLineColor}
        transparent
        opacity={rigLineOpacity}
        depthTest={false}
      />
    </lineSegments>
  );
}
