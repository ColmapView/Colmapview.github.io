// Reconstruction store
export {
  useReconstructionStore,
  selectPointCount,
  selectImageCount,
  selectCameraCount,
  hasUrlToLoad,
} from './reconstructionStore';

// Domain stores
export { usePointCloudStore, type PointCloudState } from './stores/pointCloudStore';
export { useCameraStore, type CameraState } from './stores/cameraStore';
export { useUIStore, type UIState, type ViewDirection, type ContextMenuAction, DEFAULT_CONTEXT_MENU_ACTIONS } from './stores/uiStore';
export { useExportStore, type ExportState } from './stores/exportStore';
export { useTransformStore, type TransformState } from './stores/transformStore';
export { usePointPickingStore, type PointPickingState, type PointPickingMode, type SelectedPoint, type ModalPosition } from './stores/pointPickingStore';
export { useRigStore, type RigState } from './stores/rigStore';
export { useNotificationStore, type NotificationState, type NotificationType, type Notification } from './stores/notificationStore';
export { useGuideStore, type GuideState } from './stores/guideStore';
export { useFloorPlaneStore, type FloorPlaneState, type FloorColorMode, type FloorTargetAxis } from './stores/floorPlaneStore';

// Types and constants
export type {
  ColorMode,
  CameraMode,
  CameraProjection,
  AutoRotateMode,
  HorizonLockMode,
  FrustumColorMode,
  CameraDisplayMode,
  MatchesDisplayMode,
  SelectionColorMode,
  AxesCoordinateSystem,
  AxisLabelMode,
  ScreenshotSize,
  ScreenshotFormat,
  ExportFormat,
  RigDisplayMode,
  RigColorMode,
} from './types';

export {
  COLOR_MODES,
  CAMERA_MODES,
  CAMERA_PROJECTIONS,
  AUTO_ROTATE_MODES,
  HORIZON_LOCK_MODES,
  CAMERA_DISPLAY_MODES,
  MATCHES_DISPLAY_MODES,
  SELECTION_COLOR_MODES,
  RIG_DISPLAY_MODES,
  RIG_COLOR_MODES,
} from './types';

// Migration utilities
export { initStoreMigration } from './migration';

// Coordinated actions (cross-store operations)
export {
  // Reconstruction actions
  clearReconstruction,
  setNewReconstruction,
  getReconstructionForTransform,
  hasReconstruction,
  getPointCount,
  type ClearReconstructionOptions,
  type SetReconstructionOptions,
  type SetReconstructionResult,
  // Transform actions
  applyTransformPreset,
  applyTransformToData,
  resetTransformWithCleanup,
  hasActiveTransform,
  getCurrentTransform,
  // Session actions
  resetSession,
  resetViewToDefault,
  deselectAll,
  clearTransientState,
  closeAllModals,
} from './actions';
