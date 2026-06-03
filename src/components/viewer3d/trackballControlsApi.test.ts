import { describe, expect, it, vi } from 'vitest';
import {
  createTrackballControlsApi,
  getTrackballControlsApi,
  isTrackballControlsApi,
  isTrackballDragging,
  setTrackballControlsEnabled,
} from './trackballControlsApi';

function createControls(dragging = false) {
  return createTrackballControlsApi({
    enabled: { current: true },
    dragging: { current: dragging },
    wheelHandled: { current: false },
    getCurrentViewState: vi.fn(() => ({
      position: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
      target: [0, 0, 0],
      distance: 5,
    })),
  });
}

describe('trackballControlsApi', () => {
  it('guards the custom R3F controls shape before exposing the typed API', () => {
    const controls = createControls();

    expect(isTrackballControlsApi(controls)).toBe(true);
    expect(isTrackballControlsApi({ ...controls, wheelHandled: { current: 1 } })).toBe(false);
    expect(isTrackballControlsApi({ ...controls, getCurrentViewState: 'missing' })).toBe(false);
  });

  it('creates controls that satisfy the R3F EventDispatcher controls contract', () => {
    const controls = createControls();
    const onChange = vi.fn();

    controls.addEventListener('change', onChange);
    controls.dispatchEvent({ type: 'change' });

    expect(onChange).toHaveBeenCalledOnce();
  });

  it('returns a typed controls API for the custom R3F controls object', () => {
    const controls = createControls();

    expect(getTrackballControlsApi(controls)).toBe(controls);
  });

  it('rejects missing or malformed controls objects', () => {
    expect(getTrackballControlsApi(null)).toBeUndefined();
    expect(getTrackballControlsApi({})).toBeUndefined();
    expect(getTrackballControlsApi({
      enabled: { current: true },
      dragging: { current: false },
      wheelHandled: { current: false },
      getCurrentViewState: vi.fn(),
    })).toBeUndefined();
    expect(getTrackballControlsApi({ ...createControls(), dragging: { current: 'yes' } })).toBeUndefined();
    expect(getTrackballControlsApi({ ...createControls(), getCurrentViewState: undefined })).toBeUndefined();
  });

  it('reads the current dragging ref without requiring callers to touch ref shape directly', () => {
    const controls = getTrackballControlsApi(createControls(true));

    expect(isTrackballDragging(controls)).toBe(true);
    if (controls) controls.dragging.current = false;
    expect(isTrackballDragging(controls)).toBe(false);
    expect(isTrackballDragging(undefined)).toBe(false);
  });

  it('toggles enabled state without exposing the controls ref shape to callers', () => {
    const controls = getTrackballControlsApi(createControls());

    expect(setTrackballControlsEnabled(controls, false)).toBe(true);
    expect(controls?.enabled.current).toBe(false);

    expect(setTrackballControlsEnabled(controls, true)).toBe(true);
    expect(controls?.enabled.current).toBe(true);

    expect(setTrackballControlsEnabled(undefined, false)).toBe(false);
  });
});
