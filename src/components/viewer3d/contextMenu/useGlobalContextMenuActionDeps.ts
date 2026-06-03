import { useMemo } from 'react';
import {
  usePointsNode,
  useCamerasNode,
  useSelectionNode,
  useNavigationNode,
  useMatchesNode,
  useAxesNode,
  usePointsNodeActions,
  useCamerasNodeActions,
  useSelectionNodeActions,
  useNavigationNodeActions,
  useMatchesNodeActions,
  useAxesNodeActions,
  useGizmoNodeActions,
} from '../../../nodes';
import { CANVAS_COLORS } from '../../../theme';
import type { GlobalContextMenuActionExecutorDeps } from './globalContextMenuActionExecutor';
import { useGlobalContextMenuActionStoreFacade } from './useGlobalContextMenuActionStoreFacade';

interface GlobalContextMenuActionDepsOptions {
  openEditPopup: () => void;
}

export function useGlobalContextMenuActionDeps({
  openEditPopup,
}: GlobalContextMenuActionDepsOptions): GlobalContextMenuActionExecutorDeps {
  const pointsNode = usePointsNode();
  const camerasNode = useCamerasNode();
  const selectionNode = useSelectionNode();
  const navNode = useNavigationNode();
  const matchesNode = useMatchesNode();
  const axesNode = useAxesNode();

  const pointsActions = usePointsNodeActions();
  const camerasActions = useCamerasNodeActions();
  const selectionActions = useSelectionNodeActions();
  const navActions = useNavigationNodeActions();
  const matchesActions = useMatchesNodeActions();
  const axesActions = useAxesNodeActions();
  const gizmoActions = useGizmoNodeActions();
  const storeDeps = useGlobalContextMenuActionStoreFacade();

  const fullscreen = useMemo(
    () => ({
      isFullscreen: () => document.fullscreenElement !== null,
      enterFullscreen: () => document.documentElement.requestFullscreen(),
      exitFullscreen: () => document.exitFullscreen(),
    }),
    []
  );

  const backgroundColors = useMemo(
    () => ({
      lightColor: CANVAS_COLORS.white,
      darkColor: CANVAS_COLORS.outline,
    }),
    []
  );

  return useMemo<GlobalContextMenuActionExecutorDeps>(
    () => ({
      ...storeDeps,
      fullscreen,
      cameraProjection: navNode.projection,
      setCameraProjection: navActions.setProjection,
      cameraMode: navNode.mode,
      setCameraMode: navActions.setMode,
      horizonLock: navNode.horizonLock,
      setHorizonLock: navActions.setHorizonLock,
      autoRotateMode: navNode.autoRotateMode,
      setAutoRotateMode: navActions.setAutoRotateMode,
      backgroundColors,
      toggleAxes: axesActions.toggleVisible,
      axisLabelMode: axesNode.labelMode,
      setAxisLabelMode: axesActions.setLabelMode,
      axesCoordinateSystem: axesNode.coordinateSystem,
      setAxesCoordinateSystem: axesActions.setCoordinateSystem,
      frustumColorMode: camerasNode.colorMode,
      setFrustumColorMode: camerasActions.setColorMode,
      showPointCloud: pointsNode.visible,
      setShowPointCloud: pointsActions.setVisible,
      colorMode: pointsNode.colorMode,
      setColorMode: pointsActions.setColorMode,
      pointSize: pointsNode.size,
      setPointSize: pointsActions.setSize,
      minTrackLength: pointsNode.minTrackLength,
      setMinTrackLength: pointsActions.setMinTrackLength,
      cameraDisplayMode: camerasNode.displayMode,
      setCameraDisplayMode: camerasActions.setDisplayMode,
      showMatches: matchesNode.visible,
      setShowMatches: matchesActions.setVisible,
      matchesDisplayMode: matchesNode.displayMode,
      setMatchesDisplayMode: matchesActions.setDisplayMode,
      showSelectionHighlight: selectionNode.visible,
      setShowSelectionHighlight: selectionActions.setVisible,
      selectionColorMode: selectionNode.colorMode,
      setSelectionColorMode: selectionActions.setColorMode,
      setSelectedImageId: selectionActions.setSelectedImageId,
      showCameras: camerasNode.visible,
      setShowCameras: camerasActions.setVisible,
      undistortionEnabled: camerasNode.undistortionEnabled,
      setUndistortionEnabled: camerasActions.setUndistortionEnabled,
      toggleGizmo: gizmoActions.toggleVisible,
      pointerLock: navNode.pointerLock,
      setPointerLock: navActions.setPointerLock,
      flySpeed: navNode.flySpeed,
      setFlySpeed: navActions.setFlySpeed,
      openEditPopup,
    }),
    [
      storeDeps,
      fullscreen,
      navNode.projection,
      navActions.setProjection,
      navNode.mode,
      navActions.setMode,
      navNode.horizonLock,
      navActions.setHorizonLock,
      navNode.autoRotateMode,
      navActions.setAutoRotateMode,
      backgroundColors,
      axesActions.toggleVisible,
      axesNode.labelMode,
      axesActions.setLabelMode,
      axesNode.coordinateSystem,
      axesActions.setCoordinateSystem,
      camerasNode.colorMode,
      camerasActions.setColorMode,
      pointsNode.visible,
      pointsActions.setVisible,
      pointsNode.colorMode,
      pointsActions.setColorMode,
      pointsNode.size,
      pointsActions.setSize,
      pointsNode.minTrackLength,
      pointsActions.setMinTrackLength,
      camerasNode.displayMode,
      camerasActions.setDisplayMode,
      matchesNode.visible,
      matchesActions.setVisible,
      matchesNode.displayMode,
      matchesActions.setDisplayMode,
      selectionNode.visible,
      selectionActions.setVisible,
      selectionNode.colorMode,
      selectionActions.setColorMode,
      selectionActions.setSelectedImageId,
      camerasNode.visible,
      camerasActions.setVisible,
      camerasNode.undistortionEnabled,
      camerasActions.setUndistortionEnabled,
      gizmoActions.toggleVisible,
      navNode.pointerLock,
      navActions.setPointerLock,
      navNode.flySpeed,
      navActions.setFlySpeed,
      openEditPopup,
    ]
  );
}
