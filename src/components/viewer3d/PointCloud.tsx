import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useReconstructionStore, useViewerStore } from '../../store';

/**
 * Jet colormap: blue -> cyan -> green -> yellow -> red
 */
function jetColormap(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.25) {
    return [0, t * 4, 1];
  } else if (t < 0.5) {
    return [0, 1, 1 - (t - 0.25) * 4];
  } else if (t < 0.75) {
    return [(t - 0.5) * 4, 1, 0];
  } else {
    return [1, 1 - (t - 0.75) * 4, 0];
  }
}

export function PointCloud() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const colorMode = useViewerStore((s) => s.colorMode);
  const pointSize = useViewerStore((s) => s.pointSize);
  const minTrackLength = useViewerStore((s) => s.minTrackLength);
  const selectedImageId = useViewerStore((s) => s.selectedImageId);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  const { positions, colors } = useMemo(() => {
    if (!reconstruction) return { positions: null, colors: null };

    // Filter points by minimum track length
    const points = Array.from(reconstruction.points3D.values())
      .filter(p => p.track.length >= minTrackLength);
    const count = points.length;

    if (count === 0) return { positions: null, colors: null };

    const positions = new Float32Array(count * 3);
    const rgbColors = new Float32Array(count * 3);
    const errorColors = new Float32Array(count * 3);
    const trackColors = new Float32Array(count * 3);

    // Build set of point IDs visible in selected image for fast lookup
    const selectedImagePointIds = new Set<bigint>();
    if (selectedImageId !== null) {
      const selectedImage = reconstruction.images.get(selectedImageId);
      if (selectedImage) {
        for (const p2d of selectedImage.points2D) {
          if (p2d.point3DId !== BigInt(-1)) {
            selectedImagePointIds.add(p2d.point3DId);
          }
        }
      }
    }

    // Calculate min/max for normalization
    let minError = Infinity, maxError = -Infinity;
    let minTrack = Infinity, maxTrack = -Infinity;

    for (const p of points) {
      if (p.error >= 0) {
        minError = Math.min(minError, p.error);
        maxError = Math.max(maxError, p.error);
      }
      minTrack = Math.min(minTrack, p.track.length);
      maxTrack = Math.max(maxTrack, p.track.length);
    }

    // Handle case where all errors are the same
    if (minError === maxError) {
      maxError = minError + 1;
    }
    if (minTrack === maxTrack) {
      maxTrack = minTrack + 1;
    }

    points.forEach((point, i) => {
      const i3 = i * 3;

      // Position
      positions[i3] = point.xyz[0];
      positions[i3 + 1] = point.xyz[1];
      positions[i3 + 2] = point.xyz[2];

      // Check if this point is visible in selected image
      const isHighlighted = selectedImagePointIds.has(point.point3DId);

      if (isHighlighted) {
        // Highlight color: magenta
        rgbColors[i3] = 1;
        rgbColors[i3 + 1] = 0;
        rgbColors[i3 + 2] = 1;
        errorColors[i3] = 1;
        errorColors[i3 + 1] = 0;
        errorColors[i3 + 2] = 1;
        trackColors[i3] = 1;
        trackColors[i3 + 1] = 0;
        trackColors[i3 + 2] = 1;
      } else {
        // RGB colors
        rgbColors[i3] = point.rgb[0] / 255;
        rgbColors[i3 + 1] = point.rgb[1] / 255;
        rgbColors[i3 + 2] = point.rgb[2] / 255;

        // Error colormap
        const errorNorm = point.error >= 0
          ? (point.error - minError) / (maxError - minError)
          : 0;
        const ec = jetColormap(errorNorm);
        errorColors[i3] = ec[0];
        errorColors[i3 + 1] = ec[1];
        errorColors[i3 + 2] = ec[2];

        // Track length colormap (blue -> green)
        const trackNorm = (point.track.length - minTrack) / (maxTrack - minTrack);
        trackColors[i3] = 0.1 + trackNorm * 0.1;
        trackColors[i3 + 1] = 0.1 + trackNorm * 0.9;
        trackColors[i3 + 2] = 0.5 - trackNorm * 0.2;
      }
    });

    // Select color array based on mode
    let selectedColors: Float32Array;
    switch (colorMode) {
      case 'error':
        selectedColors = errorColors;
        break;
      case 'trackLength':
        selectedColors = trackColors;
        break;
      default:
        selectedColors = rgbColors;
    }

    return { positions, colors: selectedColors };
  }, [reconstruction, colorMode, minTrackLength, selectedImageId]);

  // Update geometry attributes when data changes
  useEffect(() => {
    if (!geometryRef.current || !positions || !colors) return;

    const geometry = geometryRef.current;

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(colors, 3)
    );

    geometry.computeBoundingSphere();
  }, [positions, colors]);

  if (!positions || !colors) return null;

  return (
    <points matrixAutoUpdate={false}>
      <bufferGeometry ref={geometryRef} />
      <pointsMaterial
        size={pointSize}
        vertexColors
        sizeAttenuation={false}
      />
    </points>
  );
}
