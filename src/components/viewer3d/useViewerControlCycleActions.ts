import { useCallback } from 'react';
import type {
  CameraDisplayMode,
  CameraMode,
  CameraProjection,
  ColorMode,
  MatchesDisplayMode,
  RigDisplayMode,
  SelectionColorMode,
} from '../../store/types';
import type { ViewDirection } from '../../store';
import {
  getNextAxesGridState,
  getNextCameraDisplayState,
  getNextMatchesDisplayState,
  getNextPointColorState,
  getNextRigDisplayState,
  getNextSelectionColorState,
  getToggledBackgroundHsl,
  type AxesGridState,
  type HslColor,
  type VisibleModeState,
} from './viewerControlsViewModel';

type Setter<T> = (value: T) => void;

export function applyVisibleModeState<TMode>({
  current,
  next,
  setVisible,
  setMode,
}: {
  current: VisibleModeState<TMode>;
  next: VisibleModeState<TMode>;
  setVisible: Setter<boolean>;
  setMode: Setter<TMode>;
}): void {
  if (next.visible !== current.visible) setVisible(next.visible);
  if (next.mode !== current.mode) setMode(next.mode);
}

export function applyAxesGridState({
  current,
  next,
  setShowAxes,
  setShowGrid,
}: {
  current: AxesGridState;
  next: AxesGridState;
  setShowAxes: Setter<boolean>;
  setShowGrid: Setter<boolean>;
}): void {
  if (next.showAxes !== current.showAxes) setShowAxes(next.showAxes);
  if (next.showGrid !== current.showGrid) setShowGrid(next.showGrid);
}

interface ViewerControlCycleActionsOptions {
  backgroundHsl: HslColor;
  setBackgroundHsl: Setter<HslColor>;
  cameraMode: CameraMode;
  setCameraMode: Setter<CameraMode>;
  undistortionEnabled: boolean;
  setUndistortionEnabled: Setter<boolean>;
  showPointCloud: boolean;
  colorMode: ColorMode;
  setShowPointCloud: Setter<boolean>;
  setColorMode: Setter<ColorMode>;
  showCameras: boolean;
  cameraDisplayMode: CameraDisplayMode;
  setShowCameras: Setter<boolean>;
  setCameraDisplayMode: Setter<CameraDisplayMode>;
  showMatches: boolean;
  matchesDisplayMode: MatchesDisplayMode;
  setShowMatches: Setter<boolean>;
  setMatchesDisplayMode: Setter<MatchesDisplayMode>;
  showSelectionHighlight: boolean;
  selectionColorMode: SelectionColorMode;
  setShowSelectionHighlight: Setter<boolean>;
  setSelectionColorMode: Setter<SelectionColorMode>;
  showRig: boolean;
  rigDisplayMode: RigDisplayMode;
  setShowRig: Setter<boolean>;
  setRigDisplayMode: Setter<RigDisplayMode>;
  setView: Setter<ViewDirection>;
  setCameraProjection: Setter<CameraProjection>;
  showAxes: boolean;
  showGrid: boolean;
  setShowAxes: Setter<boolean>;
  setShowGrid: Setter<boolean>;
}

export function useViewerControlCycleActions({
  backgroundHsl,
  setBackgroundHsl,
  cameraMode,
  setCameraMode,
  undistortionEnabled,
  setUndistortionEnabled,
  showPointCloud,
  colorMode,
  setShowPointCloud,
  setColorMode,
  showCameras,
  cameraDisplayMode,
  setShowCameras,
  setCameraDisplayMode,
  showMatches,
  matchesDisplayMode,
  setShowMatches,
  setMatchesDisplayMode,
  showSelectionHighlight,
  selectionColorMode,
  setShowSelectionHighlight,
  setSelectionColorMode,
  showRig,
  rigDisplayMode,
  setShowRig,
  setRigDisplayMode,
  setView,
  setCameraProjection,
  showAxes,
  showGrid,
  setShowAxes,
  setShowGrid,
}: ViewerControlCycleActionsOptions) {
  const toggleBackground = useCallback(() => {
    setBackgroundHsl(getToggledBackgroundHsl(backgroundHsl));
  }, [backgroundHsl, setBackgroundHsl]);

  const toggleCameraMode = useCallback(() => {
    setCameraMode(cameraMode === 'orbit' ? 'fly' : 'orbit');
  }, [cameraMode, setCameraMode]);

  const toggleUndistortion = useCallback(() => {
    setUndistortionEnabled(!undistortionEnabled);
  }, [setUndistortionEnabled, undistortionEnabled]);

  const cycleColorMode = useCallback(() => {
    applyVisibleModeState({
      current: { visible: showPointCloud, mode: colorMode },
      next: getNextPointColorState(showPointCloud, colorMode),
      setVisible: setShowPointCloud,
      setMode: setColorMode,
    });
  }, [colorMode, setColorMode, setShowPointCloud, showPointCloud]);

  const cycleCameraDisplayMode = useCallback(() => {
    applyVisibleModeState({
      current: { visible: showCameras, mode: cameraDisplayMode },
      next: getNextCameraDisplayState(showCameras, cameraDisplayMode),
      setVisible: setShowCameras,
      setMode: setCameraDisplayMode,
    });
  }, [cameraDisplayMode, setCameraDisplayMode, setShowCameras, showCameras]);

  const cycleMatchesDisplayMode = useCallback(() => {
    applyVisibleModeState({
      current: { visible: showMatches, mode: matchesDisplayMode },
      next: getNextMatchesDisplayState(showMatches, matchesDisplayMode),
      setVisible: setShowMatches,
      setMode: setMatchesDisplayMode,
    });
  }, [matchesDisplayMode, setMatchesDisplayMode, setShowMatches, showMatches]);

  const cycleSelectionColorMode = useCallback(() => {
    applyVisibleModeState({
      current: { visible: showSelectionHighlight, mode: selectionColorMode },
      next: getNextSelectionColorState(showSelectionHighlight, selectionColorMode),
      setVisible: setShowSelectionHighlight,
      setMode: setSelectionColorMode,
    });
  }, [selectionColorMode, setSelectionColorMode, setShowSelectionHighlight, showSelectionHighlight]);

  const cycleRigDisplayMode = useCallback(() => {
    applyVisibleModeState({
      current: { visible: showRig, mode: rigDisplayMode },
      next: getNextRigDisplayState(showRig, rigDisplayMode),
      setVisible: setShowRig,
      setMode: setRigDisplayMode,
    });
  }, [rigDisplayMode, setRigDisplayMode, setShowRig, showRig]);

  const handleResetView = useCallback(() => {
    setView('reset');
    setCameraProjection('perspective');
  }, [setCameraProjection, setView]);

  const cycleAxesGrid = useCallback(() => {
    applyAxesGridState({
      current: { showAxes, showGrid },
      next: getNextAxesGridState(showAxes, showGrid),
      setShowAxes,
      setShowGrid,
    });
  }, [setShowAxes, setShowGrid, showAxes, showGrid]);

  return {
    toggleBackground,
    toggleCameraMode,
    toggleUndistortion,
    cycleColorMode,
    cycleCameraDisplayMode,
    cycleMatchesDisplayMode,
    cycleSelectionColorMode,
    cycleRigDisplayMode,
    handleResetView,
    cycleAxesGrid,
  };
}
