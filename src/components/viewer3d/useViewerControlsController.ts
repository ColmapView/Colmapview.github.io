import { useCallback, useEffect, useMemo, useRef } from 'react';
import { controlPanelStyles } from '../../theme';
import { isSplatColorMode, type ColorMode } from '../../store/types';
import type {
  AxesGridPanelProps,
  BackgroundPanelProps,
  CameraDisplayPanelProps,
  CameraModePanelProps,
  ExportPanelProps,
  GalleryToggleButtonProps,
  MatchesPanelProps,
  PointCloudPanelProps,
  RigPanelProps,
  ScreenshotPanelProps,
  SelectionHighlightPanelProps,
  SettingsPanelProps,
  SharePanelProps,
  TransformPanelProps,
  ViewPanelProps,
} from './panels';
import { useViewerControlPanelState } from './useViewerControlPanelState';
import { useSyncedHslColor } from './useSyncedHslColor';
import { useViewerControlCycleActions } from './useViewerControlCycleActions';
import { useViewerControlHotkeys } from './useViewerControlHotkeys';
import type { ViewerToolModalsProps } from './ViewerToolModals';
import { useViewerToolModalState } from './useViewerToolModalState';
import { useViewerControlsStoreFacade } from './useViewerControlsStoreFacade';
import {
  buildRigInfo,
  getMatchesButtonState,
  getRigButtonState,
  getSelectionButtonState,
} from './viewerControlsViewModel';
import { getViewerControlsContainerClassName } from './viewerControlsLayoutPolicy';

export interface ViewerControlsController {
  className: string;
  viewPanel: ViewPanelProps;
  axesGridPanel: AxesGridPanelProps;
  cameraModePanel: CameraModePanelProps;
  backgroundPanel: BackgroundPanelProps;
  transformPanel: TransformPanelProps;
  pointCloudPanel: PointCloudPanelProps;
  cameraDisplayPanel: CameraDisplayPanelProps;
  matchesPanel: MatchesPanelProps;
  selectionHighlightPanel: SelectionHighlightPanelProps;
  rigPanel: RigPanelProps;
  screenshotPanel: ScreenshotPanelProps;
  sharePanel: SharePanelProps;
  exportPanel: ExportPanelProps;
  settingsPanel: SettingsPanelProps;
  galleryToggleButton: GalleryToggleButtonProps;
  modals: ViewerToolModalsProps;
}

const styles = controlPanelStyles;

