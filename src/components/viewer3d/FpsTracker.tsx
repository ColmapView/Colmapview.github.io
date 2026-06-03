import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  getNextFpsSample,
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

  useFrame(() => {
    const result = getNextFpsSample(sampleStateRef.current, performance.now());
    sampleStateRef.current = result.nextState;
    if (result.fps !== null) {
      setFps(result.fps);
    }
  });

  return null;
}
