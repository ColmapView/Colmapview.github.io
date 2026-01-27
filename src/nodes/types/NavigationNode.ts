import type {
  CameraMode,
  CameraProjection,
  HorizonLockMode,
  AutoRotateMode,
  CameraViewState,
  NavigationHistoryEntry,
} from '../../store/types';
import type { BaseNode } from './base';

export interface NavigationNode extends BaseNode {
  readonly nodeType: 'navigation';
  mode: CameraMode;
  projection: CameraProjection;
  fov: number;
  horizonLock: HorizonLockMode;
  autoRotateMode: AutoRotateMode;
  autoRotateSpeed: number;
  flySpeed: number;
  flyTransitionDuration: number;
  pointerLock: boolean;
  autoFovEnabled: boolean;
  // Transient
  flyToImageId: number | null;
  flyToViewState: CameraViewState | null;
  currentViewState: CameraViewState | null;
  navigationHistory: NavigationHistoryEntry[];
}
