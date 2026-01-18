// Reconstruction store
export {
  useReconstructionStore,
  selectPointCount,
  selectImageCount,
  selectCameraCount
} from './reconstructionStore';

// Domain stores
export { usePointCloudStore, type PointCloudState } from './stores/pointCloudStore';
export { useCameraStore, type CameraState } from './stores/cameraStore';
export { useUIStore, type UIState, type ViewDirection, type ContextMenuAction, DEFAULT_CONTEXT_MENU_ACTIONS } from './stores/uiStore';
export { useExportStore, type ExportState } from './stores/exportStore';
export { useTransformStore, type TransformState } from './stores/transformStore';
export { usePointPickingStore, type PointPickingState, type PointPickingMode, type SelectedPoint, type ModalPosition } from './stores/pointPickingStore';

// Types and constants
export type {
  ColorMode,
  CameraMode,
  CameraProjection,
  AutoRotateMode,
  ImageLoadMode,
  FrustumColorMode,
  CameraDisplayMode,
  MatchesDisplayMode,
  SelectionColorMode,
  AxesDisplayMode,
  AxesCoordinateSystem,
  AxisLabelMode,
  ScreenshotSize,
  ScreenshotFormat,
  ExportFormat,
} from './types';

export {
  COLOR_MODES,
  CAMERA_MODES,
  CAMERA_PROJECTIONS,
  AUTO_ROTATE_MODES,
  CAMERA_DISPLAY_MODES,
  MATCHES_DISPLAY_MODES,
  SELECTION_COLOR_MODES,
} from './types';

// Migration utilities
export { initStoreMigration } from './migration';
