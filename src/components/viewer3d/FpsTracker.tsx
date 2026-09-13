import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  getNextFpsSample,
  FPS_UPDATE_INTERVAL_MS,
  INITIAL_FPS_SAMPLE_STATE,
  type FpsSampleState,
} from './fpsTrackerViewModel';
import { useFpsTrackerStoreFacade } from './useFpsTrackerStoreFacade';

/**
 * Invisible component that tracks FPS and reports to the UI store.
 * Must be placed inside a Canvas component.
 */
export function FpsTracker() {
  const { setFps } = useFpsTrackerStoreFacade();
  const sampleStateRef = useRef<FpsSampleState>(INITIAL_FPS_SAMPLE_STATE);
  const lastPublishedFps = useRef<number | null>(null);

  // Sample elapsed wall time without requesting frames; a settled scene reports 0 FPS.
  useEffect(() => {
    const timer = setInterval(() => {
      const result = getNextFpsSample(sampleStateRef.current, performance.now(), FPS_UPDATE_INTERVAL_MS, false);
      sampleStateRef.current = result.nextState;
      if (result.fps !== null && result.fps !== lastPublishedFps.current) {
        lastPublishedFps.current = result.fps;
        setFps(result.fps);
      }
    }, FPS_UPDATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [setFps]);

  useFrame(() => {
    const result = getNextFpsSample(sampleStateRef.current, performance.now());
    sampleStateRef.current = result.nextState;
    if (result.fps !== null && result.fps !== lastPublishedFps.current) {
      lastPublishedFps.current = result.fps;
      setFps(result.fps);
    }
  });

  return null;
}
