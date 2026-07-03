import type { Reconstruction } from '../../types/colmap';
import type {
  CameraDisplayMode,
  CameraMode,
  ColorMode,
  MatchesDisplayMode,
  RigDisplayMode,
  SelectionColorMode,
} from '../../store/types';
import { hexToHsl, hslToHex } from '../../utils/colorUtils';
import { cameraModelHasPinholeIntrinsics } from '../../utils/cameraModelRegistry';
import { SensorType } from '../../types/rig';

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface RigInfo {
  hasRigData: boolean;
  cameraCount: number;
  frameCount: number;
}

export interface VisibleModeState<TMode> {
  visible: boolean;
  mode: TMode;
}

export interface AxesGridState {
  showAxes: boolean;
  showGrid: boolean;
}

export interface ViewerControlButtonState<TIcon extends string> {
  icon: TIcon;
  tooltip: string;
  label?: string;
  isActive?: boolean;
  disabled?: boolean;
}

export type AxesGridButtonIcon = 'axesGrid' | 'axes' | 'grid' | 'axesOff';
export type CameraModeButtonIcon = 'orbit' | 'fly';
export type PointCloudButtonIcon =
  | 'pointsOff'
  | 'pointsRgb'
  | 'pointsError'
  | 'pointsTrack'
  | 'pointsSplats'
  | 'pointsSplatPoints'
  | 'pointsSplatRainbow';
export type CameraDisplayButtonIcon = 'cameraOff' | 'frustum' | 'arrow' | 'imageplane';
export type MatchesButtonIcon = 'matchesOff' | 'matchesStatic' | 'matchesBlink';
export type SelectionButtonIcon = 'selectionOff' | 'selectionStatic' | 'selectionBlink' | 'selectionRainbow';
export type RigButtonIcon = 'rigOff' | 'rigStatic' | 'rigBlink';

export interface VisibleModeButtonDescriptor<TMode extends string, TIcon extends string>
  extends ViewerControlButtonState<TIcon> {
  mode: TMode;
}

export interface VisibleModeControlConfig<TMode extends string, TIcon extends string> {
  defaultMode: TMode;
  offButton: ViewerControlButtonState<TIcon>;
  activeButtons: readonly VisibleModeButtonDescriptor<TMode, TIcon>[];
}

export interface ExampleManifest {
  version: number;
  name: string;
  baseUrl: string;
  files: {
    cameras: string;
    images: string;
    points3D: string;
    rigs: string;
    frames: string;
  };
  imagesPath: string;
  masksPath: string;
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '.': '·',
};

export const POINT_CLOUD_MODE_CONTROL = {
  defaultMode: 'rgb',
  offButton: { icon: 'pointsOff', label: 'OFF', tooltip: 'Point Cloud: Off (P)', isActive: false },
  activeButtons: [
    { mode: 'rgb', icon: 'pointsRgb', label: 'RGB', tooltip: 'Point Cloud: RGB (P)' },
    { mode: 'error', icon: 'pointsError', label: 'ERR', tooltip: 'Point Cloud: Error (P)' },
    { mode: 'trackLength', icon: 'pointsTrack', label: 'TRK', tooltip: 'Point Cloud: Track (P)' },
    { mode: 'splats', icon: 'pointsSplats', label: 'SPL', tooltip: 'Point Cloud: Splats (P)' },
    { mode: 'splatPoints', icon: 'pointsSplatPoints', label: 'S+P', tooltip: 'Point Cloud: Splats + Blinking Points (P)' },
    { mode: 'splatRainbowPoints', icon: 'pointsSplatRainbow', label: 'RNB', tooltip: 'Point Cloud: Splats + Rainbow Points (P)' },
  ],
} satisfies VisibleModeControlConfig<ColorMode, PointCloudButtonIcon>;

