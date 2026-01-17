import { useMemo } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { usePointPickingStore } from '../../store';

// Colors for markers: P1=red, P2=green, P3=blue
const MARKER_COLORS = [0xff4444, 0x44ff44, 0x4444ff];
const MARKER_SIZE = 0.02; // Relative to scene

export function SelectedPointMarkers() {
  const selectedPoints = usePointPickingStore((s) => s.selectedPoints);
  const pickingMode = usePointPickingStore((s) => s.pickingMode);

  // Compute marker size based on bounding box of selected points
  const markerSize = useMemo(() => {
    if (selectedPoints.length < 2) return MARKER_SIZE;

    // Use distance between first two points to scale markers
    const dist = selectedPoints[0].position.distanceTo(selectedPoints[1].position);
    return Math.max(MARKER_SIZE, dist * 0.03);
  }, [selectedPoints]);

  // Compute triangle normal for 3-point mode visualization
  const normalArrow = useMemo(() => {
    if (pickingMode !== 'normal-3pt' || selectedPoints.length !== 3) return null;

    const p1 = selectedPoints[0].position;
    const p2 = selectedPoints[1].position;
    const p3 = selectedPoints[2].position;

    const v1 = new THREE.Vector3().subVectors(p2, p1);
    const v2 = new THREE.Vector3().subVectors(p3, p1);
    const normal = new THREE.Vector3().crossVectors(v1, v2);

    if (normal.lengthSq() < 1e-10) return null;

    normal.normalize();

    // Centroid of triangle
    const centroid = new THREE.Vector3()
      .add(p1)
      .add(p2)
      .add(p3)
      .divideScalar(3);

    // Arrow length based on triangle size
    const size = Math.max(v1.length(), v2.length()) * 0.5;
    const arrowEnd = centroid.clone().add(normal.clone().multiplyScalar(size));

    return { start: centroid, end: arrowEnd };
  }, [selectedPoints, pickingMode]);

  if (selectedPoints.length === 0) return null;

  // Build line points for connecting selected points
  const linePoints = selectedPoints.map(p => p.position);

  // For 3-point mode, close the triangle
  const trianglePoints = pickingMode === 'normal-3pt' && selectedPoints.length === 3
    ? [...linePoints, linePoints[0]]
    : linePoints;

  return (
    <group>
      {/* Marker spheres at each selected point */}
      {selectedPoints.map((point, index) => (
        <group key={index} position={point.position}>
          {/* Sphere marker */}
          <mesh>
            <sphereGeometry args={[markerSize, 16, 16]} />
            <meshBasicMaterial
              color={MARKER_COLORS[index]}
              transparent
              opacity={0.9}
              depthTest={false}
            />
          </mesh>
          {/* Label */}
          <Html
            center
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            position={[0, markerSize * 2, 0]}
          >
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.75)',
                color: '#ffffff',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
              }}
            >
              P{index + 1}
            </div>
          </Html>
        </group>
      ))}

      {/* Line connecting points */}
      {selectedPoints.length >= 2 && (
        <Line
          points={trianglePoints}
          color="#ffff00"
          lineWidth={2}
          transparent
          opacity={0.8}
          depthTest={false}
        />
      )}

      {/* Normal arrow for 3-point mode */}
      {normalArrow && (
        <Line
          points={[normalArrow.start, normalArrow.end]}
          color="#00ffff"
          lineWidth={3}
          transparent
          opacity={0.9}
          depthTest={false}
        />
      )}
    </group>
  );
}
