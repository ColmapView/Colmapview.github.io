import type { ColorMode } from '../../types/colmap';
import type {
  GalleryBorderColorModeSetting,
  GallerySortDirection,
  GallerySortField,
  GalleryThumbnailDisplayMode,
  GalleryViewModeSetting,
} from '../../types/gallery';
import type {
  CameraMode,
  CameraProjection,
  AutoRotateMode,
  HorizonLockMode,
  CameraDisplayMode,
  FrustumColorMode,
  CameraScaleFactor,
  UndistortionMode,
  SelectionColorMode,
  MatchesDisplayMode,
  AxesCoordinateSystem,
  AxisLabelMode,
  ScreenshotSize,
  ScreenshotFormat,
  RigDisplayMode,
  RigColorMode,
} from '../../store/types';

export const CONFIG_VERSION = 1;

type ModelExportFormat = 'text' | 'binary' | 'ply' | 'zip';

export interface PointCloudConfig {
  [key: string]: unknown;
  showPointCloud?: boolean;
  pointSize?: number;
  pointOpacity?: number;
  colorMode?: ColorMode;
  minTrackLength?: number;
  maxReprojectionError?: number | null; // null = Infinity
  thinning?: number;
}

export interface CameraConfig {
  [key: string]: unknown;
  show?: boolean;
  displayMode?: CameraDisplayMode;
  scaleFactor?: CameraScaleFactor;
  scale?: number;
  frustumColorMode?: FrustumColorMode;
  frustumSingleColor?: string;
  frustumStandbyOpacity?: number;
  frustumLineWidth?: number;
  unselectedOpacity?: number;
  mode?: CameraMode;
  projection?: CameraProjection;
  fov?: number;
  horizonLock?: HorizonLockMode;
  autoRotateMode?: AutoRotateMode;
  autoRotateSpeed?: number;
  flySpeed?: number;
  flyTransitionDuration?: number;
  pointerLock?: boolean;
  showSelectionHighlight?: boolean;
  selectionColorMode?: SelectionColorMode;
  selectionColor?: string;
  selectionAnimationSpeed?: number;
  selectionPlaneOpacity?: number;
  undistortionEnabled?: boolean;
  undistortionMode?: UndistortionMode;
  autoFovEnabled?: boolean;
}

export interface UIConfig {
  [key: string]: unknown;
  showPoints2D?: boolean;
  showPoints3D?: boolean;
  backgroundColor?: string;
  showMatches?: boolean;
  matchesDisplayMode?: MatchesDisplayMode;
  matchesOpacity?: number;
  matchesColor?: string;
  matchesLineWidth?: number;
  maskOverlay?: boolean;
  maskOpacity?: number;
  showAxes?: boolean;
  showGrid?: boolean;
  axesCoordinateSystem?: AxesCoordinateSystem;
  axesScale?: number;
  gridScale?: number;
  axisLabelMode?: AxisLabelMode;
  showGizmo?: boolean;
  galleryCollapsed?: boolean;
  galleryViewMode?: GalleryViewModeSetting;
  galleryColumns?: number;
  galleryCameraFilter?: string;
  gallerySortField?: GallerySortField;
  gallerySortDirection?: GallerySortDirection;
  galleryBorderColorMode?: GalleryBorderColorModeSetting;
  galleryThumbnailDisplayMode?: GalleryThumbnailDisplayMode;
}

export interface ExportConfig {
  [key: string]: unknown;
  screenshotSize?: ScreenshotSize;
  screenshotFormat?: ScreenshotFormat;
  screenshotHideLogo?: boolean;
  modelFormat?: ModelExportFormat;
}

export interface RigConfig {
  [key: string]: unknown;
  showRig?: boolean;
  rigDisplayMode?: RigDisplayMode;
  rigColorMode?: RigColorMode;
  rigLineColor?: string;
  rigLineOpacity?: number;
  rigLineWidth?: number;
}

export interface AppConfiguration {
  version: number;
  pointCloud: PointCloudConfig;
  camera: CameraConfig;
  ui: UIConfig;
  export: ExportConfig;
  rig: RigConfig;
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
