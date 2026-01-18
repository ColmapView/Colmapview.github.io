import type { ColorMode } from '../../types/colmap';
import type {
  CameraMode,
  CameraProjection,
  AutoRotateMode,
  CameraDisplayMode,
  FrustumColorMode,
  SelectionColorMode,
  MatchesDisplayMode,
  AxesDisplayMode,
  AxesCoordinateSystem,
  AxisLabelMode,
  ImageLoadMode,
  GizmoMode,
  ScreenshotSize,
  ScreenshotFormat,
  ExportFormat,
} from '../../store/types';

export const CONFIG_VERSION = 1;

export interface PointCloudConfig {
  pointSize: number;
  colorMode: ColorMode;
  minTrackLength: number;
  maxReprojectionError: number | null; // null = Infinity
}

export interface CameraConfig {
  displayMode: CameraDisplayMode;
  scale: number;
  frustumColorMode: FrustumColorMode;
  unselectedOpacity: number;
  mode: CameraMode;
  projection: CameraProjection;
  fov: number;
  horizonLock: boolean;
  autoRotateMode: AutoRotateMode;
  autoRotateSpeed: number;
  flySpeed: number;
  pointerLock: boolean;
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;
  imagePlaneOpacity: number;
}

export interface UIConfig {
  showPoints2D: boolean;
  showPoints3D: boolean;
  backgroundColor: string;
  matchesDisplayMode: MatchesDisplayMode;
  matchesOpacity: number;
  matchesColor: string;
  maskOverlay: boolean;
  maskOpacity: number;
  axesDisplayMode: AxesDisplayMode;
  axesCoordinateSystem: AxesCoordinateSystem;
  axesScale: number;
  gridScale: number;
  axisLabelMode: AxisLabelMode;
  imageLoadMode: ImageLoadMode;
  gizmoMode: GizmoMode;
  galleryCollapsed: boolean;
}

export interface ExportConfig {
  screenshotSize: ScreenshotSize;
  screenshotFormat: ScreenshotFormat;
  screenshotHideLogo: boolean;
  modelFormat: ExportFormat;
}

export interface AppConfiguration {
  version: number;
  pointCloud: PointCloudConfig;
  camera: CameraConfig;
  ui: UIConfig;
  export: ExportConfig;
}

// Deep partial type for partial configuration imports
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type PartialAppConfiguration = DeepPartial<AppConfiguration>;

export interface ConfigValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  config: PartialAppConfiguration | null;
}
