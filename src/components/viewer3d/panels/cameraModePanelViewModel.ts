import type {
  AutoRotateMode,
  CameraMode,
  HorizonLockMode,
} from '../../../store/types';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export const CAMERA_MODE_OPTIONS: SelectOption<CameraMode>[] = [
  { value: 'orbit', label: 'Orbit' },
  { value: 'fly', label: 'Fly' },
];

export const HORIZON_LOCK_OPTIONS: SelectOption<HorizonLockMode>[] = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
  { value: 'flip', label: 'Flip' },
];

export const AUTO_ROTATE_MODE_OPTIONS: SelectOption<AutoRotateMode>[] = [
  { value: 'off', label: 'Off' },
  { value: 'cw', label: 'Clockwise' },
  { value: 'ccw', label: 'Counter-CW' },
];

const CAMERA_MODE_MOUSE_HINT_LINES: Record<CameraMode, string[]> = {
  orbit: [
    'Left drag: Rotate',
    'Right/Mid drag: Pan',
    'Scroll: Zoom',
  ],
  fly: [
    'Left drag: Look around',
    'Right/Mid drag: Strafe',
    'Scroll: Move fwd/back',
    'Shift+drag: Faster',
  ],
};

export function getSupportedCameraMode(value: string): CameraMode | null {
  if (value === 'orbit' || value === 'fly') return value;
  return null;
}

export const CAMERA_MODE_KEYBOARD_HINT_LINES = [
  'WASD: Move',
  'Q: Down, E/Space: Up',
  'Shift: Speed boost',
];

export const CAMERA_MODE_MODIFIER_HINT_LINES = [
  'Alt+Scroll: Camera size',
  'Ctrl+Scroll: Point size',
];

export function formatFlyTransitionDuration(durationMs: number): string {
  return durationMs === 0 ? 'Off' : `${(durationMs / 1000).toFixed(1)}s`;
}

export function shouldShowAutoRotateControls(cameraMode: CameraMode | string): boolean {
  return getSupportedCameraMode(cameraMode) === 'orbit';
}

export function getCameraModeMouseHintLines(cameraMode: CameraMode | string): string[] {
  return CAMERA_MODE_MOUSE_HINT_LINES[getSupportedCameraMode(cameraMode) ?? 'orbit'];
}
