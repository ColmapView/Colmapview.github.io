import { useMemo } from 'react';
import { useCameraStore } from '../../store';
import type { CamerasNode } from '../types';

export function useCamerasNode(): CamerasNode {
  const showCameras = useCameraStore((s) => s.showCameras);
  const cameraDisplayMode = useCameraStore((s) => s.cameraDisplayMode);
  const cameraScale = useCameraStore((s) => s.cameraScale);
  const cameraScaleFactor = useCameraStore((s) => s.cameraScaleFactor);
  const frustumColorMode = useCameraStore((s) => s.frustumColorMode);
  const frustumSingleColor = useCameraStore((s) => s.frustumSingleColor);
  const frustumStandbyOpacity = useCameraStore((s) => s.frustumStandbyOpacity);
  const undistortionEnabled = useCameraStore((s) => s.undistortionEnabled);
  const undistortionMode = useCameraStore((s) => s.undistortionMode);

  return useMemo<CamerasNode>(
    () => ({
      nodeType: 'cameras',
      visible: showCameras,
      displayMode: cameraDisplayMode,
      scale: cameraScale,
      scaleFactor: cameraScaleFactor,
      colorMode: frustumColorMode,
      singleColor: frustumSingleColor,
      standbyOpacity: frustumStandbyOpacity,
      undistortionEnabled,
      undistortionMode,
    }),
    [
      showCameras,
      cameraDisplayMode,
      cameraScale,
      cameraScaleFactor,
      frustumColorMode,
      frustumSingleColor,
      frustumStandbyOpacity,
      undistortionEnabled,
      undistortionMode,
    ]
  );
}
