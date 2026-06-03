import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  createOriginGridMaterial,
  getOriginGridScale,
  updateOriginGridScale,
} from './originGridMaterial';

interface OriginGridProps {
  size: number;
  scale?: number;
}

export function OriginGrid({ size, scale = 1 }: OriginGridProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const gridScale = getOriginGridScale(size, scale);

  const material = useMemo(() => createOriginGridMaterial(gridScale), [gridScale]);

  useEffect(() => {
    updateOriginGridScale(material, gridScale);
  }, [material, gridScale]);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[10000, 10000]} />
    </mesh>
  );
}