export const CAMERA_DISPLAY_MODE_CONTROL = {
  defaultMode: 'frustum',
  offButton: { icon: 'cameraOff', label: 'OFF', tooltip: 'Cameras hidden (F)', isActive: false },
  activeButtons: [
    { mode: 'frustum', icon: 'frustum', label: 'FRM', tooltip: 'Frustum mode (F)' },
    { mode: 'arrow', icon: 'arrow', label: 'ARW', tooltip: 'Arrow mode (F)' },
    { mode: 'imageplane', icon: 'imageplane', label: 'IMG', tooltip: 'Image plane mode (F)' },
  ],
} satisfies VisibleModeControlConfig<CameraDisplayMode, CameraDisplayButtonIcon>;

export const MATCHES_DISPLAY_MODE_CONTROL = {
  defaultMode: 'static',
  offButton: { icon: 'matchesOff', tooltip: 'Matches off (M)', isActive: false },
  activeButtons: [
    { mode: 'static', icon: 'matchesStatic', tooltip: 'Matches static (M)' },
    { mode: 'blink', icon: 'matchesBlink', tooltip: 'Matches blink (M)' },
  ],
} satisfies VisibleModeControlConfig<MatchesDisplayMode, MatchesButtonIcon>;

export const SELECTION_COLOR_MODE_CONTROL = {
  defaultMode: 'static',
  offButton: { icon: 'selectionOff', tooltip: 'Selection off', isActive: false },
  activeButtons: [
    { mode: 'static', icon: 'selectionStatic', tooltip: 'Static color' },
    { mode: 'blink', icon: 'selectionBlink', tooltip: 'Blink' },
    { mode: 'rainbow', icon: 'selectionRainbow', tooltip: 'Rainbow' },
  ],
} satisfies VisibleModeControlConfig<SelectionColorMode, SelectionButtonIcon>;

export const RIG_DISPLAY_MODE_CONTROL = {
  defaultMode: 'static',
  offButton: { icon: 'rigOff', label: 'OFF', tooltip: 'Rig connections off', isActive: false, disabled: false },
  activeButtons: [
    { mode: 'static', icon: 'rigStatic', label: 'RIG', tooltip: 'Rig static' },
    { mode: 'blink', icon: 'rigBlink', label: 'BLK', tooltip: 'Rig blink' },
  ],
} satisfies VisibleModeControlConfig<RigDisplayMode, RigButtonIcon>;

export function toSuperscript(value: number): string {
  const str = value.toFixed(1);
  return str.split('').map(char => SUPERSCRIPT_DIGITS[char] || char).join('');
}

export function buildRigInfo(reconstruction: Reconstruction | null): RigInfo {
  if (!reconstruction) {
    return { hasRigData: false, cameraCount: 0, frameCount: 0 };
  }

  const rigDataInfo = buildRigInfoFromParsedData(reconstruction);
  if (rigDataInfo) {
    return rigDataInfo;
  }

  return buildRigInfoFromImageNames(reconstruction);
}

function buildRigInfoFromParsedData(reconstruction: Reconstruction): RigInfo | null {
  if (!reconstruction.rigData) {
    return null;
  }

  let multiCameraFrames = 0;
  let maxCameras = 0;

  for (const frame of reconstruction.rigData.frames.values()) {
    let cameraCount = 0;

    for (const data of frame.dataIds) {
      if (data.sensorId.type === SensorType.CAMERA && reconstruction.images.has(data.dataId)) {
        cameraCount++;
      }
    }

    if (cameraCount < 2) continue;

    multiCameraFrames++;
    maxCameras = Math.max(maxCameras, cameraCount);
  }

  return {
    hasRigData: multiCameraFrames > 0,
    cameraCount: maxCameras,
    frameCount: multiCameraFrames,
  };
}

