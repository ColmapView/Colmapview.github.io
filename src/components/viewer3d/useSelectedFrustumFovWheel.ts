import { useEffect, type MutableRefObject } from 'react';
import { getWheelAdjustedFov } from './cameraFrustumViewModel';

interface FrustumWheelControls {
  wheelHandled?: MutableRefObject<boolean>;
}

interface SelectedFrustumFovWheelOptions {
  enabled: boolean;
  cameraProjection: string;
  cameraFov: number;
  setCameraFov: (fov: number) => void;
  controls?: FrustumWheelControls;
}

export function useSelectedFrustumFovWheel({
  enabled,
  cameraProjection,
  cameraFov,
  setCameraFov,
  controls,
}: SelectedFrustumFovWheelOptions): void {
  useEffect(() => {
    if (!enabled || cameraProjection !== 'perspective') return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (controls?.wheelHandled) {
        controls.wheelHandled.current = true;
      }
      setCameraFov(getWheelAdjustedFov(cameraFov, e.deltaY));
    };

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [enabled, cameraProjection, cameraFov, setCameraFov, controls]);
}
