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
  cameraDisplayMode: CameraDisplayMode
): boolean {
  return showCameras && cameraDisplayMode !== 'imageplane';
}