function buildRigInfoFromImageNames(reconstruction: Reconstruction): RigInfo {
  const frameGroups = new Map<string, number>();
  for (const image of reconstruction.images.values()) {
    const parts = image.name.split(/[/\\]/);
    const frameId = parts.length >= 2 ? parts[parts.length - 1] : image.name;
    frameGroups.set(frameId, (frameGroups.get(frameId) ?? 0) + 1);
  }

  let multiCameraFrames = 0;
  let maxCameras = 0;
  for (const count of frameGroups.values()) {
    if (count < 2) continue;

    multiCameraFrames++;
    maxCameras = Math.max(maxCameras, count);
  }

  return {
    hasRigData: multiCameraFrames > 0,
    cameraCount: maxCameras,
    frameCount: multiCameraFrames,
  };
}

/**
 * Whether the reconstruction contains at least one non-spherical (pinhole-family) camera.
 * A reconstruction with no cameras — or no reconstruction at all — is treated as having
 * pinhole cameras so the default panel controls stay visible; only a genuinely
 * spherical-only dataset returns false.
 */
export function reconstructionHasPinholeCameras(reconstruction: Reconstruction | null): boolean {
  if (!reconstruction || reconstruction.cameras.size === 0) {
    return true;
  }

  for (const camera of reconstruction.cameras.values()) {
    if (cameraModelHasPinholeIntrinsics(camera.modelId)) {
      return true;
    }
  }

  return false;
}

export function syncHslWithHex(currentHsl: HslColor, nextHex: string): HslColor {
  return hslToHex(currentHsl.h, currentHsl.s, currentHsl.l) !== nextHex
    ? hexToHsl(nextHex)
    : currentHsl;
}

export function getToggledBackgroundHsl(currentHsl: HslColor): HslColor {
  return {
    h: 0,
    s: 0,
    l: currentHsl.l < 50 ? 100 : 0,
  };
}

export function getNextPointColorState(
  visible: boolean,
  mode: ColorMode
): VisibleModeState<ColorMode> {
  return getNextVisibleModeState(POINT_CLOUD_MODE_CONTROL, visible, mode);
}

export function getNextCameraDisplayState(
  visible: boolean,
  mode: CameraDisplayMode
): VisibleModeState<CameraDisplayMode> {
  return getNextVisibleModeState(CAMERA_DISPLAY_MODE_CONTROL, visible, mode);
}

export function getNextMatchesDisplayState(
  visible: boolean,
  mode: MatchesDisplayMode
): VisibleModeState<MatchesDisplayMode> {
  return getNextVisibleModeState(MATCHES_DISPLAY_MODE_CONTROL, visible, mode);
}

export function getNextSelectionColorState(
  visible: boolean,
  mode: SelectionColorMode
): VisibleModeState<SelectionColorMode> {
  return getNextVisibleModeState(SELECTION_COLOR_MODE_CONTROL, visible, mode);
}

export function getNextRigDisplayState(
  visible: boolean,
  mode: RigDisplayMode
): VisibleModeState<RigDisplayMode> {
  return getNextVisibleModeState(RIG_DISPLAY_MODE_CONTROL, visible, mode);
}

export function getNextAxesGridState(showAxes: boolean, showGrid: boolean): AxesGridState {
  if (showAxes && showGrid) return { showAxes: true, showGrid: false };
  if (showAxes && !showGrid) return { showAxes: false, showGrid: true };
  if (!showAxes && showGrid) return { showAxes: false, showGrid: false };
  return { showAxes: true, showGrid: true };
}

export function getAxesGridButtonState(
  showAxes: boolean,
  showGrid: boolean
): ViewerControlButtonState<AxesGridButtonIcon> {
  if (showAxes && showGrid) {
    return { icon: 'axesGrid', label: 'A+G', tooltip: 'Axes & Grid (G)', isActive: true };
  }
  if (showAxes) {
    return { icon: 'axes', label: 'AXS', tooltip: 'Axes & Grid (G)', isActive: true };
  }
  if (showGrid) {
    return { icon: 'grid', label: 'GRD', tooltip: 'Axes & Grid (G)', isActive: true };
  }
  return { icon: 'axesOff', label: 'OFF', tooltip: 'Axes & Grid (G)', isActive: false };
}

