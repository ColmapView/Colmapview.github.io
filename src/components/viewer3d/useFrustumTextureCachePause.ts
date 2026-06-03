import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  pauseFrustumTextureCache,
  resumeFrustumTextureCache,
} from '../../hooks/useFrustumTexture';
import { TIMING } from '../../theme';

export function hasCameraPoseMoved(
  lastPosition: THREE.Vector3,
  lastQuaternion: THREE.Quaternion,
  currentPosition: THREE.Vector3,
  currentQuaternion: THREE.Quaternion,
  positionThresholdSq: number = 0.0001,
  quaternionThreshold: number = 0.001
): boolean {
  return (
    lastPosition.distanceToSquared(currentPosition) > positionThresholdSq ||
    lastQuaternion.angleTo(currentQuaternion) > quaternionThreshold
  );
}

export function shouldResumeFrustumTextureCache(
  isMoving: boolean,
  now: number,
  lastMoveTime: number,
  debounceMs: number = TIMING.transitionBase
): boolean {
  return isMoving && now - lastMoveTime > debounceMs;
}

export interface FrustumTextureCachePauseOptions {
  camera: THREE.Camera;
  canvas?: HTMLCanvasElement | null;
  debounceMs?: number;
}

export function useFrustumTextureCachePause({
  camera,
  canvas,
  debounceMs = TIMING.transitionBase,
}: FrustumTextureCachePauseOptions): () => void {
  const lastCameraPosRef = useRef(new THREE.Vector3());
  const lastCameraQuatRef = useRef(new THREE.Quaternion());
  const lastMoveTimeRef = useRef(0);
  const isCameraMovingRef = useRef(false);
  const pendingHoverRefreshRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useFrame(() => {
    const now = performance.now();
    const moved = hasCameraPoseMoved(
      lastCameraPosRef.current,
      lastCameraQuatRef.current,
      camera.position,
      camera.quaternion
    );

    if (moved) {
      lastCameraPosRef.current.copy(camera.position);
      lastCameraQuatRef.current.copy(camera.quaternion);
      lastMoveTimeRef.current = now;
      if (!isCameraMovingRef.current) {
        isCameraMovingRef.current = true;
        pauseFrustumTextureCache();
      }
      return;
    }

    if (!shouldResumeFrustumTextureCache(isCameraMovingRef.current, now, lastMoveTimeRef.current, debounceMs)) {
      return;
    }

    isCameraMovingRef.current = false;
    resumeFrustumTextureCache();

    if (pendingHoverRefreshRef.current && lastMousePosRef.current && canvas) {
      pendingHoverRefreshRef.current = false;
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        clientX: lastMousePosRef.current.x,
        clientY: lastMousePosRef.current.y,
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
        pointerId: 1,
      }));
    }
  });

  return useCallback(() => {
    pendingHoverRefreshRef.current = true;
  }, []);
}
