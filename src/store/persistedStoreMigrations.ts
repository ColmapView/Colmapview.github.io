import type { PointCloudState } from './stores/pointCloudStore';
import { isSplatColorMode } from './types';
import type {
  AxesCoordinateSystem,
  AxisLabelMode,
  AutoRotateMode,
  CameraDisplayMode,
  CameraMode,
  CameraProjection,
  CameraScaleFactor,
  ColorMode,
  FrustumColorMode,
  HorizonLockMode,
  MatchesDisplayMode,
  RigColorMode,
  RigDisplayMode,
  SelectionColorMode,
  UndistortionMode,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getMutablePersistedState(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function getColorMode(value: unknown): ColorMode | undefined {
  switch (value) {
    case 'rgb':
    case 'error':
    case 'trackLength':
    case 'splats':
    case 'splatPoints':
    case 'splatRainbowPoints':
      return value;
    default:
      return undefined;
  }
}

function getMatchesDisplayMode(value: unknown): MatchesDisplayMode | undefined {
  switch (value) {
    case 'static':
    case 'blink':
      return value;
    default:
      return undefined;
  }
}

function getCameraDisplayMode(value: unknown): CameraDisplayMode | undefined {
  switch (value) {
    case 'frustum':
    case 'arrow':
    case 'imageplane':
      return value;
    default:
      return undefined;
  }
}

function getCameraScaleFactor(value: unknown): CameraScaleFactor | undefined {
  switch (value) {
    case '0.1':
    case '1':
    case '10':
      return value;
    default:
      return undefined;
  }
}

function getFrustumColorMode(value: unknown): FrustumColorMode | undefined {
  switch (value) {
    case 'single':
    case 'byCamera':
    case 'byRigFrame':
    case 'splatPsnr':
    case 'splatSsim':
      return value;
    default:
      return undefined;
  }
}

function getCameraMode(value: unknown): CameraMode | undefined {
  switch (value) {
    case 'orbit':
    case 'fly':
      return value;
    default:
      return undefined;
  }
}

function getCameraProjection(value: unknown): CameraProjection | undefined {
  switch (value) {
    case 'perspective':
    case 'orthographic':
      return value;
    default:
      return undefined;
  }
}

function getHorizonLockMode(value: unknown): HorizonLockMode | undefined {
  switch (value) {
    case 'off':
    case 'on':
    case 'flip':
      return value;
    default:
      return undefined;
  }
}

function getAutoRotateMode(value: unknown): AutoRotateMode | undefined {
  switch (value) {
    case 'off':
    case 'cw':
    case 'ccw':
      return value;
    default:
      return undefined;
  }
}

function getSelectionColorMode(value: unknown): SelectionColorMode | undefined {
  switch (value) {
    case 'static':
    case 'blink':
    case 'rainbow':
      return value;
    default:
      return undefined;
  }
}

function getUndistortionMode(value: unknown): UndistortionMode | undefined {
  switch (value) {
    case 'cropped':
    case 'fullFrame':
      return value;
    default:
      return undefined;
  }
}

function getRigDisplayMode(value: unknown): RigDisplayMode | undefined {
  switch (value) {
    case 'static':
    case 'blink':
      return value;
    default:
      return undefined;
  }
}

function getRigColorMode(value: unknown): RigColorMode | undefined {
  switch (value) {
    case 'single':
    case 'perFrame':
      return value;
    default:
      return undefined;
  }
}

function getAxesCoordinateSystem(value: unknown): AxesCoordinateSystem | undefined {
  switch (value) {
    case 'colmap':
    case 'opencv':
    case 'threejs':
    case 'opengl':
    case 'vulkan':
    case 'blender':
    case 'houdini':
    case 'unity':
    case 'unreal':
      return value;
    default:
      return undefined;
  }
}

function getAxisLabelMode(value: unknown): AxisLabelMode | undefined {
  switch (value) {
    case 'off':
    case 'xyz':
    case 'extra':
      return value;
    default:
      return undefined;
  }
}

function getMaxReprojectionError(value: unknown, fallback: number): number {
  if (value === null) {
    return Infinity;
  }

  return getNumber(value) ?? fallback;
}

export function mergePointCloudPersistedState(
  persistedState: unknown,
  currentState: PointCloudState
): PointCloudState {
  const state = getMutablePersistedState(persistedState);
  const legacyShowSplats = getBoolean(state.showSplats) ?? false;
  const colorMode = legacyShowSplats
    ? 'splats'
    : getColorMode(state.colorMode) ?? currentState.colorMode;
  const showPointCloud = legacyShowSplats
    ? true
    : getBoolean(state.showPointCloud) ?? currentState.showPointCloud;

  return {
    ...currentState,
    showPointCloud,
    showSplats: isSplatColorMode(colorMode),
    pointSize: getNumber(state.pointSize) ?? currentState.pointSize,
    pointOpacity: getNumber(state.pointOpacity) ?? currentState.pointOpacity,
    colorMode,
    minTrackLength: getNumber(state.minTrackLength) ?? currentState.minTrackLength,
    maxReprojectionError: getMaxReprojectionError(
      state.maxReprojectionError,
      currentState.maxReprojectionError
    ),
    thinning: getNumber(state.thinning) ?? currentState.thinning,
  };
}

export function migrateCameraPersistedState(
  persistedState: unknown,
  version: number
): Record<string, unknown> {
  const state = getMutablePersistedState(persistedState);

  if (version < 1) {
    state.showCameras = getBoolean(state.showCameras) ?? state.cameraDisplayMode !== 'off';
  }

  if (version < 2) {
    state.showSelectionHighlight = getBoolean(state.showSelectionHighlight) ?? state.selectionColorMode !== 'off';
  }

  if (state.cameraDisplayMode === 'off') {
    state.showCameras = false;
    state.cameraDisplayMode = 'frustum';
  } else if (state.cameraDisplayMode !== undefined) {
    state.cameraDisplayMode = getCameraDisplayMode(state.cameraDisplayMode) ?? 'frustum';
  }

  if (state.selectionColorMode === 'off') {
    state.showSelectionHighlight = false;
    state.selectionColorMode = 'rainbow';
  } else if (state.selectionColorMode !== undefined) {
    state.selectionColorMode = getSelectionColorMode(state.selectionColorMode) ?? 'rainbow';
  }

  if (state.cameraScaleFactor !== undefined) {
    state.cameraScaleFactor = getCameraScaleFactor(state.cameraScaleFactor) ?? '1';
  }
  if (state.frustumColorMode !== undefined) {
    state.frustumColorMode = getFrustumColorMode(state.frustumColorMode) ?? 'byCamera';
  }
  if (state.cameraMode !== undefined) {
    state.cameraMode = getCameraMode(state.cameraMode) ?? 'orbit';
  }
  if (state.cameraProjection !== undefined) {
    state.cameraProjection = getCameraProjection(state.cameraProjection) ?? 'perspective';
  }
  if (state.horizonLock !== undefined) {
    state.horizonLock = getHorizonLockMode(state.horizonLock) ?? 'off';
  }
  if (state.autoRotateMode !== undefined) {
    state.autoRotateMode = getAutoRotateMode(state.autoRotateMode) ?? 'off';
  }
  if (state.undistortionMode !== undefined) {
    state.undistortionMode = getUndistortionMode(state.undistortionMode) ?? 'fullFrame';
  }

  return state;
}

export function migrateRigPersistedState(
  persistedState: unknown,
  version: number
): Record<string, unknown> {
  const state = getMutablePersistedState(persistedState);

  if (version < 1) {
    const mode = getString(state.rigDisplayMode);
    state.showRig = getBoolean(state.showRig) ?? mode !== 'off';
  }

  if (state.rigDisplayMode === 'off') {
    state.showRig = false;
    state.rigDisplayMode = 'static';
  } else if (state.rigDisplayMode !== undefined) {
    state.rigDisplayMode = getRigDisplayMode(state.rigDisplayMode) ?? 'static';
  }

  if (state.rigColorMode !== undefined) {
    state.rigColorMode = getRigColorMode(state.rigColorMode) ?? 'perFrame';
  }

  return state;
}

export function migrateUIPersistedState(
  persistedState: unknown,
  version: number,
  defaultContextMenuActions: readonly unknown[]
): Record<string, unknown> {
  const state = getMutablePersistedState(persistedState);

  if (version < 3) {
    state.contextMenuActions = defaultContextMenuActions;
  }

  if (version < 6) {
    delete state.useWasmParser;
    delete state.liteParserThresholdMB;
    delete state.memoryStrategy;
    delete state.imageLoadMode;
  }

  if (version < 7) {
    const mode = getString(state.axesDisplayMode);
    if (mode === undefined) {
      state.showAxes = getBoolean(state.showAxes) ?? true;
      state.showGrid = getBoolean(state.showGrid) ?? true;
    } else {
      state.showAxes = mode === 'axes' || mode === 'both';
      state.showGrid = mode === 'grid' || mode === 'both';
    }
    delete state.axesDisplayMode;
  }

  if (version < 8) {
    const gizmoMode = getString(state.gizmoMode);
    state.showGizmo = gizmoMode === 'local' || gizmoMode === 'global';
    delete state.gizmoMode;
  }

  if (version < 9) {
    const matchesMode = getString(state.matchesDisplayMode);
    if (getBoolean(state.showMatches) === undefined) {
      state.showMatches = matchesMode !== 'off' && matchesMode !== undefined;
    }
  }

  const matchesMode = getString(state.matchesDisplayMode);
  if (matchesMode === 'off') {
    state.showMatches = false;
    state.matchesDisplayMode = 'static';
  } else if (matchesMode !== undefined) {
    state.matchesDisplayMode = getMatchesDisplayMode(matchesMode) ?? 'static';
  }

  if (state.axesCoordinateSystem !== undefined) {
    state.axesCoordinateSystem = getAxesCoordinateSystem(state.axesCoordinateSystem) ?? 'colmap';
  }

  if (state.axisLabelMode !== undefined) {
    state.axisLabelMode = getAxisLabelMode(state.axisLabelMode) ?? 'extra';
  }

  if (version < 10) {
    const autoHideElements = state.autoHideElements;
    if (isRecord(autoHideElements) && autoHideElements.buttons === undefined) {
      autoHideElements.buttons = true;
    }
  }

  if (version < 12) {
    const autoHideElements = state.autoHideElements;
    if (isRecord(autoHideElements)) {
      autoHideElements.axes = true;
      autoHideElements.grid = true;
      autoHideElements.gizmo = true;
    }
  }

  return state;
}
