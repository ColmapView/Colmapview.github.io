import type { CameraDisplayMode } from '../../store/types';
import { cameraDisplaySupportsMatches, type CameraUiContext } from './cameraUiContext';

export interface ViewerControlsContainerClassOptions {
  baseClassName: string;
  autoHideButtons: boolean;
  touchMode: boolean;
}

export function getViewerControlsContainerClassName({
  baseClassName,
  autoHideButtons,
  touchMode,
}: ViewerControlsContainerClassOptions): string {
  return `${baseClassName}${autoHideButtons ? ' idle-hideable' : ''}${touchMode ? ' touch-control-panel' : ''}`;
}

/**
 * Accessible names for the four toolbar clusters the hairline dividers separate.
 * The dividers are decorative (aria-hidden), so without these names a screen
 * reader hears sixteen sibling controls with no structure; the group wrappers
 * announce "View", "Data", "Capture", "App" instead.
 */
export const TOOLBAR_GROUP_LABELS = {
  view: 'View',
  data: 'Data',
  capture: 'Capture',
  app: 'App',
} as const;

/**
 * The group wrappers exist only to carry semantics: `display: contents` keeps
 * their children direct flex items of the toolbar column, so the container-level
 * gap overrides (index.css `@media (max-width: 1520px)` and `.touch-control-panel`)
 * still space the buttons themselves rather than the four clusters.
 */
export const TOOLBAR_GROUP_CLASS = 'contents';

export function shouldShowCameraDependentPanels(showCameras: boolean): boolean {
  return showCameras;
}

export function shouldShowMatchesPanel(
  showCameras: boolean,
  cameraDisplayMode: CameraDisplayMode,
  cameraContext: CameraUiContext
): boolean {
  return showCameras && cameraDisplaySupportsMatches(cameraDisplayMode, cameraContext);
}
