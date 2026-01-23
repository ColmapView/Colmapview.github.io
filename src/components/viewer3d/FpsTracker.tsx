import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useUIStore } from '../../store';

/**
 * Invisible component that tracks FPS and reports to the UI store.
 * Must be placed inside a Canvas component.
 */
export function FpsTracker() {
  const setFps = useUIStore((s) => s.setFps);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useFrame(() => {
    framesRef.current++;
    const now = performance.now();
    const elapsed = now - lastTimeRef.current;

    // Update FPS every 500ms to avoid too frequent store updates
    if (elapsed >= 500) {
      const fps = Math.round((framesRef.current / elapsed) * 1000);
      setFps(fps);
      framesRef.current = 0;
      lastTimeRef.current = now;
    }
  });

  return null;
}
