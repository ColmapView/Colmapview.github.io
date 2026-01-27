import { useMemo } from 'react';
import { useCameraStore } from '../../store';
import type {
  CameraMode,
  CameraProjection,
  HorizonLockMode,
  AutoRotateMode,
  CameraViewState,
  NavigationHistoryEntry,
} from '../../store/types';

export interface NavigationNodeActions {
  setMode: (mode: CameraMode) => void;
  setProjection: (projection: CameraProjection) => void;
  setFov: (fov: number) => void;
  setHorizonLock: (mode: HorizonLockMode) => void;
  setAutoRotateMode: (mode: AutoRotateMode) => void;
  setAutoRotateSpeed: (speed: number) => void;
  setFlySpeed: (speed: number) => void;
  setFlyTransitionDuration: (duration: number) => void;
  setPointerLock: (enabled: boolean) => void;
  setAutoFovEnabled: (enabled: boolean) => void;
  flyToImage: (id: number) => void;
  flyToState: (state: CameraViewState) => void;
  clearFlyTo: () => void;
  clearFlyToViewState: () => void;
  setCurrentViewState: (state: CameraViewState) => void;
  pushNavigationHistory: (entry: NavigationHistoryEntry) => void;
  popNavigationHistory: () => NavigationHistoryEntry | undefined;
  peekNavigationHistory: () => NavigationHistoryEntry | undefined;
  clearNavigationHistory: () => void;
}

export function useNavigationNodeActions(): NavigationNodeActions {
  return useMemo(
    () => ({
      setMode: (m) => useCameraStore.getState().setCameraMode(m),
      setProjection: (p) => useCameraStore.getState().setCameraProjection(p),
      setFov: (f) => useCameraStore.getState().setCameraFov(f),
      setHorizonLock: (m) => useCameraStore.getState().setHorizonLock(m),
      setAutoRotateMode: (m) => useCameraStore.getState().setAutoRotateMode(m),
      setAutoRotateSpeed: (s) => useCameraStore.getState().setAutoRotateSpeed(s),
      setFlySpeed: (s) => useCameraStore.getState().setFlySpeed(s),
      setFlyTransitionDuration: (d) => useCameraStore.getState().setFlyTransitionDuration(d),
      setPointerLock: (e) => useCameraStore.getState().setPointerLock(e),
      setAutoFovEnabled: (e) => useCameraStore.getState().setAutoFovEnabled(e),
      flyToImage: (id) => useCameraStore.getState().flyToImage(id),
      flyToState: (s) => useCameraStore.getState().flyToState(s),
      clearFlyTo: () => useCameraStore.getState().clearFlyTo(),
      clearFlyToViewState: () => useCameraStore.getState().clearFlyToViewState(),
      setCurrentViewState: (s) => useCameraStore.getState().setCurrentViewState(s),
      pushNavigationHistory: (e) => useCameraStore.getState().pushNavigationHistory(e),
      popNavigationHistory: () => useCameraStore.getState().popNavigationHistory(),
      peekNavigationHistory: () => useCameraStore.getState().peekNavigationHistory(),
      clearNavigationHistory: () => useCameraStore.getState().clearNavigationHistory(),
    }),
    []
  );
}
