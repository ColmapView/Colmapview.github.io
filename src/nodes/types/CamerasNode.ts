import type {
  CameraDisplayMode,
  FrustumColorMode,
  CameraScaleFactor,
  UndistortionMode,
} from '../../store/types';
import type { VisibleNode } from './base';

/**
 * CamerasNode extends VisibleNode (not VisualNode) because it uses
 * domain-specific opacity:
 * - `standbyOpacity`: Controls opacity of non-selected cameras.
 *   Selected/hovered cameras render at full opacity.
 */
export interface CamerasNode extends VisibleNode {
  readonly nodeType: 'cameras';
  displayMode: CameraDisplayMode;
  scale: number;
  scaleFactor: CameraScaleFactor;
  colorMode: FrustumColorMode;
  singleColor: string;
  standbyOpacity: number;
  undistortionEnabled: boolean;
  undistortionMode: UndistortionMode;
}