export function getCameraModeButtonState(
  mode: CameraMode
): ViewerControlButtonState<CameraModeButtonIcon> {
  return mode === 'orbit'
    ? { icon: 'orbit', label: 'ORB', tooltip: 'Orbit mode (C)' }
    : { icon: 'fly', label: 'FLY', tooltip: 'Fly mode (C)' };
}

export function getPointCloudButtonState(
  visible: boolean,
  mode: ColorMode
): ViewerControlButtonState<PointCloudButtonIcon> {
  return getVisibleModeButtonState(POINT_CLOUD_MODE_CONTROL, visible, mode);
}

export function getCameraDisplayButtonState(
  visible: boolean,
  mode: CameraDisplayMode
): ViewerControlButtonState<CameraDisplayButtonIcon> {
  return getVisibleModeButtonState(CAMERA_DISPLAY_MODE_CONTROL, visible, mode);
}

export function getMatchesButtonState(
  visible: boolean,
  mode: MatchesDisplayMode
): ViewerControlButtonState<MatchesButtonIcon> {
  return getVisibleModeButtonState(MATCHES_DISPLAY_MODE_CONTROL, visible, mode);
}

export function getSelectionButtonState(
  visible: boolean,
  mode: SelectionColorMode
): ViewerControlButtonState<SelectionButtonIcon> {
  return getVisibleModeButtonState(SELECTION_COLOR_MODE_CONTROL, visible, mode);
}

export function getRigButtonState(
  hasRigData: boolean,
  visible: boolean,
  mode: RigDisplayMode
): ViewerControlButtonState<RigButtonIcon> {
  if (!hasRigData) {
    return {
      icon: 'rigOff',
      label: 'N/A',
      tooltip: 'Rig not available',
      isActive: false,
      disabled: true,
    };
  }

  if (!visible) {
    return RIG_DISPLAY_MODE_CONTROL.offButton;
  }

  return getVisibleModeButtonState(RIG_DISPLAY_MODE_CONTROL, visible, mode);
}

function getNextVisibleModeState<TMode extends string, TIcon extends string>(
  config: VisibleModeControlConfig<TMode, TIcon>,
  visible: boolean,
  mode: TMode,
): VisibleModeState<TMode> {
  if (!visible) return { visible: true, mode: config.defaultMode };

  const currentIndex = config.activeButtons.findIndex((button) => button.mode === mode);
  const next = currentIndex >= 0 ? config.activeButtons[currentIndex + 1] : undefined;
  return next ? { visible: true, mode: next.mode } : { visible: false, mode };
}

function getVisibleModeButtonState<TMode extends string, TIcon extends string>(
  config: VisibleModeControlConfig<TMode, TIcon>,
  visible: boolean,
  mode: TMode,
): ViewerControlButtonState<TIcon> {
  if (!visible) return config.offButton;

  const descriptor = config.activeButtons.find((button) => button.mode === mode)
    ?? config.activeButtons[0];
  const { mode: _mode, ...buttonState } = descriptor;
  return { ...buttonState, isActive: true };
}

export function buildExampleManifest(): ExampleManifest {
  return {
    version: 1,
    name: 'NGS Lady Bug Toy',
    baseUrl: 'https://huggingface.co/datasets/OpsiClear/NGS/resolve/main/objects/scan_20250714_170841_lady_bug_toy',
    files: {
      cameras: 'sparse/0/cameras.bin',
      images: 'sparse/0/images.bin',
      points3D: 'sparse/0/points3D.bin',
      rigs: 'sparse/0/rigs.bin',
      frames: 'sparse/0/frames.bin',
    },
    imagesPath: 'images/',
    masksPath: 'masks/',
  };
}

export function buildExampleManifestJson(): string {
  return JSON.stringify(buildExampleManifest(), null, 2);
}
