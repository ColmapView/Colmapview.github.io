import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useReconstructionStore, useViewerStore } from '../../store';

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

    const points = Array.from(reconstruction.points3D.values())
      .filter(p => p.track.length >= minTrackLength);
    const count = points.length;

    if (count === 0) return { positions: null, colors: null };

    const positions = new Float32Array(count * 3);
    const rgbColors = new Float32Array(count * 3);
    const errorColors = new Float32Array(count * 3);
    const trackColors = new Float32Array(count * 3);

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

    if (minError === maxError) {
      maxError = minError + 1;
    }
    if (minTrack === maxTrack) {
      maxTrack = minTrack + 1;
    }

    const HIGHLIGHT_COLOR: [number, number, number] = [1, 0, 1];

    points.forEach((point, i) => {
      const i3 = i * 3;
      positions[i3] = point.xyz[0];
      positions[i3 + 1] = point.xyz[1];
      positions[i3 + 2] = point.xyz[2];

      const isHighlighted = selectedImagePointIds.has(point.point3DId);

      if (isHighlighted) {
        rgbColors.set(HIGHLIGHT_COLOR, i3);
        errorColors.set(HIGHLIGHT_COLOR, i3);
        trackColors.set(HIGHLIGHT_COLOR, i3);
      } else {
        rgbColors[i3] = point.rgb[0] / 255;
        rgbColors[i3 + 1] = point.rgb[1] / 255;
        rgbColors[i3 + 2] = point.rgb[2] / 255;

        const errorNorm = point.error >= 0 ? (point.error - minError) / (maxError - minError) : 0;
        const ec = jetColormap(errorNorm);
        errorColors.set(ec, i3);

        const trackNorm = (point.track.length - minTrack) / (maxTrack - minTrack);
        trackColors[i3] = 0.1 + trackNorm * 0.1;
        trackColors[i3 + 1] = 0.1 + trackNorm * 0.9;
        trackColors[i3 + 2] = 0.5 - trackNorm * 0.2;
      }
    });

    const colorsByMode: Record<string, Float32Array> = {
      rgb: rgbColors,
      error: errorColors,
      trackLength: trackColors,
    };

    return { positions, colors: colorsByMode[colorMode] ?? rgbColors };
  }, [reconstruction, colorMode, minTrackLength, selectedImageId]);

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
