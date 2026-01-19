import { useMemo } from 'react';
import * as THREE from 'three';
import { useReconstructionStore, useRigStore } from '../../store';
import { getImageWorldPosition } from '../../utils/colmapTransforms';
import { SensorType } from '../../types/rig';
import type { ImageId } from '../../types/colmap';

/**
 * RigConnections component renders visual connections between cameras
 * that belong to the same frame in a multi-camera rig.
 *
 * For each frame, it draws lines connecting all cameras captured together,
 * making it easy to visualize which cameras form a rig.
 */
export function RigConnections() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const rigDisplayMode = useRigStore((s) => s.rigDisplayMode);
  const rigLineColor = useRigStore((s) => s.rigLineColor);
  const rigLineOpacity = useRigStore((s) => s.rigLineOpacity);

  // Build geometry with all line segments connecting cameras within frames
  const geometry = useMemo(() => {
    // Only render when in lines mode and rig data exists
    if (rigDisplayMode !== 'lines' || !reconstruction?.rigData) return null;

    const { frames } = reconstruction.rigData;
    if (frames.size === 0) return null;

    // Build flat array of positions: [start1, end1, start2, end2, ...]
    const positions: number[] = [];

    for (const frame of frames.values()) {
      // Get all image IDs for camera sensors in this frame
      const imageIds: ImageId[] = [];
      for (const mapping of frame.dataIds) {
        if (mapping.sensorId.type === SensorType.CAMERA) {
          imageIds.push(mapping.dataId);
        }
      }

      // Need at least 2 cameras to draw connections
      if (imageIds.length < 2) continue;

      // Get positions of all cameras in this frame
      const cameraPositions: THREE.Vector3[] = [];
      for (const imageId of imageIds) {
        const image = reconstruction.images.get(imageId);
        if (image) {
          cameraPositions.push(getImageWorldPosition(image));
        }
      }

      // Draw lines connecting first camera to all others (star pattern)
      if (cameraPositions.length >= 2) {
        const firstPos = cameraPositions[0];
        for (let i = 1; i < cameraPositions.length; i++) {
          const pos = cameraPositions[i];
          // Start point
          positions.push(firstPos.x, firstPos.y, firstPos.z);
          // End point
          positions.push(pos.x, pos.y, pos.z);
        }
      }
    }

    if (positions.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [reconstruction, rigDisplayMode]);

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
