import { createElement, type ReactElement } from 'react';
import type { ContextMenuAction } from '../../../store';
import { HOTKEYS } from '../../../theme';
import {
  ResetIcon, ReloadIcon, CheckIcon, SettingsIcon, FullscreenIcon, FilterIcon, SpeedIcon, SpeedDimIcon,
  PlusCircleIcon, MinusCircleIcon, CrosshairIcon,
  ScreenshotIcon, TransformIcon, FrustumIcon, AxesIcon, BgIcon,
  ViewPosXIcon, ViewPosYIcon, ViewPosZIcon, ProjectionIcon, CameraModeIcon, HorizonLockIcon,
  AutoRotateIcon, GalleryPanelIcon, CoordSystemIcon, FrustumColorIcon, PointColorIcon,
  MatchesIcon, SelectionColorIcon, DeselectAllIcon, ImagePlanesIcon, UndistortIcon,
  CenterOriginIcon, OnePointOriginIcon, TwoPointScaleIcon, ThreePointAlignIcon, ExportPLYIcon, ExportConfigIcon,
  DeleteImagesIcon, FloorDetectionIcon, CameraConvertIcon,
} from '../../../icons';
import { getConfigurableActions, type ContextMenuSectionId } from './globalContextMenuViewModel';

export interface ActionDef {
  id: ContextMenuAction;
  label: string;
  icon: ReactElement;
  section: ContextMenuSectionId;
  hotkey?: string;
}

export const CONTEXT_MENU_ACTIONS: ActionDef[] = [
  { id: 'resetView', label: 'Reset View', section: 'view', hotkey: HOTKEYS.resetView.keys, icon: createElement(ResetIcon) },
  { id: 'viewPosX', label: 'View +X', section: 'view', hotkey: HOTKEYS.viewX.keys, icon: ViewPosXIcon },
  { id: 'viewPosY', label: 'View +Y', section: 'view', hotkey: HOTKEYS.viewY.keys, icon: ViewPosYIcon },
  { id: 'viewPosZ', label: 'View +Z', section: 'view', hotkey: HOTKEYS.viewZ.keys, icon: ViewPosZIcon },
  { id: 'toggleFullscreen', label: 'Fullscreen', section: 'view', hotkey: 'F11', icon: createElement(FullscreenIcon) },
  { id: 'toggleProjection', label: 'Persp/Ortho', section: 'view', icon: ProjectionIcon },
  { id: 'toggleCameraMode', label: 'Camera Mode', section: 'view', hotkey: HOTKEYS.toggleCameraMode.keys, icon: CameraModeIcon },
  { id: 'toggleHorizonLock', label: 'Horizon Lock', section: 'view', icon: HorizonLockIcon },
  { id: 'cycleAutoRotate', label: 'Auto Rotate', section: 'view', icon: AutoRotateIcon },
  { id: 'toggleBackground', label: 'Background', section: 'display', hotkey: HOTKEYS.toggleBackground.keys, icon: createElement(BgIcon) },
  { id: 'toggleAxes', label: 'Toggle Axes', section: 'display', icon: createElement(AxesIcon) },
  { id: 'toggleGallery', label: 'Gallery Panel', section: 'display', icon: GalleryPanelIcon },
  { id: 'cycleCoordinateSystem', label: 'Coord System', section: 'display', icon: CoordSystemIcon },
  { id: 'cycleFrustumColor', label: 'Frustum Color', section: 'display', icon: FrustumColorIcon },
  { id: 'cyclePointColor', label: 'Point Color', section: 'display', hotkey: HOTKEYS.cyclePointSize.keys, icon: PointColorIcon },
  { id: 'pointSizeUp', label: 'Point Size +', section: 'display', icon: createElement(PlusCircleIcon) },
  { id: 'pointSizeDown', label: 'Point Size -', section: 'display', icon: createElement(MinusCircleIcon) },
  { id: 'togglePointFiltering', label: 'Min Track', section: 'display', icon: createElement(FilterIcon) },
  { id: 'cycleCameraDisplay', label: 'Camera Display', section: 'cameras', hotkey: HOTKEYS.cycleCameraDisplay.keys, icon: createElement(FrustumIcon) },
  { id: 'cycleMatchesDisplay', label: 'Matches', section: 'cameras', hotkey: HOTKEYS.cycleMatchesDisplay.keys, icon: MatchesIcon },
  { id: 'cycleSelectionColor', label: 'Selection Color', section: 'cameras', icon: SelectionColorIcon },
  { id: 'deselectAll', label: 'Deselect All', section: 'cameras', icon: DeselectAllIcon },
  { id: 'toggleImagePlanes', label: 'Image Planes', section: 'cameras', icon: ImagePlanesIcon },
  { id: 'toggleUndistort', label: 'Undistort (U)', section: 'cameras', icon: UndistortIcon },
  { id: 'toggleGizmo', label: 'Transform Gizmo', section: 'transform', hotkey: HOTKEYS.toggleGizmo.keys, icon: createElement(TransformIcon) },
  { id: 'centerAtOrigin', label: 'Center at Origin', section: 'transform', icon: CenterOriginIcon },
  { id: 'onePointOrigin', label: '1-Point Origin', section: 'transform', icon: OnePointOriginIcon },
  { id: 'twoPointScale', label: '2-Point Scale', section: 'transform', icon: TwoPointScaleIcon },
  { id: 'threePointAlign', label: '3-Point Align', section: 'transform', icon: ThreePointAlignIcon },
  { id: 'resetTransform', label: 'Reset Transform', section: 'transform', icon: createElement(ResetIcon) },
  { id: 'applyTransform', label: 'Apply Transform', section: 'transform', icon: createElement(CheckIcon) },
  { id: 'reloadData', label: 'Reload Data', section: 'transform', icon: createElement(ReloadIcon) },
  { id: 'openFloorDetection', label: 'Floor Detection', section: 'transform', icon: FloorDetectionIcon },
  { id: 'takeScreenshot', label: 'Screenshot', section: 'export', icon: createElement(ScreenshotIcon) },
  { id: 'exportPLY', label: 'Export PLY', section: 'export', icon: ExportPLYIcon },
  { id: 'exportConfig', label: 'Export Config', section: 'export', icon: ExportConfigIcon },
  { id: 'openDeletion', label: 'Delete Images from Model', section: 'export', icon: DeleteImagesIcon },
  { id: 'openCameraConversion', label: 'Camera Convert', section: 'export', icon: CameraConvertIcon },
  { id: 'togglePointerLock', label: 'Pointer Lock', section: 'view', icon: createElement(CrosshairIcon) },
  { id: 'flySpeedUp', label: 'Fly Speed +', section: 'view', icon: createElement(SpeedIcon) },
  { id: 'flySpeedDown', label: 'Fly Speed -', section: 'view', icon: createElement(SpeedDimIcon) },
  { id: 'editMenu', label: 'Edit Menu...', section: 'menu', icon: createElement(SettingsIcon) },
];

export const CONFIGURABLE_CONTEXT_MENU_ACTIONS = getConfigurableActions(CONTEXT_MENU_ACTIONS);
