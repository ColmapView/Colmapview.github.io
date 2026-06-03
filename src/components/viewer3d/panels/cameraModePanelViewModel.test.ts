import { describe, expect, it } from 'vitest';
import {
  AUTO_ROTATE_MODE_OPTIONS,
  CAMERA_MODE_KEYBOARD_HINT_LINES,
  CAMERA_MODE_MODIFIER_HINT_LINES,
  CAMERA_MODE_OPTIONS,
  HORIZON_LOCK_OPTIONS,
  formatFlyTransitionDuration,
  getCameraModeMouseHintLines,
  getSupportedCameraMode,
  shouldShowAutoRotateControls,
} from './cameraModePanelViewModel';

describe('camera mode panel view-model helpers', () => {
  it('defines stable camera mode labels', () => {
    expect(CAMERA_MODE_OPTIONS).toEqual([
      { value: 'orbit', label: 'Orbit' },
      { value: 'fly', label: 'Fly' },
    ]);
  });

  it('defines stable horizon lock labels', () => {
    expect(HORIZON_LOCK_OPTIONS).toEqual([
      { value: 'off', label: 'Off' },
      { value: 'on', label: 'On' },
      { value: 'flip', label: 'Flip' },
    ]);
  });

  it('defines stable auto rotate labels', () => {
    expect(AUTO_ROTATE_MODE_OPTIONS).toEqual([
      { value: 'off', label: 'Off' },
      { value: 'cw', label: 'Clockwise' },
      { value: 'ccw', label: 'Counter-CW' },
    ]);
  });

  it('formats fly transition duration labels', () => {
    expect(formatFlyTransitionDuration(0)).toBe('Off');
    expect(formatFlyTransitionDuration(100)).toBe('0.1s');
    expect(formatFlyTransitionDuration(1250)).toBe('1.3s');
  });

  it('shows auto rotate controls only in orbit mode', () => {
    expect(shouldShowAutoRotateControls('orbit')).toBe(true);
    expect(shouldShowAutoRotateControls('fly')).toBe(false);
  });

  it('returns mouse help by camera mode', () => {
    expect(getCameraModeMouseHintLines('orbit')).toEqual([
      'Left drag: Rotate',
      'Right/Mid drag: Pan',
      'Scroll: Zoom',
    ]);
    expect(getCameraModeMouseHintLines('fly')).toEqual([
      'Left drag: Look around',
      'Right/Mid drag: Strafe',
      'Scroll: Move fwd/back',
      'Shift+drag: Faster',
    ]);
  });

  it('falls back to orbit mouse help for stale camera modes', () => {
    expect(getSupportedCameraMode('trackball')).toBeNull();
    expect(shouldShowAutoRotateControls('trackball')).toBe(false);
    expect(getCameraModeMouseHintLines('trackball')).toEqual([
      'Left drag: Rotate',
      'Right/Mid drag: Pan',
      'Scroll: Zoom',
    ]);
  });

  it('keeps stable keyboard and modifier help lines', () => {
    expect(CAMERA_MODE_KEYBOARD_HINT_LINES).toEqual([
      'WASD: Move',
      'Q: Down, E/Space: Up',
      'Shift: Speed boost',
    ]);
    expect(CAMERA_MODE_MODIFIER_HINT_LINES).toEqual([
      'Alt+Scroll: Camera size',
      'Ctrl+Scroll: Point size',
    ]);
  });
});
