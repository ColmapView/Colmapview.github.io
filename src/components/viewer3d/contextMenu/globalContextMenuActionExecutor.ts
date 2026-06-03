import {
  AUTO_ROTATE_MODES,
  CAMERA_DISPLAY_MODES,
  CAMERA_MODES,
  CAMERA_PROJECTIONS,
  HORIZON_LOCK_MODES,
  type AutoRotateMode,
  type AxesCoordinateSystem,
  type AxisLabelMode,
  type CameraDisplayMode,
  type CameraMode,
  type CameraProjection,
  type ColorMode,
  type ContextMenuAction,
  type ExportFormat,
  type FrustumColorMode,
  type HorizonLockMode,
  type MatchesDisplayMode,
  type PointPickingMode,
  type SelectionColorMode,
  type ViewDirection,
} from '../../../store';
import {
  getNextBackgroundColor,
  getNextCycleValue,
  getNextFlySpeed,
  getNextImagePlanesMenuState,
  getNextMatchesMenuState,
  getNextMinTrackLength,
  getNextPickingMode,
  getNextPointColorMenuState,
  getNextPointSize,
  getNextSelectionColorMenuState,
} from './globalContextMenuViewModel';

type MaybePromise<T> = T | Promise<T>;
type Setter<T> = (value: T) => void;

export const CONTEXT_MENU_COORD_SYSTEMS: readonly AxesCoordinateSystem[] = [
  'colmap',
  'opencv',
  'threejs',
  'opengl',
  'blender',
  'unity',
  'unreal',
];

export const CONTEXT_MENU_AXIS_LABEL_MODES: readonly AxisLabelMode[] = ['off', 'xyz', 'extra'];
export const CONTEXT_MENU_FRUSTUM_COLOR_MODES: readonly FrustumColorMode[] = ['single', 'byCamera'];

export interface GlobalContextMenuFullscreenActions {
  isFullscreen: () => boolean;
  enterFullscreen: () => MaybePromise<void>;
  exitFullscreen: () => MaybePromise<void>;
}

export interface GlobalContextMenuBackgroundColors {
  lightColor: string;
  darkColor: string;
}

export interface GlobalContextMenuActionExecutorDeps {
  resetView: () => void;
  setView: Setter<ViewDirection>;
  fullscreen: GlobalContextMenuFullscreenActions;
  cameraProjection: CameraProjection;
  setCameraProjection: Setter<CameraProjection>;
  cameraMode: CameraMode;
  setCameraMode: Setter<CameraMode>;
  horizonLock: HorizonLockMode;
  setHorizonLock: Setter<HorizonLockMode>;
  autoRotateMode: AutoRotateMode;
  setAutoRotateMode: Setter<AutoRotateMode>;
  backgroundColor: string;
  backgroundColors: GlobalContextMenuBackgroundColors;
  setBackgroundColor: Setter<string>;
  toggleAxes: () => void;
  toggleGalleryCollapsed: () => void;
  axisLabelMode: AxisLabelMode;
  setAxisLabelMode: Setter<AxisLabelMode>;
  axesCoordinateSystem: AxesCoordinateSystem;
  setAxesCoordinateSystem: Setter<AxesCoordinateSystem>;
  frustumColorMode: FrustumColorMode;
  setFrustumColorMode: Setter<FrustumColorMode>;
  showPointCloud: boolean;
  setShowPointCloud: Setter<boolean>;
  colorMode: ColorMode;
  setColorMode: Setter<ColorMode>;
  pointSize: number;
  setPointSize: Setter<number>;
  minTrackLength: number;
  setMinTrackLength: Setter<number>;
  cameraDisplayMode: CameraDisplayMode;
  setCameraDisplayMode: Setter<CameraDisplayMode>;
  showMatches: boolean;
  setShowMatches: Setter<boolean>;
  matchesDisplayMode: MatchesDisplayMode;
  setMatchesDisplayMode: Setter<MatchesDisplayMode>;
  showSelectionHighlight: boolean;
  setShowSelectionHighlight: Setter<boolean>;
  selectionColorMode: SelectionColorMode;
  setSelectionColorMode: Setter<SelectionColorMode>;
  setSelectedImageId: Setter<number | null>;
  showCameras: boolean;
  setShowCameras: Setter<boolean>;
  undistortionEnabled: boolean;
  setUndistortionEnabled: Setter<boolean>;
  toggleGizmo: () => void;
  applyTransformPreset: (preset: 'centerAtOrigin') => void;
  pickingMode: PointPickingMode;
  setPickingMode: Setter<PointPickingMode>;
  resetTransform: () => void;
  applyTransformToData: () => void;
  droppedFiles: Map<string, File> | null;
  confirmReload: () => MaybePromise<boolean>;
  processFiles: (files: Map<string, File>) => MaybePromise<void>;
  takeScreenshot: () => void;
  setExportFormat: Setter<ExportFormat>;
  triggerExport: () => void;
  pointerLock: boolean;
  setPointerLock: Setter<boolean>;
  flySpeed: number;
  setFlySpeed: Setter<number>;
  openDeletionModal: () => void;
  openFloorDetectionModal: () => void;
  openCameraConversionModal: () => void;
  openEditPopup: () => void;
}

