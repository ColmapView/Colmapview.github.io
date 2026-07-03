import type { CameraDisplayMode } from '../../store/types';

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

export function shouldShowCameraDependentPanels(showCameras: boolean): boolean {
  return showCameras;
}

export function shouldShowMatchesPanel(
  showCameras: boolean,
  cameraDisplayMode: CameraDisplayMode,
  hasPinholeCameras: boolean
): boolean {
  // The 'imageplane' mode hides Matches only when image planes actually exist. For a
  // spherical-only dataset (no pinhole cameras) image planes are meaningless, so a
  // persisted 'imageplane' mode must not trap the Matches panel hidden.
  return showCameras && (cameraDisplayMode !== 'imageplane' || !hasPinholeCameras);
}
