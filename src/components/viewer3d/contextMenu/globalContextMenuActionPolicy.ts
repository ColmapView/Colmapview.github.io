import {
  SELECTION_COLOR_MODES,
  type CameraDisplayMode,
  type ColorMode,
  type ContextMenuAction,
  type MatchesDisplayMode,
  type PointPickingMode,
  type SelectionColorMode,
} from '../../../store';

export interface BackgroundCycleOptions {
  lightColor: string;
  darkColor: string;
}

export interface PointColorMenuState {
  showPointCloud: boolean;
  colorMode: ColorMode;
}

export interface MatchesMenuState {
  showMatches: boolean;
  displayMode: MatchesDisplayMode;
}

export interface SelectionColorMenuState {
  showSelectionHighlight: boolean;
  colorMode: SelectionColorMode;
}

export interface ImagePlanesMenuState {
  showCameras: boolean;
  displayMode: CameraDisplayMode;
}

export const TOGGLE_CONTEXT_MENU_ACTIONS: readonly ContextMenuAction[] = [
  'toggleProjection',
  'toggleCameraMode',
  'toggleHorizonLock',
  'cycleAutoRotate',
  'toggleBackground',
  'toggleAxes',
  'toggleGallery',
  'cycleCoordinateSystem',
  'cycleFrustumColor',
  'cyclePointColor',
  'pointSizeUp',
  'pointSizeDown',
  'togglePointFiltering',
  'cycleCameraDisplay',
  'cycleMatchesDisplay',
  'cycleSelectionColor',
  'toggleImagePlanes',
  'toggleUndistort',
  'toggleGizmo',
  'togglePointerLock',
  'flySpeedUp',
  'flySpeedDown',
];

const toggleActionSet = new Set<ContextMenuAction>(TOGGLE_CONTEXT_MENU_ACTIONS);

export function shouldCloseContextMenuAfterAction(actionId: ContextMenuAction): boolean {
  return actionId !== 'editMenu' && !toggleActionSet.has(actionId);
}

export function getNextCycleValue<TValue>(
  values: readonly TValue[],
  currentValue: TValue
): TValue {
  const currentIndex = values.indexOf(currentValue);
  return values[(currentIndex + 1) % values.length];
}

export function getNextBackgroundColor(
  currentColor: string,
  { lightColor, darkColor }: BackgroundCycleOptions
): string {
  const isLight = currentColor === '#ffffff' || currentColor === '#fff';
  return isLight ? darkColor : lightColor;
}

export function getNextPointColorMenuState({
  showPointCloud,
  colorMode,
}: PointColorMenuState): PointColorMenuState {
  if (!showPointCloud) {
    return { showPointCloud: true, colorMode: 'rgb' };
  }

  if (colorMode === 'rgb') {
    return { showPointCloud: true, colorMode: 'error' };
  }

  if (colorMode === 'error') {
    return { showPointCloud: true, colorMode: 'trackLength' };
  }

  if (colorMode === 'trackLength') {
    return { showPointCloud: true, colorMode: 'splats' };
  }

  return { showPointCloud: false, colorMode };
}

export function getNextPointSize(pointSize: number, direction: 'up' | 'down'): number {
  return direction === 'up'
    ? Math.min(pointSize + 1, 20)
    : Math.max(pointSize - 1, 1);
}

export function getNextMinTrackLength(minTrackLength: number): number {
  return minTrackLength === 2 ? 3 : 2;
}

export function getNextMatchesMenuState({
  showMatches,
  displayMode,
}: MatchesMenuState): MatchesMenuState {
  if (!showMatches) {
    return { showMatches: true, displayMode: 'static' };
  }

  if (displayMode === 'static') {
    return { showMatches: true, displayMode: 'blink' };
  }

  return { showMatches: false, displayMode };
}

export function getNextSelectionColorMenuState(
  {
    showSelectionHighlight,
    colorMode,
  }: SelectionColorMenuState,
  colorModes: readonly SelectionColorMode[] = SELECTION_COLOR_MODES
): SelectionColorMenuState {
  if (!showSelectionHighlight) {
    return { showSelectionHighlight: true, colorMode: 'static' };
  }

  const currentIndex = colorModes.indexOf(colorMode);
  if (currentIndex === colorModes.length - 1) {
    return { showSelectionHighlight: false, colorMode };
  }

  return {
    showSelectionHighlight: true,
    colorMode: colorModes[(currentIndex + 1) % colorModes.length],
  };
}

export function getNextImagePlanesMenuState({
  showCameras,
  displayMode,
}: ImagePlanesMenuState): ImagePlanesMenuState {
  if (!showCameras) {
    return { showCameras: true, displayMode: 'frustum' };
  }

  if (displayMode === 'frustum') {
    return { showCameras: true, displayMode: 'imageplane' };
  }

  return { showCameras: false, displayMode };
}

export function getNextPickingMode(
  currentMode: PointPickingMode,
  targetMode: Exclude<PointPickingMode, 'off'>
): PointPickingMode {
  return currentMode === targetMode ? 'off' : targetMode;
}

export function getNextFlySpeed(flySpeed: number, direction: 'up' | 'down'): number {
  return direction === 'up'
    ? Math.min(flySpeed * 1.5, 20)
    : Math.max(flySpeed / 1.5, 0.5);
}
