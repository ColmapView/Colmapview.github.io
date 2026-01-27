import { useMemo } from 'react';
import { useCameraStore } from '../../store';
import type {
  CameraDisplayMode,
  FrustumColorMode,
  CameraScaleFactor,
  UndistortionMode,
} from '../../store/types';

export interface CamerasNodeActions {
  setVisible: (visible: boolean) => void;
  setDisplayMode: (mode: CameraDisplayMode) => void;
  setScale: (scale: number) => void;
  setScaleFactor: (factor: CameraScaleFactor) => void;
  setColorMode: (mode: FrustumColorMode) => void;
  setSingleColor: (color: string) => void;
  setStandbyOpacity: (opacity: number) => void;
  setUndistortionEnabled: (enabled: boolean) => void;
  setUndistortionMode: (mode: UndistortionMode) => void;
  toggleVisible: () => void;
}

export function useCamerasNodeActions(): CamerasNodeActions {
  return useMemo(
    () => ({
      setVisible: (v) => useCameraStore.getState().setShowCameras(v),
      setDisplayMode: (m) => useCameraStore.getState().setCameraDisplayMode(m),
      setScale: (s) => useCameraStore.getState().setCameraScale(s),
      setScaleFactor: (f) => useCameraStore.getState().setCameraScaleFactor(f),
      setColorMode: (m) => useCameraStore.getState().setFrustumColorMode(m),
      setSingleColor: (c) => useCameraStore.getState().setFrustumSingleColor(c),
      setStandbyOpacity: (o) => useCameraStore.getState().setFrustumStandbyOpacity(o),
      setUndistortionEnabled: (e) => useCameraStore.getState().setUndistortionEnabled(e),
      setUndistortionMode: (m) => useCameraStore.getState().setUndistortionMode(m),
      toggleVisible: () => useCameraStore.getState().toggleCameras(),
    }),
    []
  );
}
