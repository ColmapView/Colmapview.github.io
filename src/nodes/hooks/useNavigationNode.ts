import { useMemo } from 'react';
import { useCameraStore } from '../../store';
import type { NavigationNode } from '../types';

export function useNavigationNode(): NavigationNode {
  const cameraMode = useCameraStore((s) => s.cameraMode);
  const cameraProjection = useCameraStore((s) => s.cameraProjection);
  const cameraFov = useCameraStore((s) => s.cameraFov);
  const horizonLock = useCameraStore((s) => s.horizonLock);
  const autoRotateMode = useCameraStore((s) => s.autoRotateMode);
  const autoRotateSpeed = useCameraStore((s) => s.autoRotateSpeed);
  const flySpeed = useCameraStore((s) => s.flySpeed);
  const flyTransitionDuration = useCameraStore((s) => s.flyTransitionDuration);
  const pointerLock = useCameraStore((s) => s.pointerLock);
  const autoFovEnabled = useCameraStore((s) => s.autoFovEnabled);
  const flyToImageId = useCameraStore((s) => s.flyToImageId);
  const flyToViewState = useCameraStore((s) => s.flyToViewState);
  const currentViewState = useCameraStore((s) => s.currentViewState);
  const navigationHistory = useCameraStore((s) => s.navigationHistory);

  return useMemo<NavigationNode>(
    () => ({
      nodeType: 'navigation',
      mode: cameraMode,
      projection: cameraProjection,
      fov: cameraFov,
      horizonLock,
      autoRotateMode,
      autoRotateSpeed,
      flySpeed,
      flyTransitionDuration,
      pointerLock,
      autoFovEnabled,
      flyToImageId,
      flyToViewState,
      currentViewState,
      navigationHistory,
    }),
    [
      cameraMode,
      cameraProjection,
      cameraFov,
      horizonLock,
      autoRotateMode,
      autoRotateSpeed,
      flySpeed,
      flyTransitionDuration,
      pointerLock,
      autoFovEnabled,
      flyToImageId,
      flyToViewState,
      currentViewState,
      navigationHistory,
    ]
  );
}
