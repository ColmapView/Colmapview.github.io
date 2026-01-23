// ============================================================================
// Enum Arrays (used by property registry for validation and type inference)
// ============================================================================

// Point cloud visualization
export const COLOR_MODES = ['rgb', 'error', 'trackLength', 'floor'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

// Camera and navigation
export const CAMERA_MODES = ['orbit', 'fly'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

export const CAMERA_PROJECTIONS = ['perspective', 'orthographic'] as const;
export type CameraProjection = (typeof CAMERA_PROJECTIONS)[number];

export const AUTO_ROTATE_MODES = ['off', 'cw', 'ccw'] as const;
export type AutoRotateMode = (typeof AUTO_ROTATE_MODES)[number];

export const HORIZON_LOCK_MODES = ['off', 'on', 'flip'] as const;
export type HorizonLockMode = (typeof HORIZON_LOCK_MODES)[number];

export const CAMERA_DISPLAY_MODES = ['off', 'frustum', 'arrow', 'imageplane'] as const;
export type CameraDisplayMode = (typeof CAMERA_DISPLAY_MODES)[number];

export const FRUSTUM_COLOR_MODES = ['single', 'byCamera', 'byRigFrame'] as const;
export type FrustumColorMode = (typeof FRUSTUM_COLOR_MODES)[number];

export const CAMERA_SCALE_FACTORS = ['0.1', '1', '10'] as const;
export type CameraScaleFactor = (typeof CAMERA_SCALE_FACTORS)[number];

export const UNDISTORTION_MODES = ['cropped', 'fullFrame'] as const;
export type UndistortionMode = (typeof UNDISTORTION_MODES)[number];

// Visualization
export const MATCHES_DISPLAY_MODES = ['off', 'on', 'blink'] as const;
export type MatchesDisplayMode = (typeof MATCHES_DISPLAY_MODES)[number];

export const SELECTION_COLOR_MODES = ['off', 'static', 'blink', 'rainbow'] as const;
export type SelectionColorMode = (typeof SELECTION_COLOR_MODES)[number];

export const AXES_DISPLAY_MODES = ['off', 'axes', 'grid', 'both'] as const;
export type AxesDisplayMode = (typeof AXES_DISPLAY_MODES)[number];

export const AXES_COORDINATE_SYSTEMS = [
  'colmap',
  'opencv',
  'threejs',
  'opengl',
  'vulkan',
  'blender',
  'houdini',
  'unity',
  'unreal',
] as const;
export type AxesCoordinateSystem = (typeof AXES_COORDINATE_SYSTEMS)[number];

export const AXIS_LABEL_MODES = ['off', 'xyz', 'extra'] as const;
export type AxisLabelMode = (typeof AXIS_LABEL_MODES)[number];

export const GIZMO_MODES = ['off', 'local', 'global'] as const;
export type GizmoMode = (typeof GIZMO_MODES)[number];

// Rig visualization
export const RIG_DISPLAY_MODES = ['off', 'lines', 'blink'] as const;
export type RigDisplayMode = (typeof RIG_DISPLAY_MODES)[number];

export const RIG_COLOR_MODES = ['single', 'perFrame'] as const;
export type RigColorMode = (typeof RIG_COLOR_MODES)[number];

// Export
export const SCREENSHOT_SIZES = [
  'current',
  '1920x1080',
  '1280x720',
  '3840x2160',
  '1024x1024',
  '512x512',
  '2048x2048',
] as const;
export type ScreenshotSize = (typeof SCREENSHOT_SIZES)[number];

export const SCREENSHOT_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type ScreenshotFormat = (typeof SCREENSHOT_FORMATS)[number];

export const EXPORT_FORMATS = ['text', 'binary', 'ply', 'config'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// Camera view state for navigation history
export interface CameraViewState {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  target: [number, number, number];
  distance: number;
}

// Navigation history entry tracks where we came from and what we flew to
export interface NavigationHistoryEntry {
  fromState: CameraViewState;
  fromImageId: number | null; // The previously selected image (null if none)
  toImageId: number;
}