export async function executeGlobalContextMenuAction(
  actionId: ContextMenuAction,
  deps: GlobalContextMenuActionExecutorDeps
): Promise<void> {
  switch (actionId) {
    case 'resetView':
      deps.resetView();
      deps.setCameraProjection('perspective');
      break;
    case 'viewPosX':
      deps.setView('x');
      break;
    case 'viewPosY':
      deps.setView('y');
      break;
    case 'viewPosZ':
      deps.setView('z');
      break;
    case 'toggleFullscreen':
      if (deps.fullscreen.isFullscreen()) {
        await deps.fullscreen.exitFullscreen();
      } else {
        await deps.fullscreen.enterFullscreen();
      }
      break;
    case 'toggleProjection':
      deps.setCameraProjection(getNextCycleValue(CAMERA_PROJECTIONS, deps.cameraProjection));
      break;
    case 'toggleCameraMode':
      deps.setCameraMode(getNextCycleValue(CAMERA_MODES, deps.cameraMode));
      break;
    case 'toggleHorizonLock':
      deps.setHorizonLock(getNextCycleValue(HORIZON_LOCK_MODES, deps.horizonLock));
      break;
    case 'cycleAutoRotate':
      deps.setAutoRotateMode(getNextCycleValue(AUTO_ROTATE_MODES, deps.autoRotateMode));
      break;
    case 'toggleBackground':
      deps.setBackgroundColor(getNextBackgroundColor(deps.backgroundColor, deps.backgroundColors));
      break;
    case 'toggleAxes':
      deps.toggleAxes();
      break;
    case 'toggleGallery':
      deps.toggleGalleryCollapsed();
      break;
    case 'cycleAxisLabels':
      deps.setAxisLabelMode(getNextCycleValue(CONTEXT_MENU_AXIS_LABEL_MODES, deps.axisLabelMode));
      break;
    case 'cycleCoordinateSystem':
      deps.setAxesCoordinateSystem(getNextCycleValue(CONTEXT_MENU_COORD_SYSTEMS, deps.axesCoordinateSystem));
      break;
    case 'cycleFrustumColor':
      deps.setFrustumColorMode(getNextCycleValue(CONTEXT_MENU_FRUSTUM_COLOR_MODES, deps.frustumColorMode));
      break;
    case 'cyclePointColor': {
      const nextState = getNextPointColorMenuState({
        showPointCloud: deps.showPointCloud,
        colorMode: deps.colorMode,
      });
      deps.setShowPointCloud(nextState.showPointCloud);
      deps.setColorMode(nextState.colorMode);
      break;
    }
    case 'pointSizeUp':
      deps.setPointSize(getNextPointSize(deps.pointSize, 'up'));
      break;
    case 'pointSizeDown':
      deps.setPointSize(getNextPointSize(deps.pointSize, 'down'));
      break;
    case 'togglePointFiltering':
      deps.setMinTrackLength(getNextMinTrackLength(deps.minTrackLength));
      break;
    case 'cycleCameraDisplay':
      deps.setCameraDisplayMode(getNextCycleValue(CAMERA_DISPLAY_MODES, deps.cameraDisplayMode));
      break;
    case 'cycleMatchesDisplay': {
      const nextState = getNextMatchesMenuState({
        showMatches: deps.showMatches,
        displayMode: deps.matchesDisplayMode,
      });
      deps.setShowMatches(nextState.showMatches);
      deps.setMatchesDisplayMode(nextState.displayMode);
      break;
    }
    case 'cycleSelectionColor': {
      const nextState = getNextSelectionColorMenuState({
        showSelectionHighlight: deps.showSelectionHighlight,
        colorMode: deps.selectionColorMode,
      });
      deps.setShowSelectionHighlight(nextState.showSelectionHighlight);
      deps.setSelectionColorMode(nextState.colorMode);
      break;
    }
    case 'deselectAll':
      deps.setSelectedImageId(null);
      break;
    case 'toggleImagePlanes': {
      const nextState = getNextImagePlanesMenuState({
        showCameras: deps.showCameras,
        displayMode: deps.cameraDisplayMode,
      });
      deps.setShowCameras(nextState.showCameras);
      deps.setCameraDisplayMode(nextState.displayMode);
      break;
    }
    case 'toggleUndistort':
      deps.setUndistortionEnabled(!deps.undistortionEnabled);
      break;
    case 'toggleGizmo':
      deps.toggleGizmo();
      break;
    case 'centerAtOrigin':
      deps.applyTransformPreset('centerAtOrigin');
      break;
    case 'onePointOrigin':
      deps.setPickingMode(getNextPickingMode(deps.pickingMode, 'origin-1pt'));
      break;
    case 'twoPointScale':
      deps.setPickingMode(getNextPickingMode(deps.pickingMode, 'distance-2pt'));
      break;
    case 'threePointAlign':
      deps.setPickingMode(getNextPickingMode(deps.pickingMode, 'normal-3pt'));
      break;
    case 'resetTransform':
      deps.resetTransform();
      break;
    case 'applyTransform':
      deps.applyTransformToData();
      break;
    case 'reloadData':
      if (deps.droppedFiles && await deps.confirmReload()) {
        deps.resetTransform();
        await deps.processFiles(deps.droppedFiles);
      }
      break;
    case 'takeScreenshot':
      deps.takeScreenshot();
      break;
    case 'exportPLY':
      deps.setExportFormat('ply');
      deps.triggerExport();
      break;
    case 'exportConfig':
      deps.setExportFormat('config');
      deps.triggerExport();
      break;
    case 'togglePointerLock':
      deps.setPointerLock(!deps.pointerLock);
      break;
    case 'flySpeedUp':
      deps.setFlySpeed(getNextFlySpeed(deps.flySpeed, 'up'));
      break;
    case 'flySpeedDown':
      deps.setFlySpeed(getNextFlySpeed(deps.flySpeed, 'down'));
      break;
    case 'openDeletion':
      deps.openDeletionModal();
      break;
    case 'openFloorDetection':
      deps.openFloorDetectionModal();
      break;
    case 'openCameraConversion':
      deps.openCameraConversionModal();
      break;
    case 'editMenu':
      deps.openEditPopup();
      break;
  }
}