export function useViewerControlsController(): ViewerControlsController {
  const panelState = useViewerControlPanelState();
  const modals = useViewerToolModalState();
  const { ui, nodes, actions, metrics, splats, reconstruction } = useViewerControlsStoreFacade();
  const {
    touchMode,
    backgroundColor,
    setBackgroundColor,
    setView,
    autoHideButtons,
  } = ui;
  const {
    points: pointsNode,
    cameras: camerasNode,
    selection: selectionNode,
    navigation: navNode,
    matches: matchesNode,
    axes: axesNode,
    grid: gridNode,
    rig: rigNode,
  } = nodes;
  const {
    points: pointsActions,
    cameras: camerasActions,
    selection: selectionActions,
    navigation: navActions,
    matches: matchesActions,
    axes: axesActions,
    grid: gridActions,
    rig: rigActions,
  } = actions;

  const rigInfo = useMemo(() => buildRigInfo(reconstruction), [reconstruction]);
  const { hasRigData, cameraCount, frameCount } = rigInfo;
  const initialSplatCameraColorDefaultFileRef = useRef<File | null>(null);

  const {
    hsl,
    setHslColor,
    handleColorPickerChange,
    handleHueChange,
    handleSaturationChange,
    handleLightnessChange,
  } = useSyncedHslColor(backgroundColor, setBackgroundColor);

  const {
    hsl: frustumHsl,
    handleColorPickerChange: handleFrustumColorPickerChange,
    handleHueChange: handleFrustumHueChange,
    handleSaturationChange: handleFrustumSaturationChange,
    handleLightnessChange: handleFrustumLightnessChange,
  } = useSyncedHslColor(camerasNode.singleColor, camerasActions.setSingleColor);

  const requestSplatCameraColorDefault = useCallback(() => {
    camerasActions.setColorMode('splatPsnr');
  }, [camerasActions]);

  const requestDefaultSplatCameraColor = useCallback((nextColorMode: ColorMode) => {
    if (
      !isSplatColorMode(nextColorMode) ||
      isSplatColorMode(pointsNode.colorMode) ||
      !splats.activeSplatFile
    ) {
      return;
    }

    requestSplatCameraColorDefault();
  }, [
    pointsNode.colorMode,
    requestSplatCameraColorDefault,
    splats.activeSplatFile,
  ]);

  const setPointColorMode = useCallback((nextColorMode: ColorMode) => {
    pointsActions.setColorMode(nextColorMode);
    requestDefaultSplatCameraColor(nextColorMode);
  }, [pointsActions, requestDefaultSplatCameraColor]);

  const {
    toggleBackground,
    toggleCameraMode,
    toggleUndistortion,
    cycleColorMode,
    cycleCameraDisplayMode,
    cycleMatchesDisplayMode,
    cycleHorizonLock,
    cycleSelectionColorMode,
    cycleRigDisplayMode,
    handleResetView,
    cycleAxesGrid,
  } = useViewerControlCycleActions({
    backgroundHsl: hsl,
    setBackgroundHsl: setHslColor,
    cameraMode: navNode.mode,
    setCameraMode: navActions.setMode,
    horizonLock: navNode.horizonLock,
    setHorizonLock: navActions.setHorizonLock,
    undistortionEnabled: camerasNode.undistortionEnabled,
    setUndistortionEnabled: camerasActions.setUndistortionEnabled,
    showPointCloud: pointsNode.visible,
    colorMode: pointsNode.colorMode,
    setShowPointCloud: pointsActions.setVisible,
    setColorMode: setPointColorMode,
    showCameras: camerasNode.visible,
    cameraDisplayMode: camerasNode.displayMode,
    setShowCameras: camerasActions.setVisible,
    setCameraDisplayMode: camerasActions.setDisplayMode,
    showMatches: matchesNode.visible,
    matchesDisplayMode: matchesNode.displayMode,
    setShowMatches: matchesActions.setVisible,
    setMatchesDisplayMode: matchesActions.setDisplayMode,
    showSelectionHighlight: selectionNode.visible,
    selectionColorMode: selectionNode.colorMode,
    setShowSelectionHighlight: selectionActions.setVisible,
    setSelectionColorMode: selectionActions.setColorMode,
    showRig: rigNode.visible,
    rigDisplayMode: rigNode.displayMode,
    setShowRig: rigActions.setVisible,
    setRigDisplayMode: rigActions.setDisplayMode,
    setView,
    setCameraProjection: navActions.setProjection,
    showAxes: axesNode.visible,
    showGrid: gridNode.visible,
    setShowAxes: axesActions.setVisible,
    setShowGrid: gridActions.setVisible,
  });

  useViewerControlHotkeys({
    handleResetView,
    setView,
    cycleAxesGrid,
    toggleCameraMode,
    toggleBackground,
    cycleColorMode,
    cycleCameraDisplayMode,
    cycleMatchesDisplayMode,
    cycleHorizonLock,
    toggleUndistortion,
  });

  const matchesButton = getMatchesButtonState(matchesNode.visible, matchesNode.displayMode);
  const selectionButton = getSelectionButtonState(selectionNode.visible, selectionNode.colorMode);
  const rigButton = getRigButtonState(hasRigData, rigNode.visible, rigNode.displayMode);

  useEffect(() => {
    const activeSplatFile = splats.activeSplatFile ?? null;
    if (!activeSplatFile || !isSplatColorMode(pointsNode.colorMode)) {
      initialSplatCameraColorDefaultFileRef.current = null;
      return;
    }

    if (
      initialSplatCameraColorDefaultFileRef.current === activeSplatFile ||
      camerasNode.colorMode === 'splatPsnr' ||
      camerasNode.colorMode === 'splatSsim'
    ) {
      return;
    }

    initialSplatCameraColorDefaultFileRef.current = activeSplatFile;
    requestSplatCameraColorDefault();
  }, [
    camerasNode.colorMode,
    pointsNode.colorMode,
    requestSplatCameraColorDefault,
    splats.activeSplatFile,
  ]);

  useEffect(() => {
    const activeSplatFile = splats.activeSplatFile ?? null;
    if (
      !activeSplatFile &&
      (camerasNode.colorMode === 'splatPsnr' || camerasNode.colorMode === 'splatSsim')
    ) {
      camerasActions.setColorMode('byCamera');
    }
  }, [
    camerasActions,
    camerasNode.colorMode,
    splats.activeSplatFile,
  ]);

  return {
    className: getViewerControlsContainerClassName({
      baseClassName: styles.container,
      autoHideButtons,
      touchMode,
    }),
    viewPanel: {
      ...panelState,
      cameraProjection: navNode.projection,
      setCameraProjection: navActions.setProjection,
      cameraFov: navNode.fov,
      setCameraFov: navActions.setFov,
      setView,
      onResetView: handleResetView,
    },
    axesGridPanel: {
      ...panelState,
      showAxes: axesNode.visible,
      showGrid: gridNode.visible,
      toggleAxes: axesActions.toggleVisible,
      toggleGrid: gridActions.toggleVisible,
      axesCoordinateSystem: axesNode.coordinateSystem,
      setAxesCoordinateSystem: axesActions.setCoordinateSystem,
      axisLabelMode: axesNode.labelMode,
      setAxisLabelMode: axesActions.setLabelMode,
      axesScale: axesNode.scale,
      setAxesScale: axesActions.setScale,
      gridScale: gridNode.scale,
      setGridScale: gridActions.setScale,
      onCycleAxesGrid: cycleAxesGrid,
    },
    cameraModePanel: {
      ...panelState,
      cameraMode: navNode.mode,
      setCameraMode: navActions.setMode,
      flySpeed: navNode.flySpeed,
      setFlySpeed: navActions.setFlySpeed,
      flyTransitionDuration: navNode.flyTransitionDuration,
      setFlyTransitionDuration: navActions.setFlyTransitionDuration,
      pointerLock: navNode.pointerLock,
      setPointerLock: navActions.setPointerLock,
      horizonLock: navNode.horizonLock,
      setHorizonLock: navActions.setHorizonLock,
      autoRotateMode: navNode.autoRotateMode,
      setAutoRotateMode: navActions.setAutoRotateMode,
      autoRotateSpeed: navNode.autoRotateSpeed,
      setAutoRotateSpeed: navActions.setAutoRotateSpeed,
      onToggleCameraMode: toggleCameraMode,
    },
    backgroundPanel: {
      ...panelState,
      backgroundColor,
      hsl,
      onToggleBackground: toggleBackground,
      onColorPickerChange: handleColorPickerChange,
      onHueChange: handleHueChange,
      onSaturationChange: handleSaturationChange,
      onLightnessChange: handleLightnessChange,
    },
    transformPanel: {
      ...panelState,
      onOpenFloorModal: () => modals.setShowFloorModal(true),
    },
    pointCloudPanel: {
      ...panelState,
      showPointCloud: pointsNode.visible,
      togglePointCloud: pointsActions.toggleVisible,
      colorMode: pointsNode.colorMode,
      setColorMode: setPointColorMode,
      pointSize: pointsNode.size,
      setPointSize: pointsActions.setSize,
      pointOpacity: pointsNode.opacity,
      setPointOpacity: pointsActions.setOpacity,
      minTrackLength: pointsNode.minTrackLength,
      setMinTrackLength: pointsActions.setMinTrackLength,
      thinning: pointsNode.thinning,
      setThinning: pointsActions.setThinning,
      maxReprojectionError: pointsNode.maxReprojectionError,
      setMaxReprojectionError: pointsActions.setMaxReprojectionError,
      reconstruction,
      splatFiles: splats.splatFiles,
      activeSplatFile: splats.activeSplatFile,
      setActiveSplatFile: splats.setActiveSplatFile,
      selectionColor: selectionNode.color,
      setSelectionColor: selectionActions.setColor,
      selectionAnimationSpeed: selectionNode.animationSpeed,
      setSelectionAnimationSpeed: selectionActions.setAnimationSpeed,
      onCycleColorMode: cycleColorMode,
    },
    cameraDisplayPanel: {
      ...panelState,
      showCameras: camerasNode.visible,
      setShowCameras: camerasActions.setVisible,
      cameraDisplayMode: camerasNode.displayMode,
      setCameraDisplayMode: camerasActions.setDisplayMode,
      frustumColorMode: camerasNode.colorMode,
      setFrustumColorMode: camerasActions.setColorMode,
      hasRigData,
      frustumSingleColor: camerasNode.singleColor,
      onFrustumColorPickerChange: handleFrustumColorPickerChange,
      frustumHsl,
      onFrustumHueChange: handleFrustumHueChange,
      onFrustumSaturationChange: handleFrustumSaturationChange,
      onFrustumLightnessChange: handleFrustumLightnessChange,
      cameraScaleFactor: camerasNode.scaleFactor,
      setCameraScaleFactor: camerasActions.setScaleFactor,
      cameraScale: camerasNode.scale,
      setCameraScale: camerasActions.setScale,
      frustumStandbyOpacity: camerasNode.standbyOpacity,
      setFrustumStandbyOpacity: camerasActions.setStandbyOpacity,
      frustumLineWidth: camerasNode.lineWidth,
      setFrustumLineWidth: camerasActions.setLineWidth,
      selectionPlaneOpacity: selectionNode.planeOpacity,
      setSelectionPlaneOpacity: selectionActions.setPlaneOpacity,
      unselectedCameraOpacity: selectionNode.unselectedOpacity,
      setUnselectedCameraOpacity: selectionActions.setUnselectedOpacity,
      undistortionEnabled: camerasNode.undistortionEnabled,
      setUndistortionEnabled: camerasActions.setUndistortionEnabled,
      autoFovEnabled: navNode.autoFovEnabled,
      setAutoFovEnabled: navActions.setAutoFovEnabled,
      hasActiveSplat: Boolean(splats.activeSplatFile),
      splatPsnrFrameReady: metrics.splatPsnrFrameReady,
      onCycleCameraDisplayMode: cycleCameraDisplayMode,
    },
    matchesPanel: {
      ...panelState,
      button: matchesButton,
      showMatches: matchesNode.visible,
      setShowMatches: matchesActions.setVisible,
      matchesDisplayMode: matchesNode.displayMode,
      setMatchesDisplayMode: matchesActions.setDisplayMode,
      matchesOpacity: matchesNode.opacity,
      setMatchesOpacity: matchesActions.setOpacity,
      matchesColor: matchesNode.color,
      setMatchesColor: matchesActions.setColor,
      matchesLineWidth: matchesNode.lineWidth,
      setMatchesLineWidth: matchesActions.setLineWidth,
      onCycleMatchesDisplayMode: cycleMatchesDisplayMode,
    },
    selectionHighlightPanel: {
      ...panelState,
      button: selectionButton,
      showSelectionHighlight: selectionNode.visible,
      setShowSelectionHighlight: selectionActions.setVisible,
      selectionColorMode: selectionNode.colorMode,
      setSelectionColorMode: selectionActions.setColorMode,
      selectionColor: selectionNode.color,
      setSelectionColor: selectionActions.setColor,
      selectionAnimationSpeed: selectionNode.animationSpeed,
      setSelectionAnimationSpeed: selectionActions.setAnimationSpeed,
      onCycleSelectionColorMode: cycleSelectionColorMode,
    },
    rigPanel: {
      ...panelState,
      button: rigButton,
      hasRigData,
      showRig: rigNode.visible,
      setShowRig: rigActions.setVisible,
      rigDisplayMode: rigNode.displayMode,
      setRigDisplayMode: rigActions.setDisplayMode,
      rigColorMode: rigNode.colorMode,
      setRigColorMode: rigActions.setColorMode,
      rigLineColor: rigNode.color,
      setRigLineColor: rigActions.setColor,
      rigLineOpacity: rigNode.opacity,
      setRigLineOpacity: rigActions.setOpacity,
      rigLineWidth: rigNode.lineWidth,
      setRigLineWidth: rigActions.setLineWidth,
      cameraCount,
      frameCount,
      onCycleRigDisplayMode: cycleRigDisplayMode,
    },
    screenshotPanel: panelState,
    sharePanel: panelState,
    exportPanel: {
      ...panelState,
      onOpenDeletionModal: () => modals.setShowDeletionModal(true),
      onOpenConversionModal: () => modals.setShowConversionModal(true),
    },
    settingsPanel: panelState,
    galleryToggleButton: panelState,
    modals,
  };
}
