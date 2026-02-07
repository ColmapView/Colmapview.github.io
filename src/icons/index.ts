/**
 * Centralized icon exports.
 *
 * Usage:
 *   import { ScreenshotIcon, CheckIcon, ViewPosXIcon } from '@/icons';
 *
 * Organization:
 *   - types.ts: Common type definitions
 *   - ui.tsx: Common UI icons (close, check, arrows, etc.)
 *   - toolbar.tsx: Toolbar/control panel icons
 *   - menu.tsx: Context menu action icons (ReactElement format)
 */

// Types
export type { IconProps, HoverIconProps } from './types';

// Common UI icons
export {
  HoverIcon,
  CloseIcon,
  CheckIcon,
  ResetIcon,
  ReloadIcon,
  UploadIcon,
  OffIcon,
  HideIcon,
  SettingsIcon,
  FullscreenIcon,
  FilterIcon,
  SpeedIcon,
  SpeedDimIcon,
  PlusCircleIcon,
  MinusCircleIcon,
  CrosshairIcon,
  FlyToIcon,
  InfoIcon,
  WarningIcon,
  LinkIcon,
  ShareIcon,
  DiceIcon,
  FileJsonIcon,
  EmbedIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SaveIcon,
  TrashIcon,
} from './ui';

// Toolbar icons
export {
  ScreenshotIcon,
  ExportIcon,
  TransformIcon,
  FrustumIcon,
  ArrowIcon,
  CameraOffIcon,
  ImageIcon,
  MatchOffIcon,
  MatchOnIcon,
  MatchBlinkIcon,
  RainbowIcon,
  SelectionOffIcon,
  SelectionStaticIcon,
  SelectionBlinkIcon,
  AxesIcon,
  AxesOffIcon,
  GridIcon,
  AxesGridIcon,
  ColorOffIcon,
  ColorRgbIcon,
  ColorErrorIcon,
  ColorTrackIcon,
  BgIcon,
  ViewIcon,
  PrefetchIcon,
  LazyIcon,
  SkipIcon,
  OrbitIcon,
  FlyIcon,
  SidebarExpandIcon,
  SidebarCollapseIcon,
  RigIcon,
  RigOffIcon,
  RigBlinkIcon,
  FloorDetectIcon,
} from './toolbar';

// Context menu icons (ReactElement format for use in action definitions)
export {
  ViewPosXIcon,
  ViewPosYIcon,
  ViewPosZIcon,
  ProjectionIcon,
  CameraModeIcon,
  HorizonLockIcon,
  AutoRotateIcon,
  GalleryPanelIcon,
  CoordSystemIcon,
  FrustumColorIcon,
  PointColorIcon,
  MatchesIcon,
  SelectionColorIcon,
  DeselectAllIcon,
  ImagePlanesIcon,
  UndistortIcon,
  CenterOriginIcon,
  OnePointOriginIcon,
  TwoPointScaleIcon,
  ThreePointAlignIcon,
  ExportPLYIcon,
  ExportConfigIcon,
  DeleteImagesIcon,
  FloorDetectionIcon,
  CameraConvertIcon,
} from './menu';

// Mouse icons for click hints
export {
  MouseLeftIcon,
  MouseRightIcon,
  MouseScrollIcon,
  MouseDoubleClickIcon,
} from './mouse';
